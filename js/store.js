// Data layer. All persistence goes through this module so the
// localStorage backend can later be swapped (Firebase/Supabase/…)
// without touching the views.

const K = {
  settings: "sp.settings",
  courses: "sp.courses",
  grid: "sp.grid",
  gridLayout: "sp.gridLayout",
  tasks: "sp.tasks",
  blocks: "sp.blocks",
  tombstones: "sp.tombstones",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const store = {
  getSettings: () => read(K.settings, null),
  saveSettings: (s) => write(K.settings, s),

  getCourses: () => read(K.courses, []),
  saveCourses: (c) => write(K.courses, c),

  getGrid: () => read(K.grid, {}),
  saveGrid: (g) => write(K.grid, g),

  getGridLayout: () => read(K.gridLayout, {}),
  saveGridLayout: (layout) => write(K.gridLayout, layout),

  getTasks: () => read(K.tasks, []),
  saveTasks: (t) => write(K.tasks, t),

  getBlocks: () => read(K.blocks, []),
  saveBlocks: (b) => write(K.blocks, b),

  // Graph items deleted locally while offline; removed remotely on next sync.
  getTombstones: () => read(K.tombstones, { tasks: [], checklist: [] }),
  saveTombstones: (t) => write(K.tombstones, t),

  exportAll() {
    const out = {};
    for (const [name, key] of Object.entries(K)) out[name] = read(key, null);
    out._exportedAt = new Date().toISOString();
    return JSON.stringify(out, null, 2);
  },

  importAll(json) {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object" || !data.settings) {
      throw new Error("Not a valid planner backup (missing settings).");
    }
    for (const [name, key] of Object.entries(K)) {
      if (data[name] !== null && data[name] !== undefined) write(key, data[name]);
    }
  },

  resetAll() {
    for (const key of Object.values(K)) localStorage.removeItem(key);
  },
};
