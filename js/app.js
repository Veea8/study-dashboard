// App entry: hash router, theme handling, auth bootstrap.

import { store } from "./store.js";
import { toast } from "./ui.js";
import { initAuth, getAccount } from "./auth.js";
import { syncNow, summaryText } from "./sync.js";
import * as dashboard from "./views/dashboard.js";
import * as grid from "./views/grid.js";
import * as tasks from "./views/tasks.js";
import * as calendar from "./views/calendar.js";
import * as settings from "./views/settings.js";

const routes = { dashboard, grid, tasks, calendar, settings };

const viewEl = () => document.getElementById("view");

/* ---------- theme ---------- */

export function applyTheme() {
  const theme = store.getSettings()?.theme ?? "system";
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  btn.textContent = theme === "light" ? "○" : theme === "dark" ? "●" : "◐";
  btn.title = `Theme: ${theme} (click to switch)`;
}

function cycleTheme() {
  const order = ["system", "light", "dark"];
  const s = store.getSettings();
  if (!s) return;
  s.theme = order[(order.indexOf(s.theme ?? "system") + 1) % order.length];
  store.saveSettings(s);
  applyTheme();
}

/* ---------- routing ---------- */

function currentRoute() {
  return location.hash.replace(/^#\/?/, "") || "dashboard";
}

function setActiveNav(name) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
}

export function router() {
  const container = viewEl();
  if (!store.getSettings()) {
    setActiveNav(null);
    settings.renderOnboarding(container, () => {
      applyTheme();
      location.hash = "#/dashboard";
      router();
    });
    return;
  }
  const name = routes[currentRoute()] ? currentRoute() : "dashboard";
  setActiveNav(name);
  routes[name].render(container);
}

/* ---------- auth chip ---------- */

function updateAuthChip() {
  const account = getAccount();
  document.getElementById("auth-chip").textContent = account
    ? `⦿ ${account.name || account.username || "signed in"}`
    : "";
}

/* ---------- boot ---------- */

applyTheme();
document.getElementById("theme-toggle").onclick = cycleTheme;
window.addEventListener("hashchange", router);
router();

initAuth()
  .then((account) => {
    updateAuthChip();
    // One quiet pull per browser session so widget check-offs show up.
    if (account && store.getSettings() && !sessionStorage.getItem("sp.autoSynced")) {
      sessionStorage.setItem("sp.autoSynced", "1");
      syncNow()
        .then((s) => {
          toast(summaryText(s));
          if (["tasks", "dashboard"].includes(currentRoute())) router();
        })
        .catch((e) => console.warn("Auto-sync failed:", e));
    }
  })
  .catch((e) => console.warn("Auth init failed:", e));
