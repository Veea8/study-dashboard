import { store } from "./store.js";

const undoStack = [];
const redoStack = [];
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// Record only changed keys, preserving data outside the action when replaying it.
export function commitGridChange(kind, before, after) {
  const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key, before: copy(before[key]), after: copy(after[key]) }));
  if (!changes.length) return false;
  const action = { kind, changes };
  apply(action, "after");
  undoStack.push(action);
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  return true;
}

function apply(action, direction) {
  const data = action.kind === "layout" ? store.getGridLayout() || {} : store.getGrid();
  for (const change of action.changes) {
    if (change[direction] === undefined) delete data[change.key];
    else data[change.key] = copy(change[direction]);
  }
  if (action.kind === "layout") store.saveGridLayout(data);
  else store.saveGrid(data);
}

export function replayGridChange(redo = false) {
  const source = redo ? redoStack : undoStack;
  const destination = redo ? undoStack : redoStack;
  const action = source[source.length - 1];
  if (!action) return false;
  apply(action, redo ? "after" : "before");
  source.pop();
  destination.push(action);
  return true;
}
