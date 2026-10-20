const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'preview-v2/js', file + '.js'), 'utf8');
function harness() {
  const nodes = new Map(), messages = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, hidden: false, disabled: false,
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      setAttribute() {}, focus() {}, querySelectorAll() { return []; }, contains() { return false; } });
    return nodes.get(id);
  };
  const box = { console, URL, URLSearchParams, Date, Math, JSON, Map, Blob, TextEncoder, AbortController,
    setTimeout() { return 1; }, clearTimeout() {}, confirm: () => true, alert: msg => messages.push(msg),
    document: { readyState: 'loading', addEventListener() {}, getElementById: node, querySelectorAll() { return []; }, querySelector() { return null; } },
    window: { addEventListener() {}, location: { href: 'https://upg.example/preview-v2/' } },
    localStorage: { getItem() { return null; } }, fetch: async () => { throw Error('Network disabled'); } };
  vm.createContext(box);
  for (const file of ['defaults', 'profile-contract', 'generator', 'brand-logo', 'pagehost', 'editor-support', 'app']) vm.runInContext(read(file), box, { filename: file + '.js' });
  const run = source => vm.runInContext(source, box);
  run(`readStaticFields=()=>{}; fillStaticFields=()=>{}; renderAll=()=>{}; refreshPreview=()=>{};
    updateProfileStrategyUI=()=>{}; syncProfileSetConfigUI=()=>{}; goToStep=()=>{}; syncAuthUI=()=>{};
    activateDialogFocus=()=>{}; recoverEmbeddedBrandLogo=()=>{}; buildIntegrationArtifact=async()=>({version:1});
    state=cloneTonyRobbinsStarter(); state._aiContext={sourceUrl:'https://customer.example/'};
    snapshotPersonaView();`);
  node('quickstart-url').value = 'https://customer.example/';
  const auth = { getEmail: () => 'owner@salesforce.com', isSignedIn: () => true, signIn: async () => {} };
  box.SaasyAuth = box.window.SaasyAuth = auth;
  return { box, node, run, messages, auth, get: () => run('state') };
}
test('preview save boundary always forces a new prefixed copy, even for stale update callers', async () => {
  const h = harness(), calls = [];
  h.auth.saveProject = async options => { calls.push(options); return { id: 'copy-1' }; };
  h.box.options = { id: 'original-1', saveAsCopy: false, expectedRevision: 9, name: 'Preview · Preview · Acme', idempotencyKey: 'attempt-1' };
  await h.run('saveProjectWithSessionRecovery(options)');
  assert.equal(calls[0].id, null); assert.equal(calls[0].saveAsCopy, true);
  assert.equal(calls[0].expectedRevision, undefined); assert.equal(calls[0].name, 'Preview · Acme');
  assert.equal(calls[0].idempotencyKey, 'attempt-1'); assert.equal(h.box.options.id, 'original-1');
});
test('double-click save is coalesced and a lost-response retry reuses the same idempotency key', async () => {
  const h = harness(), calls = [];
  let release;
  h.auth.saveProject = options => { calls.push(options); return new Promise(resolve => { release = resolve; }); };
  h.node('save-project-name-input').value = 'Acme';
  h.run("currentProjectId='original-1';currentProjectRevision=9;currentProjectOwner='owner@salesforce.com'");
  const save = h.run('confirmSaveProject(false)');
  await Promise.resolve(); await Promise.resolve();
  await h.run('confirmSaveProject(false)');
  assert.equal(calls.length, 1);
  release({ id: 'copy-1', name: calls[0].name, revision: 1 }); await save;
  assert.equal(h.run('currentProjectId'), null); assert.equal(h.run('currentProjectRevision'), null);
  let first = true;
  h.auth.saveProject = async options => { calls.push(options); if (first) { first = false; throw Error('Network disconnected'); } return { id: 'copy-2', name: options.name }; };
  await h.run('confirmSaveProject(false)'); await h.run('confirmSaveProject(true)');
  assert.equal(calls[1].idempotencyKey, calls[2].idempotencyKey);
  assert.ok(calls.every(options => options.id === null && options.saveAsCopy));
});
test('session refresh retries the exact copy request and rejects changed identity', async () => {
  const h = harness(), calls = [];
  h.auth.saveProject = async options => { calls.push(options); if (calls.length === 1) throw Error('invalid_token'); return { id: 'copy' }; };
  await h.run("saveProjectWithSessionRecovery({name:'Acme',id:'original',idempotencyKey:'stable'})");
  assert.equal(calls.length, 2); assert.equal(calls[0], calls[1]); assert.equal(calls[1].id, null);
  calls.length = 0;
  h.auth.signIn = async () => { h.auth.getEmail = () => 'other@salesforce.com'; };
  await assert.rejects(h.run("saveProjectWithSessionRecovery({name:'Acme'},'owner@salesforce.com')"), /account_changed/);
  assert.equal(calls.length, 1);
});
test('account changes during export preparation cannot send a copy into the wrong account', async () => {
  const h = harness();
  let sent = false;
  h.auth.saveProject = async () => { sent = true; };
  h.box.switchAccount = async () => { h.auth.getEmail = () => 'other@salesforce.com'; return {}; };
  h.run("buildIntegrationArtifact=switchAccount;currentProjectOwner='owner@salesforce.com'");
  h.node('save-project-name-input').value = 'Acme';
  await h.run('confirmSaveProject(false)');
  assert.equal(sent, false); assert.match(h.messages.at(-1), /signed-in account changed/);
});
test('project loading opens a detached copy and never exposes deletion', async () => {
  const h = harness();
  const payload = JSON.parse(JSON.stringify(h.get()));
  // Use the implementation's actual tool namespace.
  h.auth.loadProject = async () => ({ id: 'original-1', name: 'Original', revision: 8, tool: h.run('SAASY_TOOL'), payload });
  await h.run("loadProjectAndHydrate('original-1')");
  assert.equal(h.run('currentProjectId'), null); assert.equal(h.run('currentProjectRevision'), null);
  assert.equal(h.run('currentProjectName'), 'Original');
  let deleted = false; h.auth.deleteProject = async () => { deleted = true; };
  await h.run("deleteProjectFromList('original-1',{})");
  assert.equal(deleted, false); assert.match(h.messages.at(-1), /disabled in Preview/);
  assert.doesNotMatch(read('app'), /SaasyAuth\.deleteProject\(/);
  assert.doesNotMatch(read('app'), /data-action="delete"/);
});
test('recovery strips stale project identity and never persists it to the preview draft', async () => {
  const h = harness(), stored = [];
  h.box.record = { version: 1, owner: 'owner@salesforce.com', profile: JSON.parse(JSON.stringify(h.get())), project: { id: 'original-1', revision: 7, name: 'Acme' } };
  h.run('draftPending=record;restoreDraftRecovery()');
  assert.equal(h.run('currentProjectId'), null); assert.equal(h.run('currentProjectRevision'), null);
  h.box.store = async (action, value) => stored.push(value);
  h.run("draftReady=true;draftStorage=store;currentProjectId='stale';currentProjectRevision=9");
  await h.run('persistDraftRecovery()');
  assert.equal(stored[0].project.id, null); assert.equal(stored[0].project.revision, null);
});
test('preview storage is namespaced without migrating operational preferences or drafts', () => {
  const local = read('localai'), recovery = read('editor-support');
  for (const key of ['anthropic_api_key', 'anthropic_model', 'scraper_endpoint_url']) {
    assert.ok(local.includes(`'upg_preview_v2_${key}'`)); assert.ok(!local.includes(`= '${key}'`));
  }
  assert.ok(recovery.includes("indexedDB.open('upg-preview-v2-recovery-v1'"));
  assert.ok(recovery.includes("sessionStorage.getItem('upg-preview-v2-draft-tab')"));
  assert.ok(!recovery.includes("'upg-recovery-v1'")); assert.ok(!recovery.includes("'upg-draft-tab'"));
});
