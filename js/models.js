// Entity constants and pure helpers (dates, week math, progress).

export const STATUSES = ["none", "behind", "started", "partial", "full"];
export const STATUS_LABELS = {
  none: "Unmarked",
  // Keep the stored key for existing red cells; only its display name changes.
  behind: "Not started",
  started: "Started",
  partial: "Partly done",
  full: "Fully done",
};

export const TRACKS = ["lecture", "exercises"];
export const TRACK_LABELS = { lecture: "Lecture", exercises: "Exerc." };
export const SESSIONS_PER_WEEK = 2;

export const TASK_TYPES = ["homework", "project", "reading", "lab", "examprep"];
export const TASK_TYPE_LABELS = {
  homework: "Homework",
  project: "Project",
  reading: "Reading",
  lab: "Lab",
  examprep: "Exam prep",
};

export function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- dates (all local-time, no UTC surprises) ---------- */

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function mondayOf(d) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (out.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(out, -shift);
}

/** "16.2." style short date */
export function fmtShort(d) {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/** Monday of week i (0-based) of the semester. */
export function weekMonday(settings, i) {
  return addDays(mondayOf(fromISODate(settings.semesterStart)), i * 7);
}

/** Spreadsheet-style Mon–Fri label: "16.–20.2." or "27.4.–1.5." */
export function weekLabel(settings, i) {
  const mon = weekMonday(settings, i);
  const fri = addDays(mon, 4);
  if (mon.getMonth() === fri.getMonth()) {
    return `${mon.getDate()}.–${fri.getDate()}.${fri.getMonth() + 1}.`;
  }
  return `${fmtShort(mon)}–${fmtShort(fri)}`;
}

/** Index of the week containing `date` (default today). May be <0 or >= numWeeks. */
export function currentWeekIndex(settings, date = today()) {
  const start = mondayOf(fromISODate(settings.semesterStart));
  return Math.floor((mondayOf(date) - start) / (7 * 24 * 3600 * 1000));
}

/* ---------- grid cells ---------- */

export function cellKey(weekIndex, courseId, track, session = 0) {
  const base = `${weekIndex}:${courseId}:${track}`;
  return session === 0 ? base : `${base}:${session + 1}`;
}

export function getCell(grid, weekIndex, courseId, track, session = 0) {
  return (
    grid[cellKey(weekIndex, courseId, track, session)] || {
      topic: "",
      status: "none",
      note: "",
      links: [],
    }
  );
}

/** Share of syllabus cells with a non-grey status, 0..1. */
export function courseProgress(grid, settings, courseId) {
  const total = settings.numWeeks * TRACKS.length * SESSIONS_PER_WEEK;
  if (!total) return 0;
  let sum = 0;
  for (let w = 0; w < settings.numWeeks; w++) {
    for (let session = 0; session < SESSIONS_PER_WEEK; session++) {
      for (const track of TRACKS) {
        if (getCell(grid, w, courseId, track, session).status !== "none") sum++;
      }
    }
  }
  return sum / total;
}

/** Where the calendar says you "should" be, 0..1 (end of current week). */
export function expectedProgress(settings) {
  const wk = currentWeekIndex(settings);
  return Math.min(1, Math.max(0, (wk + 1) / settings.numWeeks));
}

/* ---------- misc formatting ---------- */

export function fmtMin(min) {
  if (min == null || isNaN(min)) return "–";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function sortedCourses(courses) {
  return [...courses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function defaultSettings() {
  return {
    schemaVersion: 1,
    semesterStart: toISODate(mondayOf(today())),
    numWeeks: 14,
    theme: "system",
    msal: { clientId: "", redirectUri: "" },
    todo: { listName: "", listId: null, lastSyncAt: null },
  };
}
