const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'preview-v2/js', file + '.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const nodes = new Map(), timers = new Map(), frames = new Map(), selected = ['sales', 'service'];
  let token = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, hidden: false, disabled: false,
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      setAttribute() {}, removeAttribute() {}, focus() {}, querySelectorAll() { return []; }, contains() { return false; } });
    return nodes.get(id);
  };
  const box = { console, URL, URLSearchParams, Date, Math, JSON, Map, Blob, TextEncoder, AbortController,
    setTimeout: (fn, ms) => { const id = ++token; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++token; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    confirm: () => true, alert() {}, navigator: {},
    document: { readyState: 'loading', addEventListener() {}, getElementById: node,
      querySelectorAll: query => query.includes('profile-set-choices') ? selected.map(value => ({ value })) : [], querySelector() { return null; }, execCommand() { return false; } },
    window: { addEventListener() {}, scrollTo() {}, location: { href: 'https://upg.example/preview-v2/' } },
    localStorage: { getItem() { return null; } }, fetch: async () => { throw Error('Network disabled'); } };
  vm.createContext(box);
  for (const file of ['defaults', 'profile-contract', 'generator', 'brand-logo', 'pagehost', 'editor-support', 'app']) vm.runInContext(read(file), box, { filename: file + '.js' });
  const run = source => vm.runInContext(source, box);
  run(`readStaticFields=()=>{}; fillStaticFields=()=>{}; renderAll=()=>{}; refreshPreview=()=>{};
    updateProfileStrategyUI=()=>{}; syncProfileSetConfigUI=()=>{}; syncAuthUI=()=>{};activateDialogFocus=()=>{};
    recoverEmbeddedBrandLogo=()=>{};embedSharedBrandLogo=async()=>{};
    state=cloneTonyRobbinsStarter();state._aiContext={sourceUrl:'https://customer.example/'};
    applyPersonaPreset();snapshotPersonaView();`);
  node('quickstart-url').value = 'https://customer.example/';
  const fixture = () => {
    const ai = JSON.parse(JSON.stringify(run('cloneTonyRobbinsStarter()')));
    ai._sourceContext = { url: 'https://customer.example/', scraped: {} };
    ai._meta = { source_url: 'https://customer.example/' };
    ai.recommendations.items.forEach(item => { item.image = ''; });
    return ai;
  };
  return { box, node, run, selected, timers, frames, fixture, get: () => run('state'),
    flushFrames() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } } };
}
test('width sliders produce one frame update with a fixed canvas budget, then commit once', () => {
  const h = harness(), messages = [];
  h.node('preview-iframe').contentWindow = { postMessage: data => messages.push(data) };
  h.run("previewContext={owner:state,lens:'sales',revision:'r1'};onLayoutChange('leftColWidth',450);onLayoutChange('middleColWidth',500)");
  assert.equal(h.frames.size, 1); assert.equal(messages.length, 0);
  h.flushFrames();
  assert.equal(messages.length, 1);
  const widths = messages[0].widths;
  assert.equal(widths.leftColWidth + widths.middleColWidth + widths.rightColWidth, 1548);
  assert.equal(messages[0].revision, 'r1');
  h.run('commitLayoutPreview()');
  assert.equal(h.run('layoutPreviewDirty'), false);
  assert.match(h.node('preview-iframe').srcdoc, /data-upg-preview-layout/);
  assert.doesNotMatch(h.run('lastRenderedPreviewHTML'), /data-upg-preview-layout/);
  assert.match(h.run('lastRenderedPreviewHTML'), /width:1600px/);
});
test('B2B slider feedback respects rail limits and leaves the center flexible', () => {
  const h = harness(), messages = [];
  h.node('preview-iframe').contentWindow = { postMessage: data => messages.push(data) };
  h.run("state.profileType='b2b';previewContext={owner:state,lens:'sales',revision:'b2b'};onLayoutChange('leftColWidth',900);onLayoutChange('middleColWidth',10)");
  h.flushFrames();
  assert.equal(messages[0].widths.leftColWidth, 390);
  assert.equal(messages[0].widths.middleColWidth, 230);
  h.run("onLayoutChange('rightColWidth',800)");
  assert.equal(h.frames.size, 0);
});
test('layout bridge rejects other senders, stale revisions, malformed widths and oversubscribed grids', () => {
  const h = harness(), shell = { style: {} }, rails = [{ style: {} }, { style: {} }];
  const code = h.run("withPreviewLayoutBridge('<body></body>','rev','b2c')").match(/<script data-upg-preview-layout>([\s\S]*?)<\/script>/)[1];
  const parent = {}, other = {};
  let receive;
  const context = { window: { parent, addEventListener: (_, fn) => { receive = fn; } }, document: { querySelector: () => shell, querySelectorAll: () => rails } };
  vm.runInNewContext(code, context);
  const data = { type: 'upg:preview-layout', revision: 'rev', profileType: 'b2c', widths: { leftColWidth: 320, middleColWidth: 400, rightColWidth: 828 } };
  receive({ source: other, data });
  receive({ source: parent, data: { ...data, revision: 'old' } });
  receive({ source: parent, data: { ...data, widths: { ...data.widths, leftColWidth: '320px;display:none' } } });
  receive({ source: parent, data: { ...data, widths: { ...data.widths, rightColWidth: 900 } } });
  assert.deepEqual(shell.style, {});
  receive({ source: parent, data }); assert.equal(shell.style.gridTemplateColumns, '320px 400px 828px');
  const b2b = h.run("withPreviewLayoutBridge('<body></body>','rev','b2b')").match(/<script data-upg-preview-layout>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(b2b, context);
  receive({ source: parent, data: { ...data, profileType: 'b2b', widths: { leftColWidth: 300, middleColWidth: 250 } } });
  assert.equal(shell.style.gridTemplateColumns, '300px minmax(0,1fr)');
  assert.ok(rails.every(rail => rail.style.gridTemplateColumns === 'minmax(0,1fr) 250px'));
});
test('exports and presentation flush the latest layout without editor bridge script', () => {
  const h = harness();
  h.run("onLayoutChange('rightColWidth',900)");
  const output = h.run('getPresentationDocument()');
  assert.equal(h.frames.size, 0);
  assert.doesNotMatch(output, /data-upg-preview-layout/);
  assert.equal(h.run('layoutPreviewDirty'), false);
  assert.match(output, /900px;/);
});
test('drag insertion respects exact positions across columns and within the library', () => {
  const h = harness();
  h.run(`state.extraCards=[
    {moduleId:'a',title:'A',placement:'middle',visibility:'visible',items:[]},
    {moduleId:'b',title:'B',placement:'middle',visibility:'visible',items:[]}];
    state.rightExtraCards=[{moduleId:'c',title:'C',placement:'right',visibility:'visible',items:[]}];
    moveCustomModule('c','middle','b');`);
  assert.deepEqual(Array.from(h.get().extraCards, item => item.moduleId), ['a', 'c', 'b']);
  h.run("moveCustomModule('b','middle','a')");
  assert.deepEqual(Array.from(h.get().extraCards, item => item.moduleId), ['b', 'a', 'c']);
  h.run("moveCustomModule('c','right');moveCustomModule('c','suggested');moveCustomModule('a','suggested','c')");
  assert.deepEqual(Array.from(h.run("getCustomModules().filter(item=>item.visibility!=='visible')"), item => item.moduleId), ['a', 'c']);
  h.run("moveCustomModule('b','suggested')");
  assert.deepEqual(Array.from(h.run("getCustomModules().filter(item=>item.visibility!=='visible')"), item => item.moduleId), ['a', 'c', 'b']);
  assert.match(read('app'), /class="composer-drag-handle" draggable="true"/);
  assert.match(read('app'), /data-module-action="up"/);
  assert.match(read('app'), /data-module-action="move"/);
});
test('dragover draws an insertion marker at pointer position, not just a destination highlight', () => {
  const h = harness(), cards = [
    { dataset: { moduleId: 'a' }, getBoundingClientRect: () => ({ top: 100, height: 40 }) },
    { dataset: { moduleId: 'b' }, getBoundingClientRect: () => ({ top: 160, height: 40 }) }
  ];
  let insertion, marker;
  const zone = { dataset: {}, classList: { add() {} }, querySelectorAll: () => cards, querySelector: () => marker,
    insertBefore: (element, before) => { marker = element; insertion = before; } };
  h.box.document.createElement = () => ({ setAttribute() {} });
  h.box.event = { currentTarget: zone, dataTransfer: {}, clientY: 150, preventDefault() {} };
  h.run("draggedModuleId='drag';allowModuleDrop(event)");
  assert.equal(insertion, cards[1]); assert.equal(zone.dataset.dropBefore, 'b'); assert.equal(marker.className, 'composer-drop-marker');
  h.box.event.clientY = 250; h.run('allowModuleDrop(event)');
  assert.equal(insertion, null); assert.equal(zone.dataset.dropBefore, '');
});
test('unchanged control markup stays intact and changed progress returns focus to the same view', () => {
  const h = harness();
  let writes = 0, focused = '';
  const buttons = [{ dataset: { focusKey: 'service' }, focus: () => { focused = 'service'; } }];
  const container = { contains: () => true, querySelectorAll: () => buttons, set innerHTML(value) { writes++; } };
  h.box.container = container; h.box.document.activeElement = { dataset: { focusKey: 'service:images' } };
  h.run("updateStableControlMarkup(container,'ready');updateStableControlMarkup(container,'ready')");
  assert.equal(writes, 1); assert.equal(focused, 'service');
  buttons.push({ dataset: { focusKey: 'service:images' }, focus: () => { focused = 'retry'; } });
  h.run("updateStableControlMarkup(container,'retry')");
  assert.equal(writes, 2); assert.equal(focused, 'retry');
});
test('visiting a queued view does not confuse browser field normalization with a real edit', () => {
  const h = harness();
  h.run("state.affinities.seriesA.color='#ABCDEF';state.affinities.seriesB.color='#FEDCBA';delete state.preferences.icon;delete state.events.icon;delete state.membership.icon");
  const before = h.run("personaFingerprint(state,'sales')");
  h.run("state.affinities.seriesA.color='#abcdef';state.affinities.seriesB.color='#fedcba';state.preferences.icon='';state.events.icon='';state.membership.icon=''");
  assert.equal(h.run("personaFingerprint(state,'sales')"), before);
  h.run("state.preferences.items[0].value='A deliberate change'");
  assert.notEqual(h.run("personaFingerprint(state,'sales')"), before);
});
test('step navigation honors reduced motion without removing focus movement', () => {
  const h = harness(), scrolls = [];
  h.box.window.scrollTo = options => scrolls.push(options);
  h.box.window.matchMedia = () => ({ matches: true });
  h.run('goToStep(3)');
  assert.equal(scrolls[0].behavior, 'auto');
  h.box.window.matchMedia = () => ({ matches: false });
  h.run('goToStep(4)');
  assert.equal(scrolls[1].behavior, 'smooth');
});
test('copy failure instructions persist; a prior successful copy timer cannot clear them', async () => {
  const h = harness(), textarea = h.node('copy-modal-textarea');
  textarea.select = () => {}; textarea.setSelectionRange = () => {};
  h.box.navigator.clipboard = { writeText: async () => {} };
  h.run("tryCopyToClipboard('html')"); await Promise.resolve(); await Promise.resolve();
  assert.ok([...h.timers.values()].some(timer => timer.ms === 2500));
  h.box.navigator.clipboard = null;
  h.run("tryCopyToClipboard('html')");
  assert.match(h.node('copy-modal-status').textContent, /Select the text/);
  assert.ok(![...h.timers.values()].some(timer => timer.ms === 2500));
});
test('stop before initial generation completes preserves the original draft and permits a new run', async () => {
  const h = harness(), first = deferred(), second = deferred();
  let calls = 0;
  h.box.window.LocalAI = { analyzeCustomerURL: () => (++calls === 1 ? first.promise : second.promise) };
  const original = h.get();
  const initial = h.run('onQuickStartAnalyze()');
  assert.equal(h.run('isProfileSetGenerationRunning()'), true);
  h.run('stopProfileSetGeneration()');
  assert.equal(h.get(), original); assert.equal(h.node('quickstart-btn').disabled, false);
  const next = h.run('onQuickStartAnalyze()');
  first.resolve(h.fixture()); await initial;
  assert.equal(h.get(), original); assert.equal(h.run('isProfileSetGenerationRunning()'), true);
  h.run('stopProfileSetGeneration()'); second.resolve(h.fixture()); await next;
  assert.equal(h.get(), original); assert.equal(h.run('isProfileSetGenerationRunning()'), false);
});
test('stop after lead text keeps completed work and ignores late imagery without starting other views', async () => {
  const h = harness(), started = deferred(), images = deferred();
  const ai = h.fixture(); ai.recommendations.items[0].image = 'data:image/png;base64,a2VlcA==';
  let overlays = 0;
  h.box.window.LocalAI = {
    analyzeCustomerURL: async () => ai,
    generatePersonaRecommendationImages: () => { started.resolve(); return images.promise; },
    generatePersonaOverlay: async () => { overlays++; return {}; }
  };
  const pending = h.run('onQuickStartAnalyze()'); await started.promise;
  const completedTitle = h.get().recommendations.items[0].title;
  h.run('stopProfileSetGeneration()');
  assert.equal(h.get().profileSet.statuses.sales, 'ready'); assert.equal(h.get().profileSet.statuses.service, 'failed');
  assert.equal(h.get().profileSet.visuals.sales.state, 'stopped');
  images.resolve({ results: [{ slot: 'rec_1', imageData: 'data:image/png;base64,bGF0ZQ==' }] });
  await pending;
  assert.equal(overlays, 0); assert.equal(h.get().recommendations.items[0].title, completedTitle);
  assert.equal(h.get().recommendations.items[0].image, 'data:image/png;base64,a2VlcA==');
  assert.equal(h.get().recommendations.items[1].image, '');
  assert.match(h.node('profile-set-progress').innerHTML, /Retry images only/);
  assert.match(h.node('profile-set-progress').innerHTML, /Retry this view/);
});
test('stopped visuals do not restart on selection, but explicit retry uses a fresh request ID', async () => {
  const h = harness(), old = deferred(), fresh = deferred();
  let calls = 0;
  h.run("state.recommendations.items.forEach(item=>item.image='');snapshotPersonaView();activeProfileSetRun={owner:state,lenses:['sales']};ensureProfileSet().statuses.sales='ready'");
  h.box.window.LocalAI = { generatePersonaRecommendationImages: () => (++calls === 1 ? old.promise : fresh.promise) };
  const initial = h.run("generatePersonaRecommendationImagesForTarget('sales',state)");
  h.run('stopProfileSetGeneration()'); await h.run("ensurePersonaRecommendationImages('sales')");
  assert.equal(calls, 1);
  const retry = h.run("retryPersonaVisuals('sales')");
  old.resolve({ results: [{ slot: 'rec_0', imageData: 'old' }] }); await initial;
  assert.equal(h.get().recommendations.items[0].image, '');
  fresh.resolve({ results: [{ slot: 'rec_0', imageData: 'new' }] }); await retry;
  assert.equal(h.get().recommendations.items[0].image, 'new');
});
test('real initial LocalAI pipeline stops scheduling later requests at every asynchronous boundary', async () => {
  // Execute the actual collect -> health -> LLM -> image pipeline, not a stub
  // for analyzeCustomerURL. Only HTTP responses are deterministic fixtures.
  for (const pauseAt of ['scrape', 'health', 'llm', 'generate-images']) {
    const h = harness(), started = deferred(), response = deferred(), calls = [];
    const ai = h.fixture(); ai.profile.photo = '';
    const original = h.get();
    h.box.window.UPG_Shared.extractCoreHTML = (_, url) => ({ url, title: 'Customer', bodyText: 'Customer information', headings: '', favicon: '', logoCandidates: [], navLinkCandidates: [] });
    const resultFor = stage => stage === 'scrape'
      ? new Response('<html><head><title>Customer website page</title></head><body>Customer details</body></html>', { headers: { 'content-type': 'text/html' } })
      : new Response(JSON.stringify(stage === 'llm' ? { text: JSON.stringify(ai), model_used: 'test' } : stage === 'generate-images' ? { results: [] } : {}));
    h.box.fetch = async url => {
      const stage = new URL(url, 'https://upg.example').pathname.split('/').at(-1);
      calls.push(stage);
      if (stage === pauseAt) { started.resolve(); return response.promise; }
      return resultFor(stage);
    };
    vm.runInContext(read('localai'), h.box, { filename: 'localai.js' });
    const pending = h.run('onQuickStartAnalyze()');
    await started.promise;
    h.run('stopProfileSetGeneration()');
    response.resolve(resultFor(pauseAt));
    await pending;
    const expected = ['scrape', 'health', 'llm', 'generate-images'];
    assert.deepEqual(calls, expected.slice(0, expected.indexOf(pauseAt) + 1), `No new request after stopping during ${pauseAt}`);
    assert.equal(h.get(), original, `Draft retained after stopping during ${pauseAt}`);
    assert.equal(h.run('isProfileSetGenerationRunning()'), false);
  }
});
test('LocalAI cancellation remains optional for existing callers', async () => {
  const h = harness(), calls = [];
  const ai = h.fixture();
  h.box.window.UPG_Shared.extractCoreHTML = (_, url) => ({ url, title: 'Customer', bodyText: '', headings: '', favicon: '', logoCandidates: [], navLinkCandidates: [] });
  h.box.fetch = async url => {
    const stage = new URL(url, 'https://upg.example').pathname.split('/').at(-1);
    calls.push(stage);
    return stage === 'scrape'
      ? new Response('<html><head><title>Customer website title</title></head></html>', { headers: { 'content-type': 'text/html' } })
      : new Response(JSON.stringify(stage === 'llm' ? { text: JSON.stringify(ai) } : stage === 'generate-images' ? { results: [] } : {}));
  };
  vm.runInContext(read('localai'), h.box, { filename: 'localai.js' });
  const result = await h.box.window.LocalAI.analyzeCustomerURL('https://customer.example/', { strategy: { lens: 'sales' } });
  assert.equal(result.brandName, ai.brandName);
  assert.deepEqual(calls, ['scrape', 'health', 'llm', 'generate-images']);
});
