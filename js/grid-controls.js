import { store } from "./store.js";
import { cellKey, getCell } from "./models.js";
import { toast } from "./ui.js";
import { commitGridChange, replayGridChange } from "./grid-history.js";

export function parseClipboard(text) {
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((row) => row.split("\t"));
}

export function pasteTopics(grid, rows, columns, numWeeks, bounds) {
  const fill = rows.length === 1 && rows[0].length === 1;
  let clipped = false;
  let bottom = bounds.top;
  let right = bounds.left;
  const height = fill ? bounds.bottom - bounds.top + 1 : rows.length;
  for (let y = 0; y < height; y++) {
    const values = fill ? Array(bounds.right - bounds.left + 1).fill(rows[0][0]) : rows[y];
    for (let x = 0; x < values.length; x++) {
      const w = bounds.top + y;
      const col = columns[bounds.left + x];
      if (w >= numWeeks || !col) { clipped = true; continue; }
      const key = cellKey(w, col.courseId, col.track);
      const cell = { ...getCell(grid, w, col.courseId, col.track), topic: values[x] };
      if (!cell.topic && !cell.note && !cell.links?.length && cell.status === "none") delete grid[key];
      else grid[key] = cell;
      bottom = Math.max(bottom, w);
      right = Math.max(right, bounds.left + x);
    }
  }
  return { clipped, bottom, right };
}

export function bindGridControls(table, options) {
  const { columns, widths, numWeeks, layout, rerender, edit } = options;
  const editable = columns;
  const cells = [...table.querySelectorAll("td.cell")];
  const columnIndex = (point) => editable.findIndex((c) => c.key === point.key);
  const pointFor = (td) => ({ w: +td.dataset.w, key: `${td.dataset.course}:${td.dataset.track}` });
  let selection = options.selection;
  if (selection && (!editable.length || [selection.anchor, selection.end].some((p) => columnIndex(p) < 0 || p.w >= numWeeks))) selection = null;
  let gesture = null;
  let zoom = 1;
  const updateDimensions = () => {
    const cols = table.querySelectorAll("col");
    cols[0].style.width = `${104 * zoom}px`;
    widths.forEach((width, i) => { cols[i + 1].style.width = `${width * zoom}px`; });
    table.style.width = `${(104 + widths.reduce((a, b) => a + b, 0)) * zoom}px`;
    table.style.setProperty("--grid-scale", zoom);
  };
  const setWidth = (i, width) => {
    widths[i] = width;
    updateDimensions();
  };
  const bounds = () => ({
    top: Math.min(selection.anchor.w, selection.end.w),
    bottom: Math.max(selection.anchor.w, selection.end.w),
    left: Math.min(columnIndex(selection.anchor), columnIndex(selection.end)),
    right: Math.max(columnIndex(selection.anchor), columnIndex(selection.end)),
  });
  const paint = () => {
    const b = selection && bounds();
    for (const td of cells) {
      const p = pointFor(td), x = columnIndex(p);
      const selected = !!b && p.w >= b.top && p.w <= b.bottom && x >= b.left && x <= b.right;
      td.classList.toggle("selected", selected);
      td.classList.toggle("selection-active", !!selection && p.w === selection.end.w && p.key === selection.end.key);
      td.setAttribute("aria-selected", String(selected));
    }
  };
  paint();
  table.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const handle = e.target.closest("[data-resize]");
    if (handle) {
      e.preventDefault();
      const i = columns.findIndex((c) => c.key === handle.dataset.resize);
      gesture = { type: "resize", i, startX: e.clientX, width: widths[i], zoom };
      table.classList.add("resizing");
    } else {
      const td = e.target.closest("td.cell");
      if (!td) return;
      e.preventDefault();
      const point = pointFor(td);
      selection = { anchor: e.shiftKey && selection ? selection.anchor : point, end: point };
      gesture = { type: "select" };
      paint();
    }
    table.focus({ preventScroll: true });
    (handle || e.target.closest("td.cell")).setPointerCapture(e.pointerId);
  });
  table.addEventListener("pointermove", (e) => {
    if (!gesture) return;
    if (gesture.type === "resize") {
      const { i, startX, width } = gesture;
      setWidth(i, Math.max(80, Math.round(width + (e.clientX - startX) / gesture.zoom)));
    } else {
      const td = document.elementFromPoint(e.clientX, e.clientY)?.closest("td.cell");
      if (td && table.contains(td)) { selection.end = pointFor(td); paint(); }
      const wrap = table.parentElement, rect = wrap.getBoundingClientRect();
      if (e.clientY > rect.bottom - 24) wrap.scrollTop += 12;
      if (e.clientY < rect.top + 60) wrap.scrollTop -= 12;
      if (e.clientX > rect.right - 24) wrap.scrollLeft += 12;
      if (e.clientX < rect.left + 24) wrap.scrollLeft -= 12;
    }
  });
  const finish = (e) => {
    if (gesture?.type === "resize") {
      const { i, width } = gesture;
      if (e?.type !== "pointerup") setWidth(i, width);
      else if (widths[i] !== width) {
        const before = store.getGridLayout() || {};
        commitGridChange("layout", before, { ...before, [columns[i].key]: widths[i] });
        layout[columns[i].key] = widths[i];
      }
    }
    gesture = null;
    table.classList.remove("resizing");
  };
  table.addEventListener("pointerup", finish);
  table.addEventListener("pointercancel", finish);
  table.addEventListener("lostpointercapture", finish);
  table.addEventListener("dblclick", (e) => {
    const td = e.target.closest("td.cell");
    if (td && !e.target.closest("button")) edit(td);
  });
  table.addEventListener("keydown", (e) => {
    if (e.target !== table) return;
    const command = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (command && (key === "z" || key === "y")) {
      e.preventDefault();
      if (gesture) finish();
      if (replayGridChange(key === "y" || e.shiftKey)) rerender();
      return;
    }
    if (e.key === "Escape" && gesture?.type === "resize") { e.preventDefault(); finish(); return; }
    if (!editable.length || !numWeeks) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selection && !command && !e.altKey) {
      e.preventDefault();
      const before = store.getGrid(), grid = { ...before };
      pasteTopics(grid, [[""]], editable, numWeeks, bounds());
      if (commitGridChange("cells", before, grid)) rerender();
      return;
    }
    if (e.key === "Escape") { selection = null; paint(); return; }
    if (e.key === "Enter" && selection) {
      e.preventDefault();
      const td = cells.find((td) => { const p = pointFor(td); return p.w === selection.end.w && p.key === selection.end.key; });
      if (td) edit(td);
      return;
    }
    const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const old = selection?.end;
    const point = { w: Math.max(0, Math.min(numWeeks - 1, (old?.w ?? 0) + (old ? delta[0] : 0))),
      key: editable[Math.max(0, Math.min(editable.length - 1, (old ? columnIndex(old) : 0) + (old ? delta[1] : 0)))].key };
    selection = { anchor: e.shiftKey && selection ? selection.anchor : point, end: point };
    paint();
    cells.find((td) => { const p = pointFor(td); return p.w === point.w && p.key === point.key; })?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  table.addEventListener("paste", (e) => {
    if (e.target !== table || !selection || !e.clipboardData) return;
    e.preventDefault();
    const before = store.getGrid(), grid = { ...before }, b = bounds();
    const result = pasteTopics(grid, parseClipboard(e.clipboardData.getData("text/plain")), editable, numWeeks, b);
    commitGridChange("cells", before, grid);
    selection = { anchor: { w: b.top, key: editable[b.left].key }, end: { w: result.bottom, key: editable[result.right].key } };
    rerender();
    if (result.clipped) toast("Pasted topics that fit. Some content exceeded the grid boundaries.");
  });
  const setZoom = (value) => {
    if (gesture) finish();
    const previous = zoom;
    zoom = [0.5, 0.75, 1, 1.25, 1.5].includes(value) ? value : 1;
    const wrap = table.parentElement;
    const top = wrap.scrollTop / previous, left = wrap.scrollLeft / previous;
    updateDimensions();
    wrap.scrollTop = top * zoom;
    wrap.scrollLeft = left * zoom;
  };
  return { getSelection: () => selection, setZoom };
}
