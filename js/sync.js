// Two-way sync between planner tasks and a dedicated Microsoft
// To Do list.
//
// Rules (v1):
// - Completion state syncs both ways using a 3-way compare against
//   the state recorded at last sync (graph.lastStatus /
//   subItem.lastSyncedChecked), so un-checking propagates too.
// - Title/due-date/note: planner wins if edited locally since the
//   last sync, otherwise remote edits are adopted (last-write-wins,
//   no merge UI).
// - Sub-items sync as real To Do checklist items.
// - Tasks deleted locally are removed remotely via tombstones;
//   tasks deleted remotely become "unlinked" locally (kept, flagged).
// - Remote tasks created directly in To Do are imported (no course).

import { store } from "./store.js";
import { graph } from "./graph.js";
import { uid } from "./models.js";
import { DEFAULT_TODO_LIST_NAME } from "./config.js";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

let running = false;
export const isSyncing = () => running;

function graphPayload(task, courses) {
  const course = courses.find((c) => c.id === task.courseId);
  const lines = [];
  if (course) lines.push(`Course: ${course.shortName || course.name}`);
  if (task.note) lines.push("", task.note);
  return {
    title: task.title,
    body: { content: lines.join("\n"), contentType: "text" },
    dueDateTime: task.dueDate
      ? { dateTime: `${task.dueDate}T00:00:00.0000000`, timeZone: TZ }
      : null,
  };
}

const remoteStatusOf = (remote) => (remote.status === "completed" ? "done" : "open");
const toGraphStatus = (status) => (status === "done" ? "completed" : "notStarted");
const remoteDueOf = (remote) => remote.dueDateTime?.dateTime?.slice(0, 10) ?? null;

async function pushChecklistItem(listId, taskId, si) {
  const created = await graph.createChecklistItem(listId, taskId, {
    displayName: si.title,
    isChecked: !!si.done,
  });
  si.graphId = created.id;
  si.lastSyncedChecked = !!si.done;
}

/** Merge one linked task's checklist with its remote checklist items. */
async function syncChecklist(listId, task, remote, localFieldsChanged) {
  const remoteItems = new Map((remote.checklistItems ?? []).map((i) => [i.id, i]));
  const merged = [];
  for (const si of task.subItems ?? []) {
    if (!si.graphId) {
      await pushChecklistItem(listId, task.graph.taskId, si);
      merged.push(si);
      continue;
    }
    const ri = remoteItems.get(si.graphId);
    if (!ri) continue; // deleted in To Do → mirror the deletion locally
    remoteItems.delete(si.graphId);

    const last = !!si.lastSyncedChecked;
    const patch = {};
    if (!!si.done !== last && !!si.done !== !!ri.isChecked) {
      patch.isChecked = !!si.done; // local change wins
    } else if (!!ri.isChecked !== last) {
      si.done = !!ri.isChecked; // remote change adopted
    }
    if (ri.displayName !== si.title) {
      if (localFieldsChanged) patch.displayName = si.title;
      else si.title = ri.displayName;
    }
    if (Object.keys(patch).length) {
      await graph.updateChecklistItem(listId, task.graph.taskId, si.graphId, patch);
    }
    si.lastSyncedChecked = !!si.done;
    merged.push(si);
  }
  // Items added directly in To Do.
  for (const ri of remoteItems.values()) {
    merged.push({
      id: uid(),
      title: ri.displayName,
      done: !!ri.isChecked,
      graphId: ri.id,
      lastSyncedChecked: !!ri.isChecked,
    });
  }
  task.subItems = merged;
}

/**
 * Run a full sync. Returns a summary object.
 * Throws on auth/network errors — callers surface via toast.
 */
export async function syncNow() {
  if (running) throw new Error("Sync already running.");
  running = true;
  try {
    const settings = store.getSettings();
    const courses = store.getCourses();
    const tasks = store.getTasks();
    const summary = { created: 0, updated: 0, pulled: 0, imported: 0, unlinked: 0 };
    const now = new Date().toISOString();
    const listName = settings.todo.listName || DEFAULT_TODO_LIST_NAME;

    // 1. Find or create the dedicated list.
    const lists = await graph.getLists();
    let list =
      (settings.todo.listId && lists.find((l) => l.id === settings.todo.listId)) ||
      lists.find((l) => l.displayName === listName);
    if (!list) list = await graph.createList(listName);
    const listId = list.id;

    // 2. Apply local deletions that happened since last sync.
    const tomb = store.getTombstones();
    for (const taskId of tomb.tasks) {
      try {
        await graph.deleteTask(listId, taskId);
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    for (const { taskId, itemId } of tomb.checklist) {
      try {
        await graph.deleteChecklistItem(listId, taskId, itemId);
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    store.saveTombstones({ tasks: [], checklist: [] });

    // 3. Fetch remote state.
    const remoteTasks = await graph.getTasks(listId);
    const remoteById = new Map(remoteTasks.map((t) => [t.id, t]));

    for (const task of tasks) {
      // 3a. Local-only → create remotely.
      if (!task.graph?.taskId) {
        const payload = graphPayload(task, courses);
        payload.status = toGraphStatus(task.status);
        const created = await graph.createTask(listId, payload);
        task.graph = { taskId: created.id, listId, lastSyncedAt: now, lastStatus: task.status };
        task.unlinked = false;
        for (const si of task.subItems ?? []) {
          await pushChecklistItem(listId, created.id, si);
        }
        summary.created++;
        continue;
      }

      const remote = remoteById.get(task.graph.taskId);
      if (!remote) {
        // 3b. Deleted in To Do → keep local data, flag as unlinked.
        task.graph = null;
        task.unlinked = true;
        summary.unlinked++;
        continue;
      }
      remoteById.delete(task.graph.taskId);

      // 3c. Completion: 3-way compare so un-checking propagates.
      const remoteStatus = remoteStatusOf(remote);
      const lastStatus = task.graph.lastStatus ?? "open";
      let pushStatus = false;
      if (task.status !== lastStatus && task.status !== remoteStatus) {
        pushStatus = true;
      } else if (remoteStatus !== lastStatus && remoteStatus !== task.status) {
        task.status = remoteStatus;
        summary.pulled++;
      }

      // 3d. Fields: planner wins if locally edited since last sync.
      const localFieldsChanged =
        !task.graph.lastSyncedAt || (task.updatedAt ?? "") > task.graph.lastSyncedAt;
      let patch = null;
      if (localFieldsChanged) {
        patch = graphPayload(task, courses);
      } else {
        if (remote.title && remote.title !== task.title) {
          task.title = remote.title;
          summary.pulled++;
        }
        const rd = remoteDueOf(remote);
        if (rd !== (task.dueDate || null)) task.dueDate = rd;
      }
      if (pushStatus) {
        patch = patch ?? {};
        patch.status = toGraphStatus(task.status);
      }
      if (patch) {
        await graph.updateTask(listId, task.graph.taskId, patch);
        summary.updated++;
      }

      // 3e. Checklist items.
      await syncChecklist(listId, task, remote, localFieldsChanged);

      task.graph.listId = listId;
      task.graph.lastStatus = task.status;
      task.graph.lastSyncedAt = now;
    }

    // 4. Import tasks created directly in To Do.
    for (const remote of remoteById.values()) {
      const status = remoteStatusOf(remote);
      tasks.push({
        id: uid(),
        title: remote.title || "(untitled)",
        courseId: null,
        dueDate: remoteDueOf(remote),
        type: "homework",
        status,
        note: "",
        updatedAt: now,
        subItems: (remote.checklistItems ?? []).map((ri) => ({
          id: uid(),
          title: ri.displayName,
          done: !!ri.isChecked,
          graphId: ri.id,
          lastSyncedChecked: !!ri.isChecked,
        })),
        graph: { taskId: remote.id, listId, lastSyncedAt: now, lastStatus: status },
      });
      summary.imported++;
    }

    store.saveTasks(tasks);
    settings.todo.listId = listId;
    settings.todo.listName = listName;
    settings.todo.lastSyncAt = now;
    store.saveSettings(settings);
    return summary;
  } finally {
    running = false;
  }
}

export function summaryText(s) {
  const parts = [];
  if (s.created) parts.push(`${s.created} pushed`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.pulled) parts.push(`${s.pulled} pulled`);
  if (s.imported) parts.push(`${s.imported} imported`);
  if (s.unlinked) parts.push(`${s.unlinked} unlinked`);
  return parts.length ? `Synced: ${parts.join(", ")}` : "Synced: everything up to date";
}
