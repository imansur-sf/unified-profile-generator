const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

// These are JavaScript/DOM-contract regressions, not browser rendering tests.
function harness() {
  const nodes = new Map(), timers = [], windowEvents = new Map(), documentEvents = new Map();
  let activeElement = null;
  class Element {
    constructor(tagName = 'div', id = '') {
      this.tagName = tagName.toUpperCase(); this.style = {}; this.attrs = {}; this.events = new Map();
      this.children = []; this.dataset = {}; this.textContent = ''; this.clientWidth = 0; this.clientHeight = 0;
      this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (id) this.id = id;
    }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      this._html = value;
      for (const [, tag, id] of value.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"/g)) {
        const child = new Element(tag, id); child.parentElement = this; this.children.push(child);
      }
    }
    get innerHTML() { return this._html || ''; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    addEventListener(name, fn) { this.events.set(name, fn); }
    querySelector(selector) {
      if (!selector.startsWith('#')) return null;
      return this.children.find(child => child.id === selector.slice(1)) || null;
    }
    querySelectorAll() { return []; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() { if (nodes.get(this.id) === this) nodes.delete(this.id); }
    focus() { activeElement = this; }
    async click() { return this.events.get('click')?.({ target: this }); }
  }
  const document = {
    readyState: 'loading', body: new Element('body'), fullscreenElement: null,
    get activeElement() { return activeElement; },
    getElementById: id => nodes.get(id) || null, createElement: tag => new Element(tag),
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener: (name, fn) => documentEvents.set(name, fn),
    removeEventListener: (name, fn) => { if (documentEvents.get(name) === fn) documentEvents.delete(name); }
  };
  const context = vm.createContext({
    console, URL, Blob, TextEncoder, AbortController, document,
    window: { addEventListener: (name, fn) => windowEvents.set(name, fn), location: { href: 'https://upg.example/' } },
    setTimeout: fn => timers.push(fn), clearTimeout() {}, requestAnimationFrame: fn => timers.push(fn),
    localStorage: { getItem() { return null; } }, alert: () => assert.fail('Unexpected blocking alert'), confirm: () => true,
    fetch: async () => assert.fail('No network is allowed in presentation tests')
  });
  for (const file of ['defaults', 'profile-contract', 'generator', 'brand-logo', 'pagehost', 'editor-support', 'app']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', `${file}.js`), 'utf8'), context, { filename: `${file}.js` });
  }
  const run = source => vm.runInContext(source, context);
  return { context, document, nodes, timers, windowEvents, documentEvents, run,
    element: (id, width = 0, height = 0) => Object.assign(new Element('div', id), { clientWidth: width, clientHeight: height }) };
}

test('the shared logical canvas is frozen and exactly 16:9', () => {
  const h = harness();
  assert.deepEqual(plain(h.run('PROFILE_CANVAS')), { width: 1600, height: 900 });
  assert.equal(h.run('Object.isFrozen(PROFILE_CANVAS)'), true);
  near(h.run('PROFILE_CANVAS.width / PROFILE_CANVAS.height'), 16 / 9);
});

test('column defaults and legacy middle widths preserve the 1548px content budget', () => {
  const h = harness();
  assert.deepEqual(plain(h.context.getProfileColumnWidths()), { leftColWidth: 320, middleColWidth: 400, rightColWidth: 828 });
  const legacy = { leftColWidth: 290, middleColWidth: 320 };
  const before = JSON.stringify(legacy);
  const migrated = h.context.getProfileColumnWidths(legacy);
  assert.deepEqual(plain(migrated), { leftColWidth: 290, middleColWidth: 360, rightColWidth: 898 });
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(plain(h.context.getProfileColumnWidths(migrated)), plain(migrated), 'migration must not add another 40px');
});

const bounds = { leftColWidth: [240, 500], middleColWidth: [280, 560], rightColWidth: [488, 1028] };
function assertColumns(widths) {
  assert.deepEqual(Object.keys(widths).sort(), Object.keys(bounds).sort());
  assert.equal(Object.values(widths).reduce((sum, value) => sum + value, 0), 1548);
  for (const [field, [min, max]] of Object.entries(bounds)) {
    assert.ok(Number.isInteger(widths[field]));
    assert.ok(widths[field] >= min && widths[field] <= max, `${field} outside its bounds`);
  }
}

test('column resize is immutable, honors the selected field, and redistributes predictably', () => {
  const h = harness(), initial = Object.freeze({ leftColWidth: 320, middleColWidth: 400, rightColWidth: 828 });
  for (const [field, value, expected] of [
    ['leftColWidth', 400, { leftColWidth: 400, middleColWidth: 400, rightColWidth: 748 }],
    ['middleColWidth', 480, { leftColWidth: 320, middleColWidth: 480, rightColWidth: 748 }],
    ['rightColWidth', 900, { leftColWidth: 320, middleColWidth: 328, rightColWidth: 900 }],
    ['rightColWidth', 1028, { leftColWidth: 240, middleColWidth: 280, rightColWidth: 1028 }],
    ['rightColWidth', 488, { leftColWidth: 500, middleColWidth: 560, rightColWidth: 488 }]
  ]) {
    const result = h.context.resizeProfileColumns(initial, field, value);
    assert.deepEqual(plain(result), expected); assertColumns(result); assert.notEqual(result, initial);
  }
  assert.deepEqual(initial, { leftColWidth: 320, middleColWidth: 400, rightColWidth: 828 });
});

test('extreme, invalid and repeated column changes remain finite and bounded', () => {
  const h = harness();
  for (const layout of [{}, { leftColWidth: -3, middleColWidth: NaN }, { leftColWidth: Infinity, middleColWidth: 'bad', rightColWidth: 0 }, { leftColWidth: 5000, middleColWidth: 5000 }]) {
    assertColumns(h.context.getProfileColumnWidths(layout));
  }
  let widths = h.context.getProfileColumnWidths();
  for (const field of Object.keys(bounds)) for (const value of [-1, 0, 1, 240, 500, 900, 999999, NaN, Infinity, 'bad']) {
    const before = JSON.stringify(widths);
    const next = h.context.resizeProfileColumns(widths, field, value);
    assertColumns(next); assert.equal(JSON.stringify(widths), before); widths = next;
  }
  for (const field of ['__proto__', 'constructor', 'notAColumn']) {
    assert.deepEqual(plain(h.context.resizeProfileColumns(widths, field, 300)), plain(widths));
  }
});

function layoutHarness() {
  const h = harness();
  for (const id of ['left-col-w', 'middle-col-w', 'right-col-w', 'left-col-w-val', 'middle-col-w-val', 'right-col-w-val', 'right-col-width-control', 'left-col-w-label', 'middle-col-w-label']) h.element(id);
  h.context.layoutRefreshCalls = 0;
  h.run('refreshPreview=()=>{layoutRefreshCalls++};state.profileType="b2c";state.layout=getProfileColumnWidths()');
  return h;
}

function assertLayoutEchoes(h) {
  const widths = h.run('getProfileColumnWidths(state.layout)');
  const ids = { leftColWidth: 'left-col-w', middleColWidth: 'middle-col-w', rightColWidth: 'right-col-w' };
  for (const [field, id] of Object.entries(ids)) {
    assert.equal(Number(h.nodes.get(id).value), widths[field], `${field} slider is stale`);
    assert.equal(h.nodes.get(`${id}-val`).textContent, `${widths[field]}px`, `${field} label is stale`);
  }
  assertColumns(widths);
}

test('each B2C slider refreshes all three values and invalid changes are ignored', () => {
  const h = layoutHarness(); h.context.syncLayoutControls(); assertLayoutEchoes(h);
  assert.equal(h.nodes.get('right-col-width-control').hidden, false);
  for (const [field, value] of [['rightColWidth', '900'], ['leftColWidth', '400'], ['middleColWidth', '500']]) {
    h.context.onLayoutChange(field, value);
    assert.equal(h.run(`state.layout.${field}`), Number(value));
    assertLayoutEchoes(h);
  }
  assert.equal(h.context.layoutRefreshCalls, 3);
  const before = h.run('JSON.stringify(state.layout)');
  for (const [field, value] of [['unknown', 300], ['__proto__', 300], ['constructor', 300], ['rightColWidth', NaN], ['middleColWidth', Infinity], ['leftColWidth', 'bad']]) h.context.onLayoutChange(field, value);
  assert.equal(h.run('JSON.stringify(state.layout)'), before);
  assert.equal(h.context.layoutRefreshCalls, 3);
});

test('legacy display is non-mutating and edited widths survive a JSON save/reload unchanged', () => {
  const h = layoutHarness();
  h.run('state.layout={leftColWidth:290,middleColWidth:320}');
  h.context.syncLayoutControls();
  assert.equal(Number(h.nodes.get('middle-col-w').value), 360);
  assert.deepEqual(plain(h.run('state.layout')), { leftColWidth: 290, middleColWidth: 320 });
  h.context.onLayoutChange('rightColWidth', 900); assertLayoutEchoes(h);
  const saved = h.run('JSON.stringify(state.layout)');
  h.context.savedLayout = saved;
  h.run('state.layout=JSON.parse(savedLayout)');
  h.context.syncLayoutControls(); assertLayoutEchoes(h);
  assert.equal(h.run('JSON.stringify(state.layout)'), saved);
  assert.deepEqual(plain(h.run('getProfileColumnWidths(state.layout)')), JSON.parse(saved));
  h.context.resetLayoutWidths();
  assert.deepEqual(plain(h.run('state.layout')), { leftColWidth: 320, middleColWidth: 400, rightColWidth: 828 });
  assertLayoutEchoes(h);
});

test('B2B keeps middleColWidth as its action rail and ignores the hidden third slider', () => {
  const h = layoutHarness();
  h.run('state.profileType="b2b";state.layout={leftColWidth:300,middleColWidth:310}');
  h.context.syncLayoutControls(); h.context.updateProfileModeUI();
  assert.equal(Number(h.nodes.get('middle-col-w').value), 310, 'B2B must not receive the legacy B2C +40px');
  assert.equal(h.nodes.get('middle-col-w-label').textContent, 'Action Rail');
  assert.equal(h.nodes.get('right-col-width-control').hidden, true);
  assert.equal(Number(h.nodes.get('middle-col-w').min), 230);
  assert.equal(Number(h.nodes.get('middle-col-w').max), 390);
  h.context.onLayoutChange('rightColWidth', 900);
  assert.deepEqual(plain(h.run('state.layout')), { leftColWidth: 300, middleColWidth: 310 });
  assert.equal(h.context.layoutRefreshCalls, 0);
  h.context.onLayoutChange('middleColWidth', 380);
  assert.deepEqual(plain(h.run('state.layout')), { leftColWidth: 300, middleColWidth: 380 });
  assert.equal(h.nodes.get('middle-col-w-val').textContent, '380px');
  assert.equal(h.nodes.get('left-col-w-val').textContent, '300px');
  h.context.resetLayoutWidths();
  assert.deepEqual(plain(h.run('state.layout')), { leftColWidth: 290, middleColWidth: 320 });
});

test('uniform fit fills wide displays, letterboxes other ratios, and never stretches', () => {
  const h = harness();
  for (const [width, height, scale] of [[1600, 900, 1], [1920, 1080, 1.2], [800, 450, 0.5], [1000, 1000, 0.625], [800, 300, 1 / 3]]) {
    const fit = h.context.getCanvasFit(width, height);
    near(fit.scale, scale); near(fit.width, 1600 * scale); near(fit.height, 900 * scale);
    near(fit.width / fit.height, 16 / 9);
    assert.ok(fit.width <= width + 1e-8 && fit.height <= height + 1e-8);
  }
});

test('invalid or tiny canvas dimensions cannot produce zero, negative or NaN transforms', () => {
  const h = harness();
  for (const [width, height] of [[0, 0], [-10, 20], [Infinity, NaN], [undefined, undefined], ['bad', 900], [1, 1]]) {
    const fit = h.context.getCanvasFit(width, height);
    assert.ok(Object.values(fit).every(value => Number.isFinite(value) && value > 0));
    near(fit.width / fit.height, 16 / 9);
    const expectedWidth = Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : 1;
    const expectedHeight = Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : 1;
    assert.ok(fit.width <= expectedWidth + 1e-8 && fit.height <= expectedHeight + 1e-8);
  }
});

test('live preview uses the same 1600x900 iframe with a uniform scale', () => {
  const h = harness(); h.element('preview-stage', 800, 450);
  const iframe = h.element('preview-iframe'); h.context.fitPreviewScale();
  assert.equal(iframe.style.width, '1600px'); assert.equal(iframe.style.height, '900px');
  assert.equal(iframe.style.transform, 'scale(0.5)');
  h.nodes.get('preview-stage').clientWidth = 1920; h.nodes.get('preview-stage').clientHeight = 1080;
  h.context.fitPreviewScale(); assert.equal(iframe.style.transform, 'scale(1.2)');
});

test('presentation fitting has no hidden 32px reserve and scales above native size', () => {
  const h = harness(), canvas = h.element('presentation-canvas', 1920, 1080);
  const stage = h.element('presentation-stage'), iframe = h.element('presentation-iframe');
  h.context.fitPresentationScale();
  near(parseFloat(stage.style.width), 1920); near(parseFloat(stage.style.height), 1080);
  assert.equal(iframe.style.transform, 'scale(1.2)');
  canvas.clientWidth = 800; canvas.clientHeight = 300; h.context.fitPresentationScale();
  near(parseFloat(stage.style.width), 1600 / 3); near(parseFloat(stage.style.height), 300);
  assert.equal(iframe.style.transform, `scale(${1 / 3})`);
  assert.ok(h.windowEvents.has('resize') && h.documentEvents.has('fullscreenchange'));
});

test('fullscreen targets only the slide canvas, and rejection is reported inline', async () => {
  const h = harness();
  h.run("getPresentationDocument=()=>'<html>Current selected view</html>';activateDialogFocus=()=>{};releaseDialogFocus=()=>{}");
  h.context.openPresentation();
  const overlay = h.nodes.get('presentation-overlay'), canvas = h.nodes.get('presentation-canvas');
  assert.ok(overlay && canvas && h.nodes.get('presentation-status'));
  overlay.requestFullscreen = async () => assert.fail('Presentation chrome must not be fullscreened');
  let calls = 0;
  canvas.requestFullscreen = async () => { calls++; throw new Error('Fullscreen denied by browser'); };
  await h.nodes.get('presentation-fullscreen').click();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.match(h.nodes.get('presentation-status').textContent, /full.?screen|denied|unable|could not/i);
  canvas.requestFullscreen = undefined;
  h.nodes.get('presentation-status').textContent = '';
  await h.nodes.get('presentation-fullscreen').click();
  assert.match(h.nodes.get('presentation-status').textContent, /full.?screen|unavailable|blocked/i);
  assert.match(overlay.innerHTML, /id="presentation-status"[^>]*(?:role="status"|aria-live="polite")/);
  assert.ok(!/overlay\.requestFullscreen/.test(appSource), 'fullscreen must exclude the presentation toolbar');
});

test('a stale fullscreen rejection after close and reopen leaves the current presentation unchanged', async () => {
  const h = harness();
  h.run("getPresentationDocument=()=>'<html>Selected view</html>';activateDialogFocus=()=>{};releaseDialogFocus=()=>{}");
  h.context.openPresentation();
  const oldOverlay = h.nodes.get('presentation-overlay');
  const oldStatus = oldOverlay.querySelector('#presentation-status');
  oldStatus.textContent = 'Previous presentation ready';
  let rejectFullscreen;
  h.nodes.get('presentation-canvas').requestFullscreen = () => new Promise((resolve, reject) => { rejectFullscreen = reject; });
  const pending = oldOverlay.querySelector('#presentation-fullscreen').click();
  assert.equal(typeof rejectFullscreen, 'function', 'the first fullscreen request must still be pending');

  await oldOverlay.querySelector('#presentation-close').click();
  h.context.openPresentation();
  const currentOverlay = h.nodes.get('presentation-overlay');
  const currentStatus = currentOverlay.querySelector('#presentation-status');
  const currentClose = currentOverlay.querySelector('#presentation-close');
  currentStatus.textContent = 'Current presentation ready';
  currentClose.focus();

  rejectFullscreen(new Error('Previous fullscreen request denied late'));
  await pending;
  assert.notEqual(currentOverlay, oldOverlay);
  assert.equal(h.nodes.get('presentation-overlay'), currentOverlay);
  assert.equal(currentStatus.textContent, 'Current presentation ready');
  assert.equal(h.document.activeElement, currentClose, 'a stale fullscreen result must not steal focus');
  assert.equal(oldStatus.textContent, 'Previous presentation ready', 'closed presentations must ignore pending fullscreen results');
});

test('successful fullscreen enlarges the canvas and closing releases fullscreen and resize observation', async () => {
  const h = harness(), observers = [];
  h.context.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  h.run("getPresentationDocument=()=>'<html>Selected view</html>';activateDialogFocus=()=>{};releaseDialogFocus=()=>{}");
  h.context.openPresentation();
  const canvas = h.nodes.get('presentation-canvas');
  assert.equal(observers[0].target, canvas);
  canvas.requestFullscreen = async () => {
    h.document.fullscreenElement = canvas; canvas.clientWidth = 1920; canvas.clientHeight = 1080;
  };
  await h.nodes.get('presentation-fullscreen').click();
  near(parseFloat(h.nodes.get('presentation-stage').style.width), 1920);
  near(parseFloat(h.nodes.get('presentation-stage').style.height), 1080);
  let exits = 0;
  h.document.exitFullscreen = async () => { exits++; h.document.fullscreenElement = null; };
  await h.nodes.get('presentation-close').click();
  assert.equal(exits, 1); assert.equal(observers[0].disconnected, true);
  assert.equal(h.nodes.has('presentation-overlay'), false);
  assert.equal(h.run('presentationContext'), null);
});

test('static preview and third-column controls use widescreen contracts', () => {
  assert.ok(/aspect-ratio:\s*(?:16\s*\/\s*9|1600\s*\/\s*900)/.test(indexSource), 'preview stage must have a 16:9 aspect ratio');
  for (const attribute of ['id="right-col-w"', 'for="right-col-w"', 'id="right-col-w-val"']) assert.ok(indexSource.includes(attribute), `missing ${attribute}`);
  assert.ok(!/aspect-ratio:\s*1300\s*\/\s*860/.test(indexSource), 'legacy preview aspect ratio must be removed');
});
