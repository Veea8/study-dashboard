// Semester overview grid: weeks × two sessions × (course → lecture/exercises).

import { store } from "../store.js";
import { esc, openModal, closeModal } from "../ui.js";
import { bindGridControls } from "../grid-controls.js";
import { commitGridChange } from "../grid-history.js";
import {
  STATUSES,
  STATUS_LABELS,
  TRACKS,
  TRACK_LABELS,
  SESSIONS_PER_WEEK,
  cellKey,
  getCell,
  weekLabel,
  currentWeekIndex,
  sortedCourses,
} from "../models.js";

let savedScroll = null;
let savedSelection = null;

export function render(container) {
  const settings = store.getSettings();
  const courses = sortedCourses(store.getCourses());
  const grid = store.getGrid();
  const curWeek = currentWeekIndex(settings);
  const layout = store.getGridLayout() || {};
  const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5];
  const zoom = zoomLevels.includes(layout.zoom) ? layout.zoom : 1;
  const columns = courses.flatMap((c) =>
    TRACKS.map((track) => ({ key: `${c.id}:${track}`, courseId: c.id, track })));
  const widths = columns.map((col) => Math.max(80,
    Number.isFinite(layout[col.key]) ? layout[col.key] : 160));
  const resizeHandle = (key) => `<span class="column-resizer" data-resize="${esc(key)}" title="Drag to resize column"></span>`;

  const swatch = (status, w, courseId, track, session, clickable = true) =>
    `<button class="swatch ${status}" ${clickable ? "" : 'tabindex="-1"'}
       data-w="${w}" data-course="${courseId}" data-track="${track}" data-session="${session}"
       title="${STATUS_LABELS[status]} — click to cycle"></button>`;

  let head1 = `<th class="week-col">Week</th>`;
  let head2 = `<th class="week-col"></th>`;
  for (const c of courses) {
    const dot = `<span style="color:${esc(c.color)}">●</span>`;
    head1 += `<th class="course-head" colspan="2" title="${esc(c.name)}">${dot} ${esc(c.name)}</th>`;
    head2 += TRACKS.map((t) => `<th class="track-head">${TRACK_LABELS[t]}${resizeHandle(`${c.id}:${t}`)}</th>`).join("");
  }

  let body = "";
  for (let w = 0; w < settings.numWeeks; w++) {
    for (let session = 0; session < SESSIONS_PER_WEEK; session++) {
      const visualRow = w * SESSIONS_PER_WEEK + session;
      let row = `<td class="week-col"><span class="wk-num">W${w + 1} · S${session + 1}</span>${esc(weekLabel(settings, w))}</td>`;
      for (const c of courses) {
        for (const t of TRACKS) {
          const cell = getCell(grid, w, c.id, t, session);
          const meta =
            (cell.note ? `<span class="has-note" title="Has note">✎</span>` : "") +
            (cell.links?.length ? `<span class="has-link" title="Has links">↗</span>` : "");
          row += `<td class="cell" data-w="${visualRow}" data-week="${w}" data-session="${session}" data-course="${c.id}" data-track="${t}">
            <div class="cell-inner">
              ${swatch(cell.status, w, c.id, t, session)}
              <span class="topic" title="${esc(cell.topic)}">${esc(cell.topic)}</span>
              ${meta ? `<span class="cell-meta">${meta}</span>` : ""}
            </div></td>`;
        }
      }
      body += `<tr class="${w === curWeek ? "current-week " : ""}${session === SESSIONS_PER_WEEK - 1 ? "week-end" : ""}">${row}</tr>`;
    }
  }

  const legend = STATUSES.filter((s) => s !== "none").map(
    (s) => `<span><span class="swatch ${s}"></span>${STATUS_LABELS[s]}</span>`
  ).join("");

  container.innerHTML = `
    <section class="grid-page">
    <div class="page-head">
      <h1>Semester grid</h1>
      <span class="sub mono">${esc(weekLabel(settings, 0))} → ${esc(weekLabel(settings, settings.numWeeks - 1))}
        · ${settings.numWeeks} weeks${curWeek >= 0 && curWeek < settings.numWeeks ? ` · now: W${curWeek + 1}` : ""}</span>
      <label class="grid-zoom">Zoom <select aria-label="Grid zoom">${zoomLevels.map((level) => `<option value="${level}" ${level === zoom ? "selected" : ""}>${level * 100}%</option>`).join("")}</select></label>
    </div>
    <div class="grid-wrap">
      <table class="semgrid" tabindex="0" aria-label="Semester grid. Select cells to paste topics; Enter to edit." style="width:${104 + widths.reduce((a, b) => a + b, 0)}px">
        <colgroup><col style="width:104px">${columns.map((col, i) => `<col data-column="${esc(col.key)}" style="width:${widths[i]}px">`).join("")}</colgroup>
        <thead><tr>${head1}</tr><tr>${head2}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="grid-help">Drag or Shift-click to select · paste topics · Delete to clear · Ctrl/Cmd+Z to undo · double-click or Enter to edit · hold and drag header edges to resize</p>
    <div class="grid-legend">${legend}
    </div>
    </section>`;

  const wrap = container.querySelector(".grid-wrap");
  const table = container.querySelector(".semgrid");
  const controls = bindGridControls(table, {
    columns, widths, numWeeks: settings.numWeeks * SESSIONS_PER_WEEK, layout, selection: savedSelection,
    rowToCell: (row) => ({ weekIndex: Math.floor(row / SESSIONS_PER_WEEK), session: row % SESSIONS_PER_WEEK }),
    rerender: () => rerender(), edit: (td) => openCellEditor(+td.dataset.week, td.dataset.course, td.dataset.track, +td.dataset.session, rerender),
  });
  controls.setZoom(zoom);
  if (savedScroll) {
    wrap.scrollTop = savedScroll.top;
    wrap.scrollLeft = savedScroll.left;
  } else if (curWeek > 2 && curWeek < settings.numWeeks) {
    const row = container.querySelector("tr.current-week");
    if (row) wrap.scrollTop = Math.max(0, row.offsetTop - 140);
  }
  savedScroll = null;

  const rerender = () => {
    savedScroll = { top: wrap.scrollTop, left: wrap.scrollLeft };
    savedSelection = controls.getSelection();
    render(container);
    container.querySelector(".semgrid").focus({ preventScroll: true });
  };

  container.querySelector(".grid-zoom select").addEventListener("change", (e) => {
    const value = Number(e.target.value);
    controls.setZoom(value);
    store.saveGridLayout({ ...store.getGridLayout(), zoom: value });
  });
  savedSelection = null;

  container.querySelector(".semgrid").addEventListener("click", (e) => {
    const sw = e.target.closest("button.swatch");
    if (sw) {
      cycleStatus(+sw.dataset.w, sw.dataset.course, sw.dataset.track, +sw.dataset.session);
      rerender();
      return;
    }
  });
}

function cycleStatus(w, courseId, track, session) {
  const before = store.getGrid();
  const grid = { ...before };
  const cell = { ...getCell(grid, w, courseId, track, session) };
  cell.status = STATUSES[(STATUSES.indexOf(cell.status) + 1) % STATUSES.length];
  grid[cellKey(w, courseId, track, session)] = cell;
  commitGridChange("cells", before, grid);
}

function openCellEditor(w, courseId, track, session, onSaved) {
  const settings = store.getSettings();
  const course = store.getCourses().find((c) => c.id === courseId);
  const grid = store.getGrid();
  const cell = getCell(grid, w, courseId, track, session);

  const linkRow = (l = { label: "", url: "" }) => `
    <div class="link-row">
      <input type="text" class="label-input" placeholder="Label" value="${esc(l.label)}">
      <input type="url" placeholder="https://…" value="${esc(l.url)}">
      ${l.url ? `<a class="icon-btn" href="${esc(l.url)}" target="_blank" rel="noopener" title="Open">↗</a>` : ""}
      <button type="button" class="icon-btn" data-del-link title="Remove">✕</button>
    </div>`;

  const modal = openModal(
    `${course?.shortName ?? "?"} · ${TRACK_LABELS[track]} · W${w + 1}, session ${session + 1} (${weekLabel(settings, w)})`,
    `
    <div class="status-picker">
      ${STATUSES.map(
        (s) => `<button type="button" class="${s} ${s === cell.status ? "sel" : ""}" data-status="${s}">${STATUS_LABELS[s]}</button>`
      ).join("")}
    </div>
    <label class="field"><span>Topic</span>
      <input type="text" id="cell-topic" value="${esc(cell.topic)}" placeholder="e.g. Boolean algebra">
    </label>
    <label class="field"><span>Note</span>
      <textarea id="cell-note" placeholder="Longer note for this week…">${esc(cell.note)}</textarea>
    </label>
    <label class="field"><span>Resource links</span></label>
    <div id="cell-links">${(cell.links ?? []).map(linkRow).join("")}</div>
    <button type="button" class="btn small" id="add-link">+ Add link</button>
    `,
    `<button class="btn" data-cancel>Cancel</button>
     <button class="btn primary" data-save>Save</button>`
  );

  let status = cell.status;
  const picker = modal.querySelector(".status-picker");
  picker.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-status]");
    if (!b) return;
    status = b.dataset.status;
    picker.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
  });

  const linksBox = modal.querySelector("#cell-links");
  modal.querySelector("#add-link").onclick = () => {
    linksBox.insertAdjacentHTML("beforeend", linkRow());
  };
  linksBox.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-link]");
    if (del) del.closest(".link-row").remove();
  });

  modal.querySelector("[data-cancel]").onclick = closeModal;
  modal.querySelector("[data-save]").onclick = () => {
    const links = [];
    for (const row of linksBox.querySelectorAll(".link-row")) {
      const [label, url] = row.querySelectorAll("input");
      if (url.value.trim()) links.push({ label: label.value.trim(), url: url.value.trim() });
    }
    const updated = {
      topic: modal.querySelector("#cell-topic").value.trim(),
      status,
      note: modal.querySelector("#cell-note").value,
      links,
    };
    const before = store.getGrid();
    const g = { ...before };
    if (!updated.topic && !updated.note && !links.length && updated.status === "none") {
      delete g[cellKey(w, courseId, track, session)];
    } else {
      g[cellKey(w, courseId, track, session)] = updated;
    }
    commitGridChange("cells", before, g);
    closeModal();
    onSaved();
  };
}
