// Assignment / deadline tracker with Microsoft To Do sync.

import { store } from "../store.js";
import { esc, openModal, closeModal, toast } from "../ui.js";
import {
  uid,
  today,
  addDays,
  mondayOf,
  fromISODate,
  toISODate,
  sortedCourses,
  TASK_TYPES,
  TASK_TYPE_LABELS,
} from "../models.js";
import { isConfigured, getAccount, signIn } from "../auth.js";
import { syncNow, isSyncing, summaryText } from "../sync.js";

let filterCourse = "";
const expanded = new Set();

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dueLabel(iso) {
  if (!iso) return "no date";
  const d = fromISODate(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

export function render(container) {
  const courses = sortedCourses(store.getCourses());
  const tasks = store.getTasks();
  const settings = store.getSettings();
  const account = getAccount();

  const shown = filterCourse ? tasks.filter((t) => t.courseId === filterCourse) : tasks;
  const t0 = today();
  const weekStart = mondayOf(t0);
  const weekEnd = addDays(weekStart, 6);

  const groups = { overdue: [], thisweek: [], later: [], done: [] };
  for (const t of shown) {
    if (t.status === "done") groups.done.push(t);
    else if (t.dueDate && fromISODate(t.dueDate) < t0) groups.overdue.push(t);
    else if (t.dueDate && fromISODate(t.dueDate) <= weekEnd) groups.thisweek.push(t);
    else groups.later.push(t);
  }
  const byDue = (a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
  groups.overdue.sort(byDue);
  groups.thisweek.sort(byDue);
  groups.later.sort(byDue);
  groups.done.sort((a, b) => byDue(b, a));

  const courseOf = (id) => courses.find((c) => c.id === id);

  const taskHtml = (t) => {
    const c = courseOf(t.courseId);
    const isOpen = expanded.has(t.id);
    const overdue = t.status !== "done" && t.dueDate && fromISODate(t.dueDate) < t0;
    const syncChip = t.unlinked
      ? `<span class="chip" title="Deleted in To Do — no longer synced">unlinked</span>`
      : !t.graph && isConfigured()
        ? `<span class="chip" title="Will be pushed to To Do on next sync">local</span>`
        : "";
    const subCount = t.subItems?.length
      ? `<span class="chip mono">${t.subItems.filter((s) => s.done).length}/${t.subItems.length}</span>`
      : "";
    return `
    <div class="task-item ${t.status === "done" ? "done" : ""}" data-id="${t.id}">
      <div class="task-main">
        <input type="checkbox" data-check ${t.status === "done" ? "checked" : ""} title="Mark ${t.status === "done" ? "open" : "done"}">
        <span class="task-title">${esc(t.title)}</span>
        ${c ? `<span class="chip course-chip" style="border-color:${esc(c.color)};color:${esc(c.color)}">${esc(c.shortName)}</span>` : ""}
        <span class="chip">${TASK_TYPE_LABELS[t.type] ?? esc(t.type)}</span>
        ${subCount}${syncChip}
        <span class="task-due ${overdue ? "overdue" : ""}">${dueLabel(t.dueDate)}</span>
        <button class="expander" data-expand title="Details">${isOpen ? "▾" : "▸"}</button>
      </div>
      ${
        isOpen
          ? `<div class="task-detail">
              ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
              ${(t.subItems ?? [])
                .map(
                  (s) => `<label class="subitem ${s.done ? "done" : ""}">
                    <input type="checkbox" data-sub="${s.id}" ${s.done ? "checked" : ""}><span>${esc(s.title)}</span>
                  </label>`
                )
                .join("")}
              <div class="row-actions">
                <button class="btn small" data-edit>Edit</button>
                <button class="btn small danger" data-delete>Delete</button>
              </div>
            </div>`
          : ""
      }
    </div>`;
  };

  const groupHtml = (key, title, list, cls = "") =>
    list.length
      ? `<div class="task-group ${cls}"><h2>${title} · ${list.length}</h2>
         <div class="task-list">${list.map(taskHtml).join("")}</div></div>`
      : "";

  const syncArea = !isConfigured()
    ? `<span class="sync-status">To Do sync <a href="#/settings">not configured</a></span>`
    : !account
      ? `<button class="btn small" id="btn-signin">Sign in for To Do sync</button>`
      : `<button class="btn small" id="btn-sync" ${isSyncing() ? "disabled" : ""}>⟳ Sync</button>
         <span class="sync-status">${
           settings.todo.lastSyncAt
             ? "last " + new Date(settings.todo.lastSyncAt).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" })
             : "never synced"
         }</span>`;

  container.innerHTML = `
    <div class="tasks-page">
    <div class="page-head">
      <h1>Tasks</h1>
      <span class="spacer"></span>
      ${syncArea}
    </div>
    <div class="tasks-toolbar">
      <button class="btn primary" id="btn-new">+ New task</button>
      <select id="filter-course">
        <option value="">All courses</option>
        ${courses.map((c) => `<option value="${c.id}" ${c.id === filterCourse ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
    </div>
    ${groupHtml("overdue", "Overdue", groups.overdue, "overdue")}
    ${groupHtml("thisweek", "This week", groups.thisweek)}
    ${groupHtml("later", "Later / no date", groups.later)}
    ${groupHtml("done", "Done", groups.done)}
    ${shown.length ? "" : `<p class="dim">No tasks yet — create one, or sync to pull tasks from Microsoft To Do.</p>`}
    </div>
  `;
  const page = container.querySelector(".tasks-page");

  container.querySelector("#filter-course").onchange = (e) => {
    filterCourse = e.target.value;
    render(container);
  };
  container.querySelector("#btn-new").onclick = () => openTaskEditor(null, () => render(container));

  const signinBtn = container.querySelector("#btn-signin");
  if (signinBtn) signinBtn.onclick = () => signIn().catch((e) => toast(e.message, "error"));
  const syncBtn = container.querySelector("#btn-sync");
  if (syncBtn) {
    syncBtn.onclick = async () => {
      syncBtn.disabled = true;
      try {
        const summary = await syncNow();
        toast(summaryText(summary));
      } catch (e) {
        toast("Sync failed: " + e.message, "error");
      }
      render(container);
    };
  }

  page.addEventListener("click", (e) => {
    const item = e.target.closest(".task-item");
    if (!item) return;
    const id = item.dataset.id;
    const tasks2 = store.getTasks();
    const task = tasks2.find((t) => t.id === id);
    if (!task) return;

    if (e.target.closest("[data-expand]")) {
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      render(container);
    } else if (e.target.matches("[data-check]")) {
      task.status = e.target.checked ? "done" : "open";
      store.saveTasks(tasks2);
      backgroundSync(container);
      render(container);
    } else if (e.target.matches("[data-sub]")) {
      const si = task.subItems?.find((s) => s.id === e.target.dataset.sub);
      if (si) si.done = e.target.checked;
      store.saveTasks(tasks2);
      backgroundSync(container);
      render(container);
    } else if (e.target.closest("[data-edit]")) {
      openTaskEditor(task, () => render(container));
    } else if (e.target.closest("[data-delete]")) {
      if (!confirm(`Delete task "${task.title}"?${task.graph ? " It will also be removed from Microsoft To Do." : ""}`)) return;
      if (task.graph?.taskId) {
        const tomb = store.getTombstones();
        tomb.tasks.push(task.graph.taskId);
        store.saveTombstones(tomb);
      }
      store.saveTasks(tasks2.filter((t) => t.id !== id));
      backgroundSync(container);
      render(container);
    }
  });
}

/** Push local changes quietly if signed in; UI refresh on completion. */
function backgroundSync(container) {
  if (!isConfigured() || !getAccount() || isSyncing()) return;
  syncNow()
    .then(() => {
      if (document.contains(container)) render(container);
    })
    .catch((e) => console.warn("Background sync failed:", e));
}

function openTaskEditor(task, onSaved) {
  const courses = sortedCourses(store.getCourses());
  const isNew = !task;
  const t = task ?? {
    id: uid(),
    title: "",
    courseId: courses[0]?.id ?? null,
    dueDate: toISODate(addDays(today(), 7)),
    type: "homework",
    status: "open",
    note: "",
    subItems: [],
    graph: null,
  };

  const subRow = (s = { id: uid(), title: "", done: false, graphId: null }) => `
    <div class="subitem-edit" data-sid="${s.id}" data-graphid="${esc(s.graphId ?? "")}">
      <input type="text" placeholder="Sub-item (e.g. Problem 1)" value="${esc(s.title)}">
      <button type="button" class="icon-btn" data-del-sub title="Remove">✕</button>
    </div>`;

  const modal = openModal(
    isNew ? "New task" : "Edit task",
    `
    <label class="field"><span>Title</span>
      <input type="text" id="t-title" value="${esc(t.title)}" placeholder="e.g. Problem set 3">
    </label>
    <div class="field-row">
      <label class="field"><span>Course</span>
        <select id="t-course">
          <option value="">— none —</option>
          ${courses.map((c) => `<option value="${c.id}" ${c.id === t.courseId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span>Type</span>
        <select id="t-type">
          ${TASK_TYPES.map((ty) => `<option value="${ty}" ${ty === t.type ? "selected" : ""}>${TASK_TYPE_LABELS[ty]}</option>`).join("")}
        </select>
      </label>
    </div>
    <label class="field"><span>Due date</span>
      <input type="date" id="t-due" value="${esc(t.dueDate ?? "")}">
    </label>
    <label class="field"><span>Note</span>
      <textarea id="t-note">${esc(t.note)}</textarea>
    </label>
    <label class="field"><span>Sub-items (sync as To Do checklist steps)</span></label>
    <div id="t-subs">${(t.subItems ?? []).map(subRow).join("")}</div>
    <button type="button" class="btn small" id="add-sub">+ Add sub-item</button>
    `,
    `<button class="btn" data-cancel>Cancel</button>
     <button class="btn primary" data-save>${isNew ? "Create" : "Save"}</button>`
  );

  const subsBox = modal.querySelector("#t-subs");
  modal.querySelector("#add-sub").onclick = () => subsBox.insertAdjacentHTML("beforeend", subRow());
  subsBox.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-sub]");
    if (del) del.closest(".subitem-edit").remove();
  });

  modal.querySelector("[data-cancel]").onclick = closeModal;
  modal.querySelector("[data-save]").onclick = () => {
    const title = modal.querySelector("#t-title").value.trim();
    if (!title) return toast("Title is required.", "error");

    const oldSubs = t.subItems ?? [];
    const newSubs = [];
    for (const row of subsBox.querySelectorAll(".subitem-edit")) {
      const titleInput = row.querySelector("input");
      if (!titleInput.value.trim()) continue;
      const prev = oldSubs.find((s) => s.id === row.dataset.sid);
      newSubs.push({
        id: row.dataset.sid,
        title: titleInput.value.trim(),
        done: prev?.done ?? false,
        graphId: prev?.graphId ?? null,
        lastSyncedChecked: prev?.lastSyncedChecked,
      });
    }
    // Tombstone checklist items that were removed and had synced.
    if (t.graph?.taskId) {
      const keptIds = new Set(newSubs.map((s) => s.id));
      const tomb = store.getTombstones();
      for (const s of oldSubs) {
        if (s.graphId && !keptIds.has(s.id)) {
          tomb.checklist.push({ taskId: t.graph.taskId, itemId: s.graphId });
        }
      }
      store.saveTombstones(tomb);
    }

    t.title = title;
    t.courseId = modal.querySelector("#t-course").value || null;
    t.type = modal.querySelector("#t-type").value;
    t.dueDate = modal.querySelector("#t-due").value || null;
    t.note = modal.querySelector("#t-note").value;
    t.subItems = newSubs;
    t.updatedAt = new Date().toISOString();

    const tasks = store.getTasks();
    if (isNew) tasks.push(t);
    else {
      const i = tasks.findIndex((x) => x.id === t.id);
      if (i >= 0) tasks[i] = t;
      else tasks.push(t);
    }
    store.saveTasks(tasks);
    closeModal();
    onSaved();
    if (isConfigured() && getAccount() && !isSyncing()) {
      syncNow().then(() => onSaved()).catch((e) => console.warn("Background sync failed:", e));
    }
  };
}
