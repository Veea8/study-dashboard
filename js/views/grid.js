// Semester overview grid: weeks × (course → lecture/exercises).

import { store } from "../store.js";
import { esc, openModal, closeModal } from "../ui.js";
import {
  STATUSES,
  STATUS_LABELS,
  TRACKS,
  TRACK_LABELS,
  cellKey,
  getCell,
  weekLabel,
  currentWeekIndex,
  sortedCourses,
} from "../models.js";

let savedScroll = null;

export function render(container) {
  const settings = store.getSettings();
  const courses = sortedCourses(store.getCourses());
  const grid = store.getGrid();
  const curWeek = currentWeekIndex(settings);

  const swatch = (status, w, courseId, track, clickable = true) =>
    `<button class="swatch ${status}" ${clickable ? "" : 'tabindex="-1"'}
       data-w="${w}" data-course="${courseId}" data-track="${track}"
       title="${STATUS_LABELS[status]} — click to cycle"></button>`;

  let head1 = `<th class="week-col">Week</th>`;
  let head2 = `<th class="week-col"></th>`;
  for (const c of courses) {
    const dot = `<span style="color:${esc(c.color)}">●</span>`;
    if (c.collapsed) {
      head1 += `<th class="course-head" title="${esc(c.name)}">
        ${dot} <span class="mono">${esc(c.shortName)}</span>
        <button class="collapse-btn" data-course="${c.id}" title="Expand">[+]</button></th>`;
      head2 += `<th class="track-head">L·E</th>`;
    } else {
      head1 += `<th class="course-head" colspan="2">
        ${dot} ${esc(c.name)}
        <button class="collapse-btn" data-course="${c.id}" title="Collapse">[–]</button></th>`;
      head2 += `<th class="track-head">${TRACK_LABELS.lecture}</th><th class="track-head">${TRACK_LABELS.exercises}</th>`;
    }
  }

  let body = "";
  for (let w = 0; w < settings.numWeeks; w++) {
    let row = `<td class="week-col"><span class="wk-num">W${w + 1}</span>${esc(weekLabel(settings, w))}</td>`;
    for (const c of courses) {
      if (c.collapsed) {
        const mini = TRACKS.map((t) => {
          const cell = getCell(grid, w, c.id, t);
          return `<span class="swatch ${cell.status}" title="${TRACK_LABELS[t]}: ${STATUS_LABELS[cell.status]}"></span>`;
        }).join("");
        row += `<td class="cell-collapsed" data-course="${c.id}" title="${esc(c.name)} — click to expand"><span class="mini">${mini}</span></td>`;
      } else {
        for (const t of TRACKS) {
          const cell = getCell(grid, w, c.id, t);
          const behind = w < curWeek && cell.status !== "full";
          const meta =
            (cell.note ? `<span class="has-note" title="Has note">✎</span>` : "") +
            (cell.links?.length ? `<span class="has-link" title="Has links">↗</span>` : "");
          row += `<td class="cell ${behind ? "behind" : ""}" data-w="${w}" data-course="${c.id}" data-track="${t}">
            <div class="cell-inner">
              ${swatch(cell.status, w, c.id, t)}
              <span class="topic">${esc(cell.topic)}</span>
              ${meta ? `<span class="cell-meta">${meta}</span>` : ""}
            </div></td>`;
        }
      }
    }
    body += `<tr class="${w === curWeek ? "current-week" : ""}">${row}</tr>`;
  }

  const legend = STATUSES.map(
    (s) => `<span><span class="swatch ${s}"></span>${STATUS_LABELS[s]}</span>`
  ).join("");

  container.innerHTML = `
    <div class="page-head">
      <h1>Semester grid</h1>
      <span class="sub mono">${esc(weekLabel(settings, 0))} → ${esc(weekLabel(settings, settings.numWeeks - 1))}
        · ${settings.numWeeks} weeks${curWeek >= 0 && curWeek < settings.numWeeks ? ` · now: W${curWeek + 1}` : ""}</span>
    </div>
    <div class="grid-wrap">
      <table class="semgrid">
        <thead><tr>${head1}</tr><tr>${head2}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="grid-legend">${legend}
      <span title="Cell in a past week that is not Fully done"><span class="swatch" style="box-shadow: inset 3px 0 0 var(--danger); background: var(--surface-2)"></span>behind</span>
    </div>`;

  const wrap = container.querySelector(".grid-wrap");
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
    render(container);
  };

  container.querySelector(".semgrid").addEventListener("click", (e) => {
    const collapseBtn = e.target.closest(".collapse-btn");
    if (collapseBtn) {
      toggleCollapse(collapseBtn.dataset.course);
      rerender();
      return;
    }
    const sw = e.target.closest("button.swatch");
    if (sw) {
      cycleStatus(+sw.dataset.w, sw.dataset.course, sw.dataset.track);
      rerender();
      return;
    }
    const collapsed = e.target.closest("td.cell-collapsed");
    if (collapsed) {
      toggleCollapse(collapsed.dataset.course);
      rerender();
      return;
    }
    const td = e.target.closest("td.cell");
    if (td) {
      openCellEditor(+td.dataset.w, td.dataset.course, td.dataset.track, rerender);
    }
  });
}

function toggleCollapse(courseId) {
  const courses = store.getCourses();
  const c = courses.find((x) => x.id === courseId);
  if (!c) return;
  c.collapsed = !c.collapsed;
  store.saveCourses(courses);
}

function cycleStatus(w, courseId, track) {
  const grid = store.getGrid();
  const cell = getCell(grid, w, courseId, track);
  cell.status = STATUSES[(STATUSES.indexOf(cell.status) + 1) % STATUSES.length];
  grid[cellKey(w, courseId, track)] = cell;
  store.saveGrid(grid);
}

function openCellEditor(w, courseId, track, onSaved) {
  const settings = store.getSettings();
  const course = store.getCourses().find((c) => c.id === courseId);
  const grid = store.getGrid();
  const cell = getCell(grid, w, courseId, track);

  const linkRow = (l = { label: "", url: "" }) => `
    <div class="link-row">
      <input type="text" class="label-input" placeholder="Label" value="${esc(l.label)}">
      <input type="url" placeholder="https://…" value="${esc(l.url)}">
      ${l.url ? `<a class="icon-btn" href="${esc(l.url)}" target="_blank" rel="noopener" title="Open">↗</a>` : ""}
      <button type="button" class="icon-btn" data-del-link title="Remove">✕</button>
    </div>`;

  const modal = openModal(
    `${course?.shortName ?? "?"} · ${TRACK_LABELS[track]} · W${w + 1} (${weekLabel(settings, w)})`,
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
    const g = store.getGrid();
    if (!updated.topic && !updated.note && !links.length && updated.status === "none") {
      delete g[cellKey(w, courseId, track)];
    } else {
      g[cellKey(w, courseId, track)] = updated;
    }
    store.saveGrid(g);
    closeModal();
    onSaved();
  };
}
