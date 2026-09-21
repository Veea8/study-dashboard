# CS Semester Planner

A personal, single-user web app for planning and tracking a self-study CS semester:

- **Semester grid** — two independent sessions per week × courses, each with *Lecture* and *Exercises* tracked through
  Grey is the unmarked default; the labeled statuses are Not started (red) → Started (yellow) → Partly done (green) → Fully done (blue), plus topic, notes and resource links per cell.
  Click to select, drag or Shift-click to select a range, and paste a whole list or tab-separated
  spreadsheet block into topics. Double-click or press Enter to edit a cell. Drag the edges of
  Lecture/Exercises headers to resize columns; widths are remembered and included in backups.
  Topics show on one line and reveal more as you widen columns. Delete/Backspace clears selected
  topics; Ctrl/Cmd+Z undoes grid edits and resizing. Ctrl/Cmd+Shift+Z or Ctrl+Y redoes them.
  Use the grid's Zoom dropdown (50%–150%) to see more of the semester or enlarge the table;
  zoom is remembered without changing your saved column widths.
- **Tasks** — assignment/deadline tracker with **two-way Microsoft To Do sync**
  (check things off from the To Do Android widget; the planner picks it up on next sync).
  Sub-items sync as real To Do checklist steps.
- **Calendar** — study time-blocking with planned vs. actual minutes and per-course/per-week rollups.
- **Dashboard** — due this week, current-week status, today's blocks, syllabus progress vs. calendar pace.
  The syllabus bar counts each non-grey grid cell once, regardless of which colored status it has.

Fully static (vanilla JS, no build step), hosted on GitHub Pages. Planner data lives in the
browser's localStorage (use *Settings → Export backup* regularly); only the task list goes
through Microsoft's servers via the Graph API.

## Run locally

Native ES modules need an HTTP server (not `file://`):

```
python -m http.server 8000
# then open http://localhost:8000/
```

## Setup — manual steps (one-time)

### 1. GitHub Pages

1. Create a **public** repo on your GitHub account and push this project to `main`.
2. Repo → Settings → Pages → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`.
3. Note your Pages URL: `https://<username>.github.io/<repo>/`.

Every later `git push` to `main` redeploys automatically.

### 2. Azure app registration (for Microsoft To Do sync)

Free, done once under your personal Microsoft account at [portal.azure.com](https://portal.azure.com):

1. **App registrations → New registration**
2. Supported account types: **"Accounts in any organizational directory … and personal Microsoft accounts"**
   (required for a personal Microsoft account).
3. Redirect URI: platform **Single-page application (SPA)**, value = your Pages URL from step 1.
   Also add `http://localhost:8000/` as a second SPA redirect URI for local testing.
4. After registration: **API permissions → Add a permission → Microsoft Graph → Delegated** →
   add `Tasks.ReadWrite` and `User.Read`.
5. Copy the **Application (client) ID** from the Overview page.

### 3. Configure the app

Put the client ID in **either** place (it is not a secret — safe to commit):

- `js/config.js` → `MS_CLIENT_ID` (recommended: follows you to every device), or
- in-app **Settings → Microsoft To Do** (stored only in that browser).

Then sign in via *Settings* or the *Tasks* view. On first sync the planner creates a
Microsoft To Do list named **"CS Semester Planner"** (rename in Settings if you like)
and keeps it in sync from then on.

## How sync behaves

- Manual **⟳ Sync** button on the Tasks view, plus one automatic pull when the app loads
  while signed in, plus a quiet push after you create/edit/check off a task in the planner.
- Completion state is merged both ways (un-checking propagates too). For title/due-date
  edits, the planner wins if you edited locally since the last sync; otherwise remote
  edits are adopted.
- Tasks created directly in To Do are imported (without a course — assign one when editing).
- Deleting a synced task in the planner deletes it in To Do; deleting it in To Do keeps the
  planner copy but marks it *unlinked*.
- Grid data and calendar blocks never touch Microsoft — they are planner-only.

## Notes

- `msal-browser` v3 is pinned from jsDelivr in `index.html` (Microsoft's own CDN only
  hosts the outdated v2.x line).
- The security boundary is Microsoft's sign-in itself: the client ID and redirect URI are
  public by design; only your authenticated session can touch your To Do data.
