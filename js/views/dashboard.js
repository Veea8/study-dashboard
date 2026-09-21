// Dashboard: read-only composition of grid, tasks and calendar data.

import { store } from "../store.js";
import { esc } from "../ui.js";
import {
  today,
  addDays,
  mondayOf,
  fromISODate,
  toISODate,
  fmtShort,
  fmtMin,
  sortedCourses,
  currentWeekIndex,
  weekLabel,
  courseProgress,
  expectedProgress,
  getCell,
  TRACKS,
  SESSIONS_PER_WEEK,
  STATUS_LABELS,
  TASK_TYPE_LABELS,
} from "../models.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function render(container) {
  const settings = store.getSettings();
  const courses = sortedCourses(store.getCourses());
  const grid = store.getGrid();
  const tasks = store.getTasks();
  const blocks = store.getBlocks();

  const t0 = today();
  const weekEnd = addDays(mondayOf(t0), 6);
  const curWeek = currentWeekIndex(settings);
  const inSemester = curWeek >= 0 && curWeek < settings.numWeeks;
  const courseOf = (id) => courses.find((c) => c.id === id);

  /* --- due this week (incl. overdue) --- */
  const due = tasks
    .filter((t) => t.status !== "done" && t.dueDate && fromISODate(t.dueDate) <= weekEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueHtml = due
    .map((t) => {
      const c = courseOf(t.courseId);
      const d = fromISODate(t.dueDate);
      const overdue = d < t0;
      return `<div class="dash-row">
        ${c ? `<span class="chip course-chip" style="border-color:${esc(c.color)};color:${esc(c.color)}">${esc(c.shortName)}</span>` : ""}
        <span>${esc(t.title)}</span>
        <span class="chip">${TASK_TYPE_LABELS[t.type] ?? ""}</span>
        <span class="mono right ${overdue ? "task-due overdue" : ""}">${overdue ? "overdue · " : ""}${WEEKDAYS[d.getDay()]} ${fmtShort(d)}</span>
      </div>`;
    })
    .join("");

  /* --- current week status per course --- */
  const statusHtml = inSemester
    ? courses
        .map((c) => {
          const sessions = Array.from({ length: SESSIONS_PER_WEEK }, (_, session) => {
            const tracks = TRACKS.map((tr) => {
              const cell = getCell(grid, curWeek, c.id, tr, session);
              return `<span class="dcs-track" title="Session ${session + 1} ${tr}: ${STATUS_LABELS[cell.status]}">
                <span class="t">${tr === "lecture" ? "L" : "E"}</span>
                <span class="swatch ${cell.status}"></span>
                <span class="topic">${esc(cell.topic)}</span>
              </span>`;
            }).join("");
            return `<div class="dcs-session"><span class="session-tag">S${session + 1}</span>${tracks}</div>`;
          }).join("");
          return `<div class="dcs-row"><span class="cname" style="color:${esc(c.color)}">${esc(c.shortName)}</span><div class="dcs-sessions">${sessions}</div></div>`;
        })
        .join("")
    : `<p class="dash-empty">Outside the configured semester (${esc(settings.semesterStart)}, ${settings.numWeeks} weeks).</p>`;

  /* --- today's blocks --- */
  const todayISO = toISODate(t0);
  const todayBlocks = blocks
    .filter((b) => b.date === todayISO)
    .sort((a, b) => a.start.localeCompare(b.start));
  const planned = todayBlocks.reduce((s, b) => s + (b.plannedMin || 0), 0);
  const actual = todayBlocks.reduce((s, b) => s + (b.actualMin || 0), 0);
  const blocksHtml = todayBlocks
    .map((b) => {
      const c = courseOf(b.courseId);
      return `<div class="dash-row">
        <span class="mono">${esc(b.start)}</span>
        ${c ? `<span class="chip course-chip" style="border-color:${esc(c.color)};color:${esc(c.color)}">${esc(c.shortName)}</span>` : ""}
        <span>${esc(b.title)}</span>
        <span class="mono right">${fmtMin(b.plannedMin)}${b.actualMin != null ? ` / ${fmtMin(b.actualMin)}` : ""}</span>
      </div>`;
    })
    .join("");

  /* --- progress per course --- */
  const expected = expectedProgress(settings);
  const progHtml = courses
    .map((c) => {
      const p = courseProgress(grid, settings, c.id);
      return `<div class="prog-row">
        <div class="prog-head">
          <span><span style="color:${esc(c.color)}">●</span> ${esc(c.name)}</span>
          <span class="pct">${Math.round(p * 100)}%</span>
        </div>
        <div class="prog-bar">
          <i style="width:${p * 100}%;background:${esc(c.color)}"></i>
          <span class="pace" style="left:${expected * 100}%" title="Calendar pace: ${Math.round(expected * 100)}%"></span>
        </div>
      </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="page-head">
      <h1>Dashboard</h1>
      <span class="sub mono">${
        inSemester
          ? `W${curWeek + 1}/${settings.numWeeks} · ${esc(weekLabel(settings, curWeek))}`
          : "outside semester"
      }</span>
    </div>
    <div class="dash-grid">
      <div class="card">
        <h2>Due this week <a href="#/tasks">tasks →</a></h2>
        <div class="dash-list">${dueHtml || `<p class="dash-empty">Nothing due this week. 🎉</p>`}</div>
      </div>
      <div class="card">
        <h2>This week's material <a href="#/grid">grid →</a></h2>
        <div class="dash-course-status">${statusHtml || `<p class="dash-empty">No courses configured.</p>`}</div>
      </div>
      <div class="card">
        <h2>Today's blocks <a href="#/calendar">calendar →</a></h2>
        <div class="dash-list">${blocksHtml || `<p class="dash-empty">No study blocks planned for today.</p>`}</div>
        ${todayBlocks.length ? `<p class="pace-note mono">total ${fmtMin(planned)} planned${actual ? ` · ${fmtMin(actual)} logged` : ""}</p>` : ""}
      </div>
      <div class="card">
        <h2>Syllabus progress</h2>
        ${progHtml || `<p class="dash-empty">No courses configured.</p>`}
        <p class="pace-note">Bar = cells marked red, yellow, green, or blue; grey cells are excluded. ▏ marker = calendar pace (${Math.round(expected * 100)}%).</p>
      </div>
    </div>`;
}
