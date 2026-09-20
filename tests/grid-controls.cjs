const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const memory = new Map();
const context = vm.createContext({ localStorage: {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
}, Date, console });
const modules = new Map();
async function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
  modules.set(file, mod);
  await mod.link((specifier) => load(path.resolve(path.dirname(file), specifier)));
  return mod;
}

(async () => {
  const mod = await load(path.join(__dirname, '../js/grid-controls.js'));
  await mod.evaluate();
  const { parseClipboard, pasteTopics, bindGridControls } = mod.namespace;
  const models = modules.get(path.resolve(__dirname, '../js/models.js')).namespace;
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(parseClipboard('A\tB\r\nC\t\r\n')), [['A', 'B'], ['C', '']]);
  assert.deepEqual(plain(parseClipboard('A\n\n')), [['A'], ['']]);
  const columns = [{ key: 'a:lecture', courseId: 'a', track: 'lecture' }, { key: 'a:exercises', courseId: 'a', track: 'exercises' }];
  const grid = { '0:a:lecture': { topic: 'old', status: 'partial', note: 'keep', links: [{ url: 'https://example.com' }] } };
  const bounds = { top: 0, bottom: 1, left: 0, right: 1 };
  pasteTopics(grid, parseClipboard('A\tB\nC\tD'), columns, 2, bounds);
  assert.equal(grid['1:a:exercises'].topic, 'D');
  assert.equal(grid['0:a:lecture'].status, 'partial');
  assert.equal(grid['0:a:lecture'].note, 'keep');
  assert.equal(grid['0:a:lecture'].links[0].url, 'https://example.com');
  pasteTopics(grid, [['same']], columns, 2, bounds);
  assert.equal(grid['1:a:exercises'].topic, 'same');
  pasteTopics(grid, [['']], columns, 2, bounds);
  assert.equal(grid['0:a:lecture'].topic, '');
  assert.equal(grid['1:a:exercises'], undefined);
  assert.equal(pasteTopics(grid, [['A', 'B', 'C'], ['D']], columns, 1, bounds).clipped, true);

  const sessionGrid = {};
  const sessionBounds = { top: 0, bottom: 3, left: 0, right: 0 };
  const rowToCell = (row) => ({ weekIndex: Math.floor(row / 2), session: row % 2 });
  pasteTopics(sessionGrid, parseClipboard('W1S1\nW1S2\nW2S1\nW2S2'), columns, 4, sessionBounds, rowToCell);
  assert.equal(sessionGrid['0:a:lecture'].topic, 'W1S1');
  assert.equal(sessionGrid['0:a:lecture:2'].topic, 'W1S2');
  assert.equal(sessionGrid['1:a:lecture'].topic, 'W2S1');
  assert.equal(sessionGrid['1:a:lecture:2'].topic, 'W2S2');
  assert.equal(models.cellKey(0, 'a', 'lecture'), '0:a:lecture');
  assert.equal(models.cellKey(0, 'a', 'lecture', 1), '0:a:lecture:2');
  assert.equal(models.getCell({ '0:a:lecture': { topic: 'existing', status: 'full' } }, 0, 'a', 'lecture').topic, 'existing');
  assert.equal(models.getCell({ '0:a:lecture': { topic: 'existing', status: 'full' } }, 0, 'a', 'lecture', 1).topic, '');
  assert.equal(models.courseProgress({
    '0:a:lecture': { status: 'full' },
    '0:a:exercises': { status: 'full' },
    '0:a:lecture:2': { status: 'full' },
    '0:a:exercises:2': { status: 'full' },
  }, { numWeeks: 1 }, 'a'), 1);

  const handlers = {};
  const cells = Array.from({ length: 4 }, (_, i) => ({
    dataset: { w: String(Math.floor(i / 2)), course: 'a', track: i % 2 ? 'exercises' : 'lecture' },
    classList: { toggle() {} }, setAttribute() {}, scrollIntoView() {}, setPointerCapture() {},
  }));
  const table = { querySelectorAll: () => cells, addEventListener: (name, fn) => { handlers[name] = fn; } };
  let edits = 0;
  const controls = bindGridControls(table, { columns, widths: [160, 160], numWeeks: 2, layout: {}, edit: () => edits++ });
  const key = (name, shiftKey = false, target = table) => handlers.keydown({ key: name, shiftKey, target, preventDefault() {} });
  key('ArrowRight'); key('ArrowDown', true); key('ArrowRight', true);
  assert.deepEqual(plain(controls.getSelection()), { anchor: { w: 0, key: 'a:lecture' }, end: { w: 1, key: 'a:exercises' } });
  key('Enter'); assert.equal(edits, 1);
  key('ArrowUp', false, {}); assert.equal(controls.getSelection().end.w, 1);
  key('Escape'); assert.equal(controls.getSelection(), null);

  const cols = [{ style: {} }, { style: {} }, { style: {} }];
  table.focus = () => {};
  table.style = { setProperty(name, value) { this[name] = value; } };
  table.classList = { add() {}, remove() {} };
  table.contains = (td) => cells.includes(td);
  table.parentElement = { scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => ({ top: 0, bottom: 500, left: 0, right: 500 }) };
  table.querySelectorAll = (selector) => selector === 'col' ? cols : cells;
  const targetFor = (td) => ({ closest: (selector) => selector === 'td.cell' ? td : null });
  context.document = { elementFromPoint: () => targetFor(cells[0]) };
  handlers.pointerdown({ button: 0, target: targetFor(cells[3]), clientX: 100, pointerId: 1, preventDefault() {} });
  handlers.pointermove({ clientX: 100, clientY: 100 });
  handlers.pointerup({ type: 'pointerup' });
  assert.deepEqual(plain(controls.getSelection()), { anchor: { w: 1, key: 'a:exercises' }, end: { w: 0, key: 'a:lecture' } });
  handlers.dblclick({ target: targetFor(cells[0]) }); assert.equal(edits, 2);
  const handle = { dataset: { resize: 'a:lecture' }, setPointerCapture() {} };
  handlers.pointerdown({ button: 0, target: { closest: (selector) => selector === '[data-resize]' ? handle : null }, clientX: 100, pointerId: 2, preventDefault() {} });
  handlers.pointermove({ clientX: 150 }); handlers.pointerup({ type: 'pointerup' });
  assert.equal(cols[1].style.width, '210px');

  table.parentElement.scrollTop = 100;
  table.parentElement.scrollLeft = 40;
  controls.setZoom(0.5);
  assert.equal(cols[0].style.width, '52px');
  assert.equal(cols[1].style.width, '105px');
  assert.equal(table.parentElement.scrollTop, 50);
  assert.equal(table.parentElement.scrollLeft, 20);
  const selectionBeforeZoom = plain(controls.getSelection());
  handlers.pointerdown({ button: 0, target: { closest: (selector) => selector === '[data-resize]' ? handle : null }, clientX: 100, pointerId: 4, preventDefault() {} });
  handlers.pointermove({ clientX: 125 });
  assert.equal(cols[1].style.width, '130px');
  handlers.pointercancel({ type: 'pointercancel' });
  assert.equal(cols[1].style.width, '105px');
  controls.setZoom(1.5);
  assert.equal(cols[1].style.width, '315px');
  handlers.pointerdown({ button: 0, target: { closest: (selector) => selector === '[data-resize]' ? handle : null }, clientX: 100, pointerId: 5, preventDefault() {} });
  handlers.pointermove({ clientX: 130 });
  assert.equal(cols[1].style.width, '345px');
  handlers.pointercancel({ type: 'pointercancel' });
  assert.deepEqual(plain(controls.getSelection()), selectionBeforeZoom);
  controls.setZoom(1);
  const storedLayout = JSON.parse(memory.get('sp.gridLayout'));
  assert.equal(storedLayout['a:lecture'], 210);
  handlers.pointerdown({ button: 0, target: { closest: (selector) => selector === '[data-resize]' ? handle : null }, clientX: 150, pointerId: 3, preventDefault() {} });
  handlers.pointermove({ clientX: 250 });
  assert.equal(cols[1].style.width, '310px');
  assert.equal(JSON.parse(memory.get('sp.gridLayout'))['a:lecture'], 210);
  handlers.pointercancel({ type: 'pointercancel' });
  assert.equal(cols[1].style.width, '210px');

  let rerenders = 0;
  const pasteControls = bindGridControls(table, { columns, widths: [160, 160], numWeeks: 2, layout: {},
    selection: { anchor: { w: 0, key: 'a:lecture' }, end: { w: 0, key: 'a:lecture' } }, rerender: () => rerenders++, edit() {} });
  handlers.paste({ target: table, preventDefault() {}, clipboardData: { getData: () => 'One\tTwo\nThree\tFour' } });
  assert.equal(JSON.parse(memory.get('sp.grid'))['1:a:exercises'].topic, 'Four');
  assert.equal(rerenders, 1);

  const shortcut = (name, extras = {}) => handlers.keydown({ target: table, key: name, preventDefault() {}, ...extras });
  shortcut('Delete');
  assert.deepEqual(JSON.parse(memory.get('sp.grid')), {});
  shortcut('z', { ctrlKey: true });
  assert.equal(JSON.parse(memory.get('sp.grid'))['1:a:exercises'].topic, 'Four');
  shortcut('z', { metaKey: true, shiftKey: true });
  assert.deepEqual(JSON.parse(memory.get('sp.grid')), {});
  shortcut('z', { ctrlKey: true });
  shortcut('Backspace');
  shortcut('y', { ctrlKey: true });
  assert.deepEqual(JSON.parse(memory.get('sp.grid')), {});
  shortcut('z', { ctrlKey: true });
  shortcut('z', { ctrlKey: true });
  assert.deepEqual(JSON.parse(memory.get('sp.grid')), {});
  shortcut('z', { ctrlKey: true });
  assert.equal(JSON.parse(memory.get('sp.gridLayout'))['a:lecture'], undefined);
  shortcut('y', { ctrlKey: true });
  assert.equal(JSON.parse(memory.get('sp.gridLayout'))['a:lecture'], 210);
  assert.equal(pasteControls.getSelection().end.w, 1);
  handlers.paste({ target: {}, clipboardData: { getData: () => 'ignored' } });
  const priorRerenders = rerenders;
  shortcut('Delete', { target: {} });
  assert.equal(rerenders, priorRerenders);

  const store = modules.get(path.resolve(__dirname, '../js/store.js')).namespace.store;
  store.saveSettings({ numWeeks: 2 }); store.saveGridLayout({ 'a:lecture': 220, zoom: 0.75 });
  const backup = store.exportAll(); store.resetAll(); store.importAll(backup);
  assert.equal(store.getGridLayout()['a:lecture'], 220);
  assert.equal(store.getGridLayout().zoom, 0.75);
  store.resetAll(); store.importAll(JSON.stringify({ settings: { numWeeks: 2 }, grid: {} }));
  assert.deepEqual(plain(store.getGridLayout()), {});
  const history = modules.get(path.resolve(__dirname, '../js/grid-history.js')).namespace;
  store.saveGrid({ unrelated: { topic: 'keep' } });
  history.commitGridChange('cells', {}, { edited: { topic: 'before', status: 'partial', note: 'note', links: [] } });
  history.commitGridChange('cells', store.getGrid(), { ...store.getGrid(), edited: { ...store.getGrid().edited, topic: '' } });
  history.replayGridChange();
  assert.equal(store.getGrid().edited.topic, 'before');
  assert.equal(store.getGrid().edited.note, 'note');
  assert.equal(store.getGrid().unrelated.topic, 'keep');
  assert.equal(history.commitGridChange('cells', store.getGrid(), store.getGrid()), false);
  assert.equal(history.replayGridChange(true), true);
  assert.equal(store.getGrid().edited.topic, '');
  for (let i = 0; i < 105; i++) history.commitGridChange('cells', store.getGrid(), { ...store.getGrid(), counter: { topic: String(i) } });
  let undoCount = 0;
  while (history.replayGridChange()) undoCount++;
  assert.equal(undoCount, 100);
  // Parsing the view module also verifies all its imports and JavaScript syntax.
  await load(path.join(__dirname, '../js/views/grid.js'));
  console.log('Grid paste, Delete, undo/redo, history limits, live resize/cancel, selection, syntax, and backup checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
