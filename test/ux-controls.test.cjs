const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Source structure tests, not a browser accessibility audit.
const tags = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
from html.parser import HTMLParser
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.tags=[]; self.label=False
    def handle_starttag(self, tag, attrs):
        if tag == 'label': self.label=True
        self.tags.append({'tag':tag,'attrs':dict(attrs),'wrappedLabel':self.label})
    def handle_endtag(self, tag):
        if tag == 'label': self.label=False
p=Parser();p.feed(sys.stdin.read());print(json.dumps(p.tags))
`], { input: html, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }));
const byId = id => tags.find(({ attrs }) => attrs.id === id)?.attrs;

test('all static editor fields have an explicit or wrapping label', () => {
  const labels = new Set(tags.filter(t => t.tag === 'label').map(t => t.attrs.for));
  const fields = tags.filter(t => ['input', 'select', 'textarea'].includes(t.tag) && t.attrs.type !== 'hidden');
  assert.ok(fields.length >= 100);
  const missing = fields.filter(t => !t.wrappedLabel && !labels.has(t.attrs.id) && !t.attrs['aria-label'] && !t.attrs['aria-labelledby']);
  assert.deepEqual(missing.map(t => t.attrs.id), []);
});

test('wizard, selected-view and dialog contracts are named and focusable', () => {
  const steps = tags.filter(t => t.tag === 'button' && t.attrs['data-step'] !== undefined);
  assert.equal(steps.length, 7);
  assert.equal(steps.filter(t => t.attrs['aria-current'] === 'step').length, 1);
  assert.ok(steps.every(t => t.attrs['aria-label']));
  for (let i = 1; i <= 7; i++) assert.equal(byId(`step-${i}-title`).tabindex, '-1');
  for (const id of ['save-project-modal', 'settings-modal']) {
    assert.equal(byId(id).role, 'dialog');
    assert.equal(byId(id)['aria-modal'], 'true');
    assert.ok(byId(byId(id)['aria-labelledby']));
    assert.equal(byId(id).tabindex, '-1');
  }
  for (const id of ['selected-view-status', 'draft-status', 'layout-fit-status', 'quickstart-status', 'module-composer-status', 'copy-success', 'save-project-success']) assert.equal(byId(id)['aria-live'], 'polite');
  for (const id of ['selected-view-name', 'rail-fields-container', 'profile-set-progress', 'demo-data-note']) assert.ok(byId(id));
  assert.ok(byId('preview-iframe').title);
  assert.equal(byId('quickstart-error').role, 'alert');
  assert.ok(html.indexOf("'js/editor-support.js'") < html.indexOf("'js/app.js'"));
});

test('static upload zones are named keyboard controls without duplicate inline key handlers', () => {
  const zones = tags.filter(t => t.attrs['data-upload-label']);
  assert.equal(zones.length, 7);
  for (const { attrs } of zones) {
    assert.equal(attrs.role, 'button');
    assert.equal(attrs.tabindex, '0');
    assert.equal(attrs['aria-label'], attrs['data-upload-label']);
    assert.ok(!attrs.onkeydown);
  }
});

function dialogHarness() {
  const nodes = new Map(), keydown = new Set();
  let active;
  class Element {
    constructor(id, parent = null) {
      this.id = id; this.parent = parent; this.children = []; this.attrs = {};
      this.inert = false; this.hidden = false; this.disabled = false; this.isConnected = true;
      nodes.set(id, this); parent?.children.push(this);
    }
    contains(el) { return this === el || this.children.some(child => child.contains(el)); }
    setAttribute(name, value) { this.attrs[name] = value; }
    querySelectorAll() { return this.children; }
    querySelector() { return this.children[0]; }
    closest() { return this.hidden ? this : this.parent?.closest() || null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    focus() {
      for (let el = this; el; el = el.parent) if (el.inert || el.hidden) return;
      if (!this.disabled && this.isConnected) active = this;
    }
  }
  const body = new Element('body'), editor = new Element('editor', body);
  const opener = new Element('settings-opener', editor);
  const settings = new Element('settings-modal', body), settingsFirst = new Element('settings-close', settings), guideOpener = new Element('guide-opener', settings);
  const guide = new Element('api-mcp-guide-modal', body), guideFirst = new Element('guide-close', guide), guideLast = new Element('guide-link', guide);
  const originallyInert = new Element('unrelated-inert-content', body); originallyInert.inert = true;
  active = opener;
  const document = { body, get activeElement() { return active; }, getElementById: id => nodes.get(id),
    addEventListener(name, fn) { if (name === 'keydown') keydown.add(fn); },
    removeEventListener(name, fn) { if (name === 'keydown') keydown.delete(fn); } };
  const context = vm.createContext({ document });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/editor-support.js'), 'utf8'), context);
  const closeSettings = () => context.releaseDialogFocus('settings-modal');
  const closeGuide = () => context.releaseDialogFocus('api-mcp-guide-modal');
  const press = (key, shiftKey = false) => {
    const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
    [...keydown].forEach(listener => listener(event)); return event;
  };
  return { context, nodes, Element, keydown, editor, opener, settings, settingsFirst, guideOpener, guide, guideFirst, guideLast, originallyInert, closeSettings, closeGuide, press,
    active: () => active,
    openSettings: () => context.activateDialogFocus('settings-modal', closeSettings, 'settings-close'),
    openGuide: () => context.activateDialogFocus('api-mcp-guide-modal', closeGuide, 'guide-close') };
}

test('nested sibling dialogs clear inherited inertness and restore parent focus in order', () => {
  const h = dialogHarness(); h.openSettings();
  assert.equal(h.active(), h.settingsFirst);
  assert.equal(h.editor.inert, true); assert.equal(h.guide.inert, true);
  h.guideOpener.focus(); h.openGuide();
  assert.equal(h.guide.inert, false);
  assert.equal(h.settings.inert, true);
  assert.equal(h.active(), h.guideFirst);
  h.closeGuide();
  assert.equal(h.guide.inert, true);
  assert.equal(h.settings.inert, false);
  assert.equal(h.editor.inert, true);
  assert.equal(h.active(), h.guideOpener);
  h.closeSettings();
  assert.equal(h.active(), h.opener);
  assert.equal(h.editor.inert, false); assert.equal(h.guide.inert, false);
  assert.equal(h.originallyInert.inert, true);
  assert.equal(h.keydown.size, 0);
});

test('only the top dialog handles Tab/Escape and duplicate opens do not leak handlers', () => {
  const h = dialogHarness(); h.openSettings(); h.guideOpener.focus(); h.openGuide(); h.openGuide();
  assert.equal(h.keydown.size, 2);
  const hidden = new h.Element('hidden-guide-control', h.guide); hidden.hidden = true;
  const disabled = new h.Element('disabled-guide-control', h.guide); disabled.disabled = true;
  h.guideLast.focus(); assert.equal(h.press('Tab').prevented, true); assert.equal(h.active(), h.guideFirst);
  assert.equal(h.press('Tab', true).prevented, true); assert.equal(h.active(), h.guideLast);
  assert.equal(h.press('Escape').prevented, true);
  assert.equal(h.keydown.size, 1); assert.equal(h.active(), h.guideOpener);
  assert.equal(h.settings.inert, false); assert.equal(h.editor.inert, true);
  h.press('Escape'); assert.equal(h.keydown.size, 0); assert.equal(h.active(), h.opener);
  h.openSettings(); h.closeSettings(); assert.equal(h.keydown.size, 0);
  h.closeSettings(); assert.equal(h.originallyInert.inert, true);
});

function uploadHarness() {
  const nodes = new Map(), readers = [];
  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.attrs = {}; this.dataset = {}; this.style = {};
      this.value = ''; this.children = []; this.events = {}; this.textContent = ''; this.clicks = 0;
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
      if (id) nodes.set(id, this);
    }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    removeAttribute(name) { delete this.attrs[name]; }
    set src(value) { this.attrs.src = value; }
    get src() { return this.attrs.src || ''; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    fire(name, data = {}) { const event = { target: this, preventDefault() { this.prevented = true; }, ...data }; for (const fn of this.events[name] || []) fn(event); return event; }
    click() { this.clicks++; this.fire('click'); }
    insertAdjacentElement(_position, el) { el.parentElement = this.parentElement; this.parentElement.children.push(el); if (el.id) nodes.set(el.id, el); }
    querySelectorAll() { return this.children.filter(el => ['INPUT', 'TEXTAREA'].includes(el.tagName) && el.type !== 'file'); }
    closest() { return this.parentElement?.dataset.uploadAttached ? this.parentElement : null; }
  }
  const parent = new Element(), zone = new Element('div', 'drop-test'), preview = new Element('img', 'preview-test'), field = new Element('input', 'url-test');
  zone.dataset.uploadLabel = 'Upload test image';
  zone.parentElement = parent; field.parentElement = parent; preview.parentElement = zone;
  parent.children.push(zone, field); zone.children.push(preview); preview.classList.add('hidden');
  class Reader {
    constructor() { readers.push(this); }
    readAsDataURL(file) { this.file = file; }
    complete(data = 'data:image/png;base64,YQ==') { this.onload({ target: { result: data } }); }
  }
  const context = vm.createContext({ URL, console, FileReader: Reader, state: { profileType: 'b2c', profileStrategy: { lens: 'sales' } }, document: { getElementById: id => nodes.get(id), createElement: tag => new Element(tag) } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/generator.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/images.js'), 'utf8'), context);
  const values = [];
  context.attachDropZone('drop-test', 'preview-test', value => values.push(value));
  const input = parent.children.find(el => el.type === 'file');
  const select = (file = { type: 'image/png', size: 10 }) => { input.files = [file]; input.value = 'chosen.png'; input.fire('change'); };
  return { context, nodes, parent, zone, preview, field, input, values, readers, select, Element, feedback: nodes.get('drop-test-status') };
}

test('upload control activates with Enter/Space, accepts click/drop, and announces success', () => {
  const h = uploadHarness();
  assert.equal(h.zone.getAttribute('role'), 'button');
  assert.equal(h.zone.tabIndex, 0);
  for (const key of ['Enter', ' ']) assert.ok(h.zone.fire('keydown', { key }).prevented);
  assert.equal(h.input.clicks, 2);
  h.zone.click(); assert.equal(h.input.clicks, 3);
  h.zone.fire('drop', { dataTransfer: { files: [{ type: 'image/png', size: 10 }] } });
  h.readers[0].complete();
  assert.equal(h.values.length, 1);
  assert.equal(h.preview.src, h.values[0]);
  assert.equal(h.preview.classList.contains('hidden'), false);
  assert.equal(h.feedback.textContent, 'Image updated.');
  assert.equal(h.feedback.getAttribute('role'), 'status');
  h.context.attachDropZone('drop-test', 'preview-test', () => assert.fail('duplicate handler'));
  h.zone.click(); assert.equal(h.input.clicks, 4);
});

test('upload validation and read failures are inline, retryable, and do not mutate images', () => {
  const h = uploadHarness();
  for (const type of ['image/svg+xml', 'text/plain', '']) {
    h.select({ type, size: 10 });
    assert.match(h.feedback.textContent, /PNG/);
    assert.equal(h.zone.getAttribute('aria-invalid'), 'true');
  }
  h.select({ type: 'image/png', size: 4 * 1024 * 1024 });
  assert.match(h.feedback.textContent, /3 MB/);
  assert.equal(h.readers.length, 0);
  h.select(); assert.equal(h.input.value, '');
  h.readers[0].onerror(); assert.match(h.feedback.textContent, /could not be read/);
  h.select(); h.readers[1].onabort(); assert.match(h.feedback.textContent, /could not be read/);
  h.select(); h.readers[2].complete('data:image/svg+xml;base64,YQ=='); assert.match(h.feedback.textContent, /safely/);
  assert.equal(h.values.length, 0); assert.equal(h.preview.src, '');
  h.select(); h.readers[3].complete(); assert.equal(h.values.length, 1);
  assert.equal(h.zone.getAttribute('aria-invalid'), null);
});

test('older upload selection cannot replace a newer image', () => {
  const h = uploadHarness(); h.select(); h.select();
  h.readers[1].complete('data:image/png;base64,Yg==');
  h.readers[0].complete('data:image/png;base64,YQ==');
  assert.deepEqual(h.values, ['data:image/png;base64,Yg==']);
});

test('upload completions cannot cross project, persona, mode or replaced target boundaries', () => {
  const mutations = [
    h => { h.context.state = { ...h.context.state }; },
    h => { h.context.state.profileStrategy.lens = 'service'; },
    h => { h.context.state.profileType = 'b2b'; },
    h => { h.nodes.set('drop-test', new h.Element('div')); },
    h => { h.zone.dataset.itemId = 'another-item'; },
    h => { h.field.value = 'https://example.com/new.png'; },
    h => { h.preview.src = 'https://example.com/new.png'; }
  ];
  for (const mutate of mutations) {
    const h = uploadHarness(); h.select(); mutate(h); h.readers[0].complete();
    assert.equal(h.values.length, 0);
    assert.notEqual(h.preview.src, 'data:image/png;base64,YQ==');
  }
});

test('pasted preview URLs share renderer safety rules and clear rejected sources', () => {
  const h = uploadHarness();
  h.context.setImagePreviewFromURL('preview-test', 'https://example.com/photo.png');
  assert.equal(h.preview.src, 'https://example.com/photo.png');
  for (const url of ['javascript:bad()', 'data:image/svg+xml;base64,YQ==', 'file:///tmp/photo.png']) {
    h.context.setImagePreviewFromURL('preview-test', url);
    assert.equal(h.preview.getAttribute('src'), null);
    assert.equal(h.preview.classList.contains('hidden'), true);
    assert.match(h.feedback.textContent, /HTTP/);
  }
  h.context.setImagePreviewFromURL('preview-test', '');
  assert.equal(h.feedback.textContent, '');
});
