// Settings view + first-run onboarding wizard.

import { store } from "../store.js";
import { esc, toast } from "../ui.js";
import {
  defaultSettings,
  sortedCourses,
  toISODate,
  mondayOf,
  today,
  uid,
} from "../models.js";
import { isConfigured, getAccount, signIn, signOut } from "../auth.js";
import { MS_CLIENT_ID, DEFAULT_TODO_LIST_NAME } from "../config.js";
import { applyTheme } from "../app.js";

const PALETTE = ["#4f46e5", "#0891b2", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0d9488", "#be185d"];

export function nextColor(courses) {
  return PALETTE[courses.length % PALETTE.length];
}

/* ================= onboarding ================= */

export function renderOnboarding(container, onDone) {
  container.innerHTML = `
    <div class="onboarding">
      <div class="card">
        <h1>Set up your semester</h1>
        <p class="lead">A one-time setup — everything can be changed later in Settings.</p>
        <form id="ob-form">
          <h2>Semester</h2>
          <div class="field-row">
            <label class="field"><span>First week starts (Monday)</span>
              <input type="date" name="semesterStart" required value="${toISODate(mondayOf(today()))}">
            </label>
            <label class="field"><span>Number of weeks</span>
              <input type="number" name="numWeeks" min="1" max="52" required value="14">
            </label>
          </div>
          <h2>Courses</h2>
          <div id="ob-courses"></div>
          <button type="button" class="btn small" id="ob-add">+ Add course</button>
          <h2>Microsoft To Do <span class="dim small">(optional, can be added later)</span></h2>
          <label class="field"><span>Azure application (client) ID</span>
            <input type="text" name="clientId" class="mono" placeholder="00000000-0000-0000-0000-000000000000"
              value="${esc(MS_CLIENT_ID)}">
          </label>
          <p class="hint">Needs the Azure app registration described in the README. Leave empty to use the planner without To Do sync.</p>
          <div class="settings-actions">
            <button type="submit" class="btn primary">Start planning</button>
          </div>
        </form>
      </div>
    </div>`;

  const coursesBox = container.querySelector("#ob-courses");
  const addRow = (name = "", short = "") => {
    const row = document.createElement("div");
    row.className = "course-row";
    row.innerHTML = `
      <input type="text" placeholder="Course name (e.g. Linear Algebra)" value="${esc(name)}">
      <input type="text" class="short-input" placeholder="Abbr." maxlength="8" value="${esc(short)}">
      <button type="button" class="icon-btn" title="Remove">✕</button>`;
    row.querySelector("button").onclick = () => row.remove();
    coursesBox.appendChild(row);
  };
  addRow();
  addRow();
  container.querySelector("#ob-add").onclick = () => addRow();

  container.querySelector("#ob-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const courses = [];
    for (const row of coursesBox.querySelectorAll(".course-row")) {
      const [nameInput, shortInput] = row.querySelectorAll("input");
      const name = nameInput.value.trim();
      if (!name) continue;
      courses.push({
        id: uid(),
        name,
        shortName: shortInput.value.trim() || name.slice(0, 4),
        color: nextColor(courses),
        order: courses.length,
      });
    }
    if (!courses.length) {
      toast("Add at least one course.", "error");
      return;
    }
    const settings = defaultSettings();
    settings.semesterStart = toISODate(mondayOf(new Date(f.semesterStart.value + "T00:00:00")));
    settings.numWeeks = Math.max(1, parseInt(f.numWeeks.value, 10) || 14);
    settings.msal.clientId = f.clientId.value.trim();
    settings.todo.listName = DEFAULT_TODO_LIST_NAME;
    store.saveSettings(settings);
    store.saveCourses(courses);
    toast("Semester created — welcome!");
    onDone();
  };
}

/* ================= settings ================= */

export function render(container) {
  const settings = store.getSettings();
  const courses = sortedCourses(store.getCourses());
  const account = getAccount();

  container.innerHTML = `
    <div class="settings-page">
      <div class="page-head"><h1>Settings</h1></div>

      <section class="card" id="sec-semester">
        <h2>Semester</h2>
        <div class="field-row">
          <label class="field"><span>First week starts (Monday)</span>
            <input type="date" id="set-start" value="${esc(settings.semesterStart)}">
          </label>
          <label class="field"><span>Number of weeks</span>
            <input type="number" id="set-weeks" min="1" max="52" value="${settings.numWeeks}">
          </label>
        </div>
        <div class="settings-actions"><button class="btn primary" id="save-semester">Save semester</button></div>
      </section>

      <section class="card" id="sec-courses">
        <h2>Courses</h2>
        <div id="course-rows"></div>
        <div class="settings-actions">
          <button class="btn" id="add-course">+ Add course</button>
          <button class="btn primary" id="save-courses">Save courses</button>
        </div>
        <p class="hint">Deleting a course removes its grid entries; its tasks and time blocks are kept without a course.</p>
      </section>

      <section class="card" id="sec-todo">
        <h2>Microsoft To Do</h2>
        <div class="conn-status">
          ${
            account
              ? `<span class="ok">● Signed in</span> as <span class="mono">${esc(account.username || account.name || "")}</span>`
              : isConfigured()
                ? `<span class="no">○ Configured, not signed in</span>`
                : `<span class="no">○ Not configured — enter a client ID below (see README for the Azure setup)</span>`
          }
        </div>
        <label class="field"><span>Azure application (client) ID ${MS_CLIENT_ID ? "(from config.js, override here)" : ""}</span>
          <input type="text" id="set-clientid" class="mono" placeholder="${esc(MS_CLIENT_ID) || "00000000-0000-0000-0000-000000000000"}"
            value="${esc(settings.msal.clientId)}">
        </label>
        <label class="field"><span>Redirect URI (blank = this page's URL: <code>${esc(location.origin + location.pathname)}</code>)</span>
          <input type="url" id="set-redirect" class="mono" value="${esc(settings.msal.redirectUri)}">
        </label>
        <label class="field"><span>To Do list name</span>
          <input type="text" id="set-listname" value="${esc(settings.todo.listName || DEFAULT_TODO_LIST_NAME)}">
        </label>
        <div class="settings-actions">
          <button class="btn primary" id="save-msal">Save connection settings</button>
          ${
            account
              ? `<button class="btn" id="btn-signout">Sign out</button>`
              : `<button class="btn" id="btn-signin" ${isConfigured() || settings.msal.clientId ? "" : "disabled"}>Sign in with Microsoft</button>`
          }
        </div>
      </section>

      <section class="card" id="sec-appearance">
        <h2>Appearance</h2>
        <label class="field"><span>Theme</span>
          <select id="set-theme">
            <option value="system" ${settings.theme === "system" ? "selected" : ""}>Follow system</option>
            <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
            <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
          </select>
        </label>
      </section>

      <section class="card" id="sec-data">
        <h2>Data</h2>
        <p class="hint">All planner data lives in this browser's local storage. Export a JSON backup before clearing browser data or switching devices.</p>
        <div class="settings-actions">
          <button class="btn" id="btn-export">Export backup</button>
          <button class="btn" id="btn-import">Import backup…</button>
          <input type="file" id="import-file" accept="application/json" hidden>
          <button class="btn danger" id="btn-reset">Reset all data</button>
        </div>
      </section>
    </div>`;

  /* --- semester --- */
  container.querySelector("#save-semester").onclick = () => {
    const s = store.getSettings();
    const start = container.querySelector("#set-start").value;
    if (!start) return toast("Pick a start date.", "error");
    s.semesterStart = toISODate(mondayOf(new Date(start + "T00:00:00")));
    s.numWeeks = Math.max(1, parseInt(container.querySelector("#set-weeks").value, 10) || s.numWeeks);
    store.saveSettings(s);
    toast("Semester saved.");
    render(container);
  };

  /* --- courses --- */
  const rowsBox = container.querySelector("#course-rows");
  const drawCourseRow = (c) => {
    const row = document.createElement("div");
    row.className = "course-row";
    row.dataset.id = c.id;
    row.innerHTML = `
      <input type="color" value="${esc(c.color)}" title="Course color">
      <input type="text" value="${esc(c.name)}" placeholder="Course name">
      <input type="text" class="short-input" value="${esc(c.shortName)}" placeholder="Abbr." maxlength="8">
      <button class="icon-btn" data-act="up" title="Move up">↑</button>
      <button class="icon-btn" data-act="down" title="Move down">↓</button>
      <button class="icon-btn" data-act="del" title="Delete course">✕</button>`;
    row.querySelector('[data-act="up"]').onclick = () => {
      const prev = row.previousElementSibling;
      if (prev) rowsBox.insertBefore(row, prev);
    };
    row.querySelector('[data-act="down"]').onclick = () => {
      const next = row.nextElementSibling;
      if (next) rowsBox.insertBefore(next, row);
    };
    row.querySelector('[data-act="del"]').onclick = () => {
      if (!confirm(`Delete course "${row.querySelector('input[type="text"]').value}" and its grid entries?`)) return;
      row.remove();
    };
    rowsBox.appendChild(row);
  };
  courses.forEach(drawCourseRow);

  container.querySelector("#add-course").onclick = () => {
    drawCourseRow({ id: uid(), name: "", shortName: "", color: nextColor(rowsBox.children) });
  };

  container.querySelector("#save-courses").onclick = () => {
    const kept = [];
    for (const row of rowsBox.querySelectorAll(".course-row")) {
      const [name, short] = row.querySelectorAll('input[type="text"]');
      if (!name.value.trim()) continue;
      const existing = courses.find((c) => c.id === row.dataset.id);
      kept.push({
        id: row.dataset.id || uid(),
        name: name.value.trim(),
        shortName: short.value.trim() || name.value.trim().slice(0, 4),
        color: row.querySelector('input[type="color"]').value,
        order: kept.length,
      });
    }
    if (!kept.length) return toast("Keep at least one course.", "error");

    const keptIds = new Set(kept.map((c) => c.id));
    // Scrub references to deleted courses.
    const grid = store.getGrid();
    for (const key of Object.keys(grid)) {
      const courseId = key.split(":")[1];
      if (!keptIds.has(courseId)) delete grid[key];
    }
    store.saveGrid(grid);
    const tasks = store.getTasks();
    for (const t of tasks) if (t.courseId && !keptIds.has(t.courseId)) t.courseId = null;
    store.saveTasks(tasks);
    const blocks = store.getBlocks();
    for (const b of blocks) if (b.courseId && !keptIds.has(b.courseId)) b.courseId = null;
    store.saveBlocks(blocks);

    store.saveCourses(kept);
    toast("Courses saved.");
    render(container);
  };

  /* --- Microsoft To Do --- */
  container.querySelector("#save-msal").onclick = () => {
    const s = store.getSettings();
    s.msal.clientId = container.querySelector("#set-clientid").value.trim();
    s.msal.redirectUri = container.querySelector("#set-redirect").value.trim();
    s.todo.listName = container.querySelector("#set-listname").value.trim() || DEFAULT_TODO_LIST_NAME;
    store.saveSettings(s);
    toast("Saved — reloading to apply.");
    setTimeout(() => location.reload(), 600);
  };
  const signinBtn = container.querySelector("#btn-signin");
  if (signinBtn) {
    signinBtn.onclick = async () => {
      try {
        await signIn();
      } catch (e) {
        toast("Sign-in failed: " + e.message, "error");
      }
    };
  }
  const signoutBtn = container.querySelector("#btn-signout");
  if (signoutBtn) {
    signoutBtn.onclick = async () => {
      try {
        await signOut();
      } catch (e) {
        toast("Sign-out failed: " + e.message, "error");
      }
    };
  }

  /* --- appearance --- */
  container.querySelector("#set-theme").onchange = (e) => {
    const s = store.getSettings();
    s.theme = e.target.value;
    store.saveSettings(s);
    applyTheme();
  };

  /* --- data --- */
  container.querySelector("#btn-export").onclick = () => {
    const blob = new Blob([store.exportAll()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cs-planner-backup-${toISODate(today())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const fileInput = container.querySelector("#import-file");
  container.querySelector("#btn-import").onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      store.importAll(await file.text());
      toast("Backup imported — reloading.");
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast("Import failed: " + e.message, "error");
    }
  };
  container.querySelector("#btn-reset").onclick = () => {
    if (!confirm("Delete ALL planner data in this browser? (Your Microsoft To Do list is not touched.)")) return;
    if (!confirm("Really sure? This cannot be undone unless you have a backup.")) return;
    store.resetAll();
    location.reload();
  };
}
