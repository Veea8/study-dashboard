// Calendar time-blocking: week/day view, planned vs actual rollups.

import { store } from "../store.js";
import { esc, openModal, closeModal, toast } from "../ui.js";
import {
  uid,
  today,
  addDays,
  mondayOf,
  toISODate,
  fromISODate,
  fmtShort,
  fmtMin,
  sortedCourses,
  currentWeekIndex,
  weekLabel,
} from "../models.js";

const START_HOUR = 7;
const END_HOUR = 23;
const HOUR_PX = 48;
const TOTAL_PX = (END_HOUR - START_HOUR) * HOUR_PX;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let mode = null; // "week" | "day", chosen on first render by viewport
let anchor = today(); // any date inside the shown period

const timeToMin = (t) => {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
const minToTime = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Assign lanes to overlapping blocks within one day. */
function layoutDay(blocks) {
  const sorted = [...blocks].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  const laneEnds = [];
  const placed = [];
  for (const b of sorted) {
    const start = timeToMin(b.start);
    const end = start + (b.plannedMin || 30);
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = end;
    placed.push({ block: b, lane, start, end });
  }
  const laneCount = Math.max(1, laneEnds.length);
  return placed.map((p) => ({ ...p, laneCount }));
}

export function render(container) {
  if (mode === null) mode = window.innerWidth < 700 ? "day" : "week";
  const settings = store.getSettings();
  const courses = sortedCourses(store.getCourses());
  const blocks = store.getBlocks();
  const t0 = today();

  const days =
    mode === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i))
      : [anchor];
  const dayISOs = days.map(toISODate);

  const title =
    mode === "week"
      ? `${WEEKDAYS[days[0].getDay()]} ${fmtShort(days[0])} – ${WEEKDAYS[days[6].getDay()]} ${fmtShort(days[6])}`
      : `${WEEKDAYS[anchor.getDay()]} ${fmtShort(anchor)}`;

  const courseOf = (id) => courses.find((c) => c.id === id);

  const dayCols = days
    .map((d) => {
      const iso = toISODate(d);
      const dayBlocks = blocks.filter((b) => b.date === iso);
      const blockHtml = layoutDay(dayBlocks)
        .map(({ block: b, lane, laneCount, start, end }) => {
          const top = ((start - START_HOUR * 60) / 60) * HOUR_PX;
          const height = Math.max(16, ((end - start) / 60) * HOUR_PX - 2);
          const width = 100 / laneCount;
          const color = courseOf(b.courseId)?.color || "var(--accent)";
          const time = `${b.start}–${minToTime(end)} · ${fmtMin(b.plannedMin)}${b.actualMin != null ? ` / ${fmtMin(b.actualMin)}` : ""}`;
          return `<div class="cal-block ${b.actualMin != null ? "logged" : ""}" data-id="${b.id}"
            style="top:${top}px;height:${height}px;left:calc(${lane * width}% + 2px);right:auto;width:calc(${width}% - 4px);border-left-color:${esc(color)}"
            title="${esc(b.title)} (${esc(time)})">
            <div class="b-title">${esc(b.title)}</div>
            <div class="b-time">${esc(time)}</div>
          </div>`;
        })
        .join("");
      return `<div class="cal-day ${iso === toISODate(t0) ? "today" : ""}" data-date="${iso}" style="height:${TOTAL_PX}px">${blockHtml}</div>`;
    })
    .join("");

  const headDays = days
    .map(
      (d) =>
        `<div class="cal-head-day ${toISODate(d) === toISODate(t0) ? "today" : ""}">${WEEKDAYS[d.getDay()]} ${fmtShort(d)}</div>`
    )
    .join("");

  const hourLabels = Array.from(
    { length: END_HOUR - START_HOUR },
    (_, i) => `<div class="hour-label">${String(START_HOUR + i).padStart(2, "0")}</div>`
  ).join("");

  container.innerHTML = `
    <div class="cal-page">
    <div class="page-head">
      <h1>Calendar</h1>
      <span class="spacer"></span>
      <button class="btn primary small" id="btn-new-block">+ Block</button>
    </div>
    <div class="cal-toolbar">
      <button class="btn small" id="cal-prev">‹</button>
      <button class="btn small" id="cal-today">Today</button>
      <button class="btn small" id="cal-next">›</button>
      <span class="title">${esc(title)}</span>
      <span class="spacer" style="flex:1"></span>
      <button class="btn small ${mode === "week" ? "primary" : ""}" id="mode-week">Week</button>
      <button class="btn small ${mode === "day" ? "primary" : ""}" id="mode-day">Day</button>
    </div>
    <div class="cal-wrap">
      <div class="cal-head-row ${mode === "day" ? "day-mode" : ""}">
        <div class="cal-head-gutter"></div>${headDays}
      </div>
      <div class="cal-grid ${mode === "day" ? "day-mode" : ""}">
        <div class="cal-gutter">${hourLabels}</div>
        ${dayCols}
      </div>
    </div>
    ${rollupsHtml(settings, courses, blocks, days)}
    </div>`;

  const page = container.querySelector(".cal-page");
  const shift = (n) => {
    anchor = addDays(anchor, n * (mode === "week" ? 7 : 1));
    render(container);
  };
  page.querySelector("#cal-prev").onclick = () => shift(-1);
  page.querySelector("#cal-next").onclick = () => shift(1);
  page.querySelector("#cal-today").onclick = () => {
    anchor = today();
    render(container);
  };
  page.querySelector("#mode-week").onclick = () => {
    mode = "week";
    render(container);
  };
  page.querySelector("#mode-day").onclick = () => {
    mode = "day";
    render(container);
  };
  page.querySelector("#btn-new-block").onclick = () =>
    openBlockEditor(null, { date: toISODate(anchor), start: "14:00" }, () => render(container));

  page.querySelector(".cal-grid").addEventListener("click", (e) => {
    const blockEl = e.target.closest(".cal-block");
    if (blockEl) {
      const b = store.getBlocks().find((x) => x.id === blockEl.dataset.id);
      if (b) openBlockEditor(b, {}, () => render(container));
      return;
    }
    const dayEl = e.target.closest(".cal-day");
    if (dayEl) {
      const rect = dayEl.getBoundingClientRect();
      const min = START_HOUR * 60 + Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60);
      const snapped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - 30, Math.round(min / 30) * 30));
      openBlockEditor(null, { date: dayEl.dataset.date, start: minToTime(snapped) }, () => render(container));
    }
  });

  // Scroll the timeline to the morning on first paint.
  const wrap = page.querySelector(".cal-wrap");
  wrap.scrollTop = ((9 - START_HOUR) * HOUR_PX) / 1.5;
}

/* ---------- rollups ---------- */

function rollupsHtml(settings, courses, blocks, days) {
  const dayISOs = new Set(days.length === 7 ? days.map(toISODate) : weekISOs(days[0]));
  const weekBlocks = blocks.filter((b) => dayISOs.has(b.date));

  const perCourse = new Map();
  for (const b of weekBlocks) {
    const key = b.courseId || "";
    const agg = perCourse.get(key) || { planned: 0, actual: 0 };
    agg.planned += b.plannedMin || 0;
    agg.actual += b.actualMin || 0;
    perCourse.set(key, agg);
  }
  const maxVal = Math.max(60, ...[...perCourse.values()].flatMap((a) => [a.planned, a.actual]));

  const courseRows = [...perCourse.entries()]
    .sort((a, b) => b[1].planned - a[1].planned)
    .map(([courseId, agg]) => {
      const c = courses.find((x) => x.id === courseId);
      return `<div class="rollup-row">
        <span class="rname">${c ? `<span style="color:${esc(c.color)}">●</span> ${esc(c.shortName)}` : '<span class="dim">No course</span>'}</span>
        <span class="bars">
          <span class="bar planned"><i style="width:${(agg.planned / maxVal) * 100}%"></i></span>
          <span class="bar actual"><i style="width:${(agg.actual / maxVal) * 100}%"></i></span>
        </span>
        <span class="nums">${fmtMin(agg.planned)} / ${fmtMin(agg.actual)}</span>
      </div>`;
    })
    .join("");

  // Semester-wide weekly totals.
  const perWeek = new Map();
  for (const b of blocks) {
    const monday = toISODate(mondayOf(fromISODate(b.date)));
    const agg = perWeek.get(monday) || { planned: 0, actual: 0 };
    agg.planned += b.plannedMin || 0;
    agg.actual += b.actualMin || 0;
    perWeek.set(monday, agg);
  }
  const curMonday = toISODate(mondayOf(today()));
  const weekRows = [...perWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monday, agg]) => {
      const wk = currentWeekIndex(settings, fromISODate(monday));
      const label =
        wk >= 0 && wk < settings.numWeeks ? `W${wk + 1} · ${weekLabel(settings, wk)}` : fmtShort(fromISODate(monday));
      const delta = agg.actual - agg.planned;
      return `<tr class="${monday === curMonday ? "current" : ""}">
        <td>${esc(label)}</td><td>${fmtMin(agg.planned)}</td><td>${fmtMin(agg.actual)}</td>
        <td>${agg.actual ? (delta >= 0 ? "+" : "−") + fmtMin(Math.abs(delta)) : "–"}</td>
      </tr>`;
    })
    .join("");

  return `<div class="rollups">
    <div class="card">
      <h2>This week by course <span class="dim small">planned / actual</span></h2>
      ${courseRows || `<p class="dash-empty">No blocks in this week yet.</p>`}
    </div>
    <div class="card">
      <h2>Weekly totals</h2>
      ${
        weekRows
          ? `<table class="week-rollup"><thead><tr><th>Week</th><th>Planned</th><th>Actual</th><th>Δ</th></tr></thead><tbody>${weekRows}</tbody></table>`
          : `<p class="dash-empty">Nothing logged yet.</p>`
      }
    </div>
  </div>`;
}

function weekISOs(d) {
  const mon = mondayOf(d);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(mon, i)));
}

/* ---------- block editor ---------- */

function openBlockEditor(block, defaults, onSaved) {
  const courses = sortedCourses(store.getCourses());
  const openTasks = store.getTasks().filter((t) => t.status !== "done");
  const isNew = !block;
  const b = block ?? {
    id: uid(),
    title: "",
    courseId: courses[0]?.id ?? null,
    taskId: null,
    date: defaults.date ?? toISODate(today()),
    start: defaults.start ?? "14:00",
    plannedMin: 60,
    actualMin: null,
    note: "",
  };

  const modal = openModal(
    isNew ? "New study block" : "Edit study block",
    `
    <label class="field"><span>Title</span>
      <input type="text" id="b-title" value="${esc(b.title)}" placeholder="e.g. Watch lecture 4">
    </label>
    <div class="field-row">
      <label class="field"><span>Course</span>
        <select id="b-course">
          <option value="">— none —</option>
          ${courses.map((c) => `<option value="${c.id}" ${c.id === b.courseId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span>Linked task</span>
        <select id="b-task">
          <option value="">— none —</option>
          ${openTasks.map((t) => `<option value="${t.id}" ${t.id === b.taskId ? "selected" : ""}>${esc(t.title)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="field-row">
      <label class="field"><span>Date</span>
        <input type="date" id="b-date" value="${esc(b.date)}">
      </label>
      <label class="field"><span>Start</span>
        <input type="time" id="b-start" value="${esc(b.start)}" step="300">
      </label>
    </div>
    <div class="field-row">
      <label class="field"><span>Planned (min)</span>
        <input type="number" id="b-planned" min="5" step="5" value="${b.plannedMin}">
      </label>
      <label class="field"><span>Actual (min) <span class="dim">— log afterwards</span></span>
        <input type="number" id="b-actual" min="0" step="5" value="${b.actualMin ?? ""}" placeholder="not logged">
      </label>
    </div>
    <label class="field"><span>Note</span>
      <textarea id="b-note">${esc(b.note)}</textarea>
    </label>
    `,
    `${isNew ? "" : `<button class="btn danger left" data-delete>Delete</button>`}
     <button class="btn" data-cancel>Cancel</button>
     <button class="btn primary" data-save>${isNew ? "Create" : "Save"}</button>`
  );

  modal.querySelector("[data-cancel]").onclick = closeModal;
  const delBtn = modal.querySelector("[data-delete]");
  if (delBtn) {
    delBtn.onclick = () => {
      if (!confirm(`Delete block "${b.title}"?`)) return;
      store.saveBlocks(store.getBlocks().filter((x) => x.id !== b.id));
      closeModal();
      onSaved();
    };
  }
  modal.querySelector("[data-save]").onclick = () => {
    const title = modal.querySelector("#b-title").value.trim();
    if (!title) return toast("Title is required.", "error");
    b.title = title;
    b.courseId = modal.querySelector("#b-course").value || null;
    b.taskId = modal.querySelector("#b-task").value || null;
    b.date = modal.querySelector("#b-date").value || b.date;
    b.start = modal.querySelector("#b-start").value || b.start;
    b.plannedMin = Math.max(5, parseInt(modal.querySelector("#b-planned").value, 10) || 60);
    const actualRaw = modal.querySelector("#b-actual").value;
    b.actualMin = actualRaw === "" ? null : Math.max(0, parseInt(actualRaw, 10) || 0);
    b.note = modal.querySelector("#b-note").value;

    const blocks = store.getBlocks();
    if (isNew) blocks.push(b);
    else {
      const i = blocks.findIndex((x) => x.id === b.id);
      if (i >= 0) blocks[i] = b;
    }
    store.saveBlocks(blocks);
    closeModal();
    onSaved();
  };
}
