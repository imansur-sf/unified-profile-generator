// DOM-unit checks only: no browser engine, external resources, live AI, or SSO.
// Supply an existing jsdom installation; this is not an application dependency:
//   UPG_JSDOM_PATH=/path/to/node_modules/jsdom node scripts/check-preview-dom.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require(process.env.UPG_JSDOM_PATH || process.argv[2] || 'jsdom');
const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'preview-v2');
const html = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');

async function main() {
  const errors = [], alerts = [], blocked = [], saves = [], frames = new Map();
  let nextFrame = 0, copied = '', originalProject = null;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://upg.test/preview-v2/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window, d = w.document, context = dom.getInternalVMContext();
  const run = source => vm.runInContext(source, context);
  const get = id => { const node = d.getElementById(id); assert.ok(node, `Missing #${id}`); return node; };
  const plain = value => JSON.parse(JSON.stringify(value));
  w.addEventListener('error', event => errors.push(event.message));
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLElement.prototype.getClientRects = function () { return this.closest('[hidden], .hidden') ? [] : [{ width: 800, height: 450 }]; };
  Object.defineProperties(w.HTMLElement.prototype, {
    clientWidth: { configurable: true, get() { return this.id === 'presentation-canvas' ? 1600 : 800; } },
    clientHeight: { configurable: true, get() { return this.id === 'presentation-canvas' ? 900 : 450; } }
  });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.matchMedia = query => ({ media: query, matches: query.includes('prefers-reduced-motion'), addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  w.cancelAnimationFrame = id => frames.delete(id);
  const flushFrames = () => {
    for (let rounds = 0; frames.size && rounds < 10; rounds++) {
      const pending = [...frames]; frames.clear(); pending.forEach(([, callback]) => callback(0));
    }
    assert.equal(frames.size, 0, 'Animation frame loop did not settle');
  };
  w.alert = message => alerts.push(message);
  w.confirm = () => true;
  w.XMLHttpRequest = class { constructor() { throw new Error('XMLHttpRequest is disabled in the DOM harness'); } };
  w.WebSocket = class { constructor() { throw new Error('WebSocket is disabled in the DOM harness'); } };
  w.TextEncoder = TextEncoder;
  w.URL.createObjectURL = () => 'blob:dom-test';
  w.URL.revokeObjectURL = () => {};
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  w.fetch = async input => {
    const url = new URL(String(input), w.location.href);
    if (url.origin === w.location.origin && /^\/preview-v2\/assets\/[\w.-]+$/.test(url.pathname)) {
      const bytes = fs.readFileSync(path.join(root, 'assets', path.basename(url.pathname)));
      return { ok: true, status: 200, blob: async () => new w.Blob([bytes], { type: 'image/jpeg' }) };
    }
    blocked.push(`${url.origin}${url.pathname}`);
    throw new Error('Network is disabled in the DOM harness');
  };
  // Explicit auth/account stub: no external auth script or project writes run.
  w.SaasyAuth = {
    isSignedIn: () => true, getEmail: () => 'dom-test@example.test', signIn: async () => {},
    listApiKeys: async () => ({ keys: [] }), listProjects: async () => originalProject ? [originalProject] : [],
    loadProject: async () => plain(originalProject),
    saveProject: async options => { saves.push(plain(options)); return { id: `preview-copy-${saves.length}`, name: options.name, revision: 1 }; },
    deleteProject: async () => assert.fail('Original projects must not be deleted by preview')
  };
  const studioStyle = d.createElement('style');
  studioStyle.textContent = fs.readFileSync(path.join(preview, 'studio.css'), 'utf8');
  d.head.appendChild(studioStyle);
  // Let jsdom finish parsing before module execution so boot happens exactly once.
  if (d.readyState === 'loading') await new Promise(resolve => d.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const modules = [...html.matchAll(/['"](js\/[\w-]+\.js)['"]/g)].map(match => match[1]);
  assert.ok(modules.length >= 10, 'Preview module loader is incomplete');
  for (const file of new Set(modules)) vm.runInContext(fs.readFileSync(path.join(preview, file), 'utf8'), context, { filename: file });
  await new Promise(resolve => setImmediate(resolve));
  flushFrames();

  // outside-only deliberately disables HTML inline handlers. Evaluate only the
  // selected trusted handler, then dispatch its event for addEventListener code.
  async function act(node, eventName = 'click') {
    const source = node.getAttribute(`on${eventName}`);
    if (source) {
      w.__domTarget = node;
      await run(`(function(event){${source}\n}).call(window.__domTarget,new Event(${JSON.stringify(eventName)},{bubbles:true}))`);
      delete w.__domTarget;
    }
    node.dispatchEvent(new w.Event(eventName, { bubbles: true }));
    flushFrames();
  }
  let passed = 0, failed = 0;
  async function check(name, fn) {
    try { await fn(); assert.deepEqual(errors, [], 'Uncaught DOM/runtime errors'); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  function duplicateIds() {
    const seen = new Set();
    return [...d.querySelectorAll('[id]')].map(node => node.id).filter(id => seen.has(id) || !seen.add(id));
  }
  function hasName(node) {
    return Boolean(node.getAttribute('aria-label')?.trim() || node.getAttribute('aria-labelledby')?.split(/\s+/).some(id => d.getElementById(id)?.textContent.trim()) || node.labels?.length || node.textContent.trim());
  }
  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
  async function until(predicate, message) {
    for (let turn = 0; turn < 60; turn++) {
      if (predicate()) return;
      await new Promise(resolve => setImmediate(resolve)); flushFrames();
    }
    assert.fail(message);
  }
  function aiFixture(mode, lens, label = 'created') {
    const data = plain(run(`cloneProfileMode('${mode}','generic')`));
    data.brandName = `${mode.toUpperCase()} DOM customer`;
    data.profile.name = `Generated ${mode} individual`;
    if (data.account) data.account.name = `Generated ${mode} account`;
    const marker = `${mode} ${lens} ${label}`;
    data.insights = { title: 'Signals', items: [{ icon: '✦', label: 'Evidence', value: marker }] };
    data.affinities = { title: 'Signals', seriesA: { label: 'Current', color: '#123456' }, seriesB: { label: 'Prior', color: '#654321' }, groups: [{ name: 'Signal group', items: [{ label: marker, a: 65, b: 45 }] }] };
    data.preferences = { title: 'Preferences', items: [{ label: 'Preference', value: marker }] };
    data.events = { title: 'Events', items: [{ name: marker, date: 'Today', confirmation: 'Ready' }] };
    data.membership = { title: 'Membership', items: [{ label: 'Program', value: marker }] };
    data.recommendations = { title: 'Actions', items: [{ title: marker, cta: 'Review', image: '' }] };
    data.activity = { title: 'Activity', items: [{ title: marker, body: 'Deterministic test evidence', time: 'Today', icon: '✦' }] };
    data.extraCards = []; data.rightExtraCards = []; data.railFields = [];
    data._sourceContext = { url: `https://${mode}.example.test/`, title: 'DOM customer context' };
    data._meta = { source_url: data._sourceContext.url, logo_candidates: [] };
    return data;
  }
  function stubAI(mode, analysisGate) {
    const original = w.LocalAI, overlays = [], imageCalls = [], analyses = [];
    w.LocalAI = Object.assign({}, original, {
      analyzeCustomerURL: async (url, options) => {
        analyses.push({ url, profileType: options.profileType, strategy: plain(options.strategy) });
        options.onStatus?.('analyzing');
        return analysisGate ? analysisGate.promise : aiFixture(mode, options.strategy.lens);
      },
      collectCustomerContext: async url => ({ url, title: 'Fresh personalize context' }),
      generatePersonaOverlay: (source, identity, options) => {
        const gate = deferred(); overlays.push({ ...gate, source, identity: plain(identity), options: plain(options) }); return gate.promise;
      },
      generatePersonaRecommendationImages: async input => {
        imageCalls.push(plain(input));
        return { results: input.recommendations.map((item, index) => ({ slot: `rec_${index}`, imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S0sAAAAASUVORK5CYII=' })) };
      }
    });
    return { overlays, imageCalls, analyses, restore() { w.LocalAI = original; } };
  }
  async function configureGeneration(mode, lenses = ['sales', 'service', 'marketing', 'success']) {
    // Exercise actual mode/input handlers, not a replacement application state.
    await act(get(`profile-type-${mode === 'b2c' ? 'b2b' : 'b2c'}`));
    await act(get(`profile-type-${mode}`)); await act(get('persona-sales'));
    get('quickstart-url').value = `https://${mode}.example.test/`;
    d.querySelectorAll('.profile-set-choices input').forEach(input => { input.checked = lenses.includes(input.value); });
    get('strategy-brief').value = `${mode} sales creation brief`; await act(get('strategy-brief'), 'input');
  }
  try {
    await check('boot with real preview modules and unique IDs', () => {
      assert.equal(run('TOTAL_STEPS'), 7); assert.deepEqual(duplicateIds(), []);
      assert.equal(d.querySelectorAll('#persona-picker').length, 1);
      assert.equal(get('persona-picker').querySelectorAll('[role="radio"]').length, 5);
      assert.match(get('studio-preview-title').textContent, /Sales/);
    });
    await check('concise context keeps disclosure and recovery feedback available', () => {
      assert.equal(get('demo-data-note').open, false);
      assert.match(get('demo-data-note').querySelector('summary').textContent, /Simulated demo data/);
      assert.match(get('demo-data-note').querySelector('p').textContent, /do not represent live CRM records/);
      assert.equal(get('selected-view-name').hidden, true);
      assert.equal(d.querySelector('label[for="quickstart-url"]').textContent, 'Customer website');
      assert.equal(get('selected-view-status').textContent, 'Sample profile');
      run("state.profileSet.statuses.sales='ready';state.profileSet.visuals.sales={state:'ready'};renderProfileProgress()");
      assert.equal(get('selected-view-status').textContent, '');
      assert.equal(get('profile-set-progress').hidden, true);
      run("state.profileSet.visuals.sales.state='failed';renderProfileProgress()");
      assert.match(get('selected-view-status').textContent, /Images need retry/);
      assert.equal(get('profile-set-progress').hidden, false);
      assert.ok(get('profile-set-progress').querySelector('button[onclick="retryPersonaVisuals(\'sales\')"]'));
      run("state.profileSet.statuses={};state.profileSet.visuals={};renderProfileProgress()");
      run("setDraftStatus('Backed up in this browser')");
      assert.equal(get('draft-status').textContent, 'Backed up in this browser');
      run("setDraftStatus('Local backup unavailable', 'warning')");
      assert.equal(get('draft-status').dataset.state, 'warning');
      run("setDraftStatus('Not saved online')");
      const choices = [...d.querySelectorAll('.profile-set-choices input')];
      const selected = choices.map(input => input.checked);
      choices.forEach(input => { input.checked = false; }); w.renderStudioUI();
      assert.equal(get('quickstart-btn').disabled, true);
      assert.equal(get('quickstart-btn').textContent, 'Choose at least one view');
      choices[0].checked = true; w.renderStudioUI();
      assert.equal(get('quickstart-btn').disabled, false);
      assert.equal(get('quickstart-btn').textContent, 'Create 1 view →');
      choices.forEach((input, i) => { input.checked = selected[i]; }); w.renderStudioUI();
    });
    await check('field finder navigates actual generated editors without changing the profile', async () => {
      const before = run('JSON.stringify(state)');
      const title = run('state.recommendations.items[0].title');
      const target = [...get('recs-container').querySelectorAll('input')].find(input => input.value === title);
      assert.ok(target, 'Actual recommendation editor missing');
      const search = get('studio-search-input');
      search.focus(); search.value = title; await act(search, 'input');
      assert.ok(get('studio-search-results').children.length);
      search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      assert.ok(d.getElementById(search.getAttribute('aria-activedescendant')));
      search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); flushFrames();
      assert.equal(run('currentStep'), 5);
      assert.equal(d.activeElement, target);
      assert.equal(get('studio-search-popover').hidden, true);
      assert.equal(run('JSON.stringify(state)'), before, 'Finding a field must not edit the profile');
      search.focus(); search.value = 'Brand Logo'; await act(search, 'input');
      const logo = [...get('studio-search-results').children].find(option => option.querySelector('.studio-search-result-title').textContent === 'Brand Logo');
      assert.ok(logo); await act(logo);
      assert.equal(run('currentStep'), 0);
      assert.equal(d.activeElement.id, 'url-logo');
      search.value = '';
    });
    for (const mode of ['b2c', 'b2b']) await check(`${mode}: all seven steps and generated widescreen document`, async () => {
      await act(get(`profile-type-${mode}`));
      for (let step = 0; step < 7; step++) {
        await act(d.querySelector(`#step-indicators [data-step="${step}"]`));
        assert.equal(run('currentStep'), step);
        assert.equal(d.querySelectorAll('.step-panel.active').length, 1);
        assert.equal(d.querySelector('.step-panel.active').dataset.step, String(step));
        assert.equal(d.querySelector('#step-indicators [aria-current="step"]').dataset.step, String(step));
      }
      const output = w.renderPreviewNow();
      assert.ok(/html\s*\{\s*width:\s*1600px;\s*min-height:\s*900px/.test(output), 'Renderer must emit the shared 1600×900 logical viewport');
      assert.ok(output.includes('upg-render-canvas'), 'Export host canvas missing');
      const expectedPreview = typeof w.withPreviewLayoutBridge === 'function'
        ? w.withPreviewLayoutBridge(output, run('previewContext.revision'), mode) : output;
      assert.ok(get('preview-iframe').srcdoc === expectedPreview, 'Preview must contain the same generated profile plus only its editor bridge');
      assert.ok(!output.includes('upg:preview-layout'), 'Editor layout bridge must not leak into exported output');
      assert.equal(get('preview-iframe').style.width, '1600px');
      assert.equal(get('preview-iframe').style.height, '900px');
      assert.equal(get('right-col-width-control').hidden, mode === 'b2b');
      assert.deepEqual(duplicateIds(), []);
    });
    await check('persistent persona picker updates labels and preserves independent edits', async () => {
      const picker = get('persona-picker'), sales = get('persona-sales');
      await act(sales);
      get('strategy-brief').value = 'Sales brief retained'; await act(get('strategy-brief'), 'input');
      run("state.insights.title='Sales unique insight';fillStaticFields()");
      await act(get('persona-service'));
      get('strategy-brief').value = 'Service brief retained'; await act(get('strategy-brief'), 'input');
      run("state.insights.title='Service unique insight';fillStaticFields()");
      assert.match(get('studio-preview-title').textContent, /Service/);
      assert.match(get('studio-personalize-label').textContent, /Service/);
      assert.equal(get('persona-service').getAttribute('aria-checked'), 'true');
      await act(sales);
      assert.equal(run('state.insights.title'), 'Sales unique insight');
      assert.equal(get('strategy-brief').value, 'Sales brief retained');
      await act(get('persona-service'));
      assert.equal(run('state.insights.title'), 'Service unique insight');
      assert.equal(get('strategy-brief').value, 'Service brief retained');
      assert.equal(get('persona-picker'), picker); assert.equal(get('persona-sales'), sales);
      assert.equal(picker.querySelectorAll('[tabindex="0"]').length, 1);
      assert.equal(w.getComputedStyle(get('persona-output-switcher')).display, 'none', 'The legacy output picker must not create a second visible persona selector');
    });
    await check('custom role, objective, and brief survive switching views', async () => {
      await act(get('persona-custom'));
      get('strategy-custom-role').value = 'Regional manager';
      get('strategy-objective').value = 'expand';
      get('strategy-brief').value = 'Review regional opportunity coverage';
      await act(get('strategy-custom-role'), 'input');
      await act(get('persona-sales')); await act(get('persona-custom'));
      assert.equal(get('strategy-custom-role').value, 'Regional manager');
      assert.equal(get('strategy-objective').value, 'expand');
      assert.equal(get('strategy-brief').value, 'Review regional opportunity coverage');
      assert.match(get('studio-preview-title').textContent, /Regional manager/);
      assert.equal(get('custom-role-field').hidden, false);
    });
    await check('personalize shortcut retains fields and restores editor focus', () => {
      const before = get('strategy-brief').value;
      w.studioTogglePreviewFocus(true); w.studioPersonalizeView(); flushFrames();
      assert.equal(run('currentStep'), 0);
      assert.equal(d.body.classList.contains('studio-preview-focused'), false);
      assert.equal(get('strategy-brief').value, before);
      assert.equal(d.activeElement, get('strategy-brief'));
    });
    await check('step navigation and Escape leave preview focus mode', async () => {
      w.studioTogglePreviewFocus(true);
      await act(d.querySelector('#step-indicators [data-step="2"]'));
      assert.equal(d.body.classList.contains('studio-preview-focused'), false);
      w.studioTogglePreviewFocus(true);
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(d.body.classList.contains('studio-preview-focused'), false);
      assert.equal(get('studio-focus-preview').getAttribute('aria-pressed'), 'false');
      assert.equal(d.activeElement, get('studio-focus-preview'));
    });
    await check('settings and nested guide open/close restore dialog state', async () => {
      const prior = get('studio-focus-preview'); prior.focus();
      await w.openSettings();
      assert.equal(get('settings-modal').classList.contains('hidden'), false);
      w.openApiMcpGuide(); assert.equal(get('api-mcp-guide-modal').inert, false);
      w.closeApiMcpGuide(); assert.equal(get('settings-modal').inert, false);
      w.closeSettings(); assert.equal(get('settings-modal').classList.contains('hidden'), true);
      assert.equal(d.activeElement, prior); assert.equal(run('dialogStack.length'), 0);
    });
    await check('copy/export and presentation dialogs use actual generated output', async () => {
      w.studioExport('copy'); await Promise.resolve();
      assert.ok(get('copy-modal-textarea').value.includes('upg-render-canvas'));
      assert.equal(copied, get('copy-modal-textarea').value);
      await act(get('copy-modal-close')); assert.equal(d.getElementById('copy-modal'), null);
      w.openPresentation(); flushFrames();
      assert.equal(get('presentation-iframe').style.width, '1600px');
      assert.equal(get('presentation-iframe').style.height, '900px');
      assert.ok(get('presentation-iframe').srcdoc.includes('upg-render-canvas'));
      await act(get('presentation-close')); assert.equal(d.getElementById('presentation-overlay'), null);
      assert.equal(run('dialogStack.length'), 0);
    });
    await check('preview controls have accessible names and no duplicate IDs', () => {
      for (const node of d.querySelectorAll('#persona-picker button, .studio-header-actions button, .studio-header-actions summary, .studio-preview-expand, #studio-focus-preview, #studio-personalize-panel input, #studio-personalize-panel textarea, #studio-personalize-panel select')) assert.ok(hasName(node), `Unlabelled ${node.id || node.outerHTML.slice(0, 100)}`);
      assert.ok(get('preview-iframe').getAttribute('title'));
      assert.deepEqual(duplicateIds(), []);
    });
    await check('opening an original saves only a new preview copy', async () => {
      originalProject = { id: 'original-project', tool: 'upg', name: 'Original project', revision: 7, payload: plain(run('state')), source_url: '' };
      await w.loadProjectAndHydrate(originalProject.id);
      w.openSaveProjectModal(); get('save-project-name-input').value = 'DOM copy';
      await w.confirmSaveProject(false); // Even a caller requesting Update must be coerced to a copy.
      assert.equal(saves.length, 1); assert.equal(saves[0].id, null);
      assert.equal(saves[0].saveAsCopy, true); assert.equal(saves[0].expectedRevision, undefined);
      assert.match(saves[0].name, /^Preview · /); assert.equal(originalProject.revision, 7);
    });
    for (const mode of ['b2c', 'b2b']) await check(`${mode}: full four-persona AI flow and personalize while switching views (stubbed AI)`, async () => {
      const stub = stubAI(mode);
      let generation;
      try {
        await configureGeneration(mode);
        const imageStart = stub.imageCalls.length;
        generation = w.onQuickStartAnalyze();
        await until(() => stub.overlays.length === 1, 'First secondary persona never started');
        assert.equal(stub.analyses[0].profileType, mode);
        assert.equal(stub.analyses[0].strategy.brief, `${mode} sales creation brief`);
        assert.equal(get('quickstart-btn').disabled, true);
        const lenses = ['service', 'marketing', 'success'];
        for (let index = 0; index < lenses.length; index++) {
          await until(() => stub.overlays.length > index, `${lenses[index]} generation never started`);
          const call = stub.overlays[index];
          assert.equal(call.options.profileType, mode); assert.equal(call.options.strategy.lens, lenses[index]);
          assert.equal(call.identity[mode === 'b2b' ? 'account' : 'profile'].name, `Generated ${mode} ${mode === 'b2b' ? 'account' : 'individual'}`);
          // Visiting an in-flight/queued view must not count as a content edit.
          await act(get(`persona-${index === 0 ? 'marketing' : 'sales'}`));
          const selected = run('getProfileStrategy().lens');
          assert.match(get('studio-preview-title').textContent.toLowerCase(), new RegExp(selected));
          assert.ok(get('studio-personalize-scope').textContent.toLowerCase().includes(selected));
          call.resolve(aiFixture(mode, lenses[index]));
        }
        await generation;
        assert.equal(get('quickstart-btn').disabled, false);
        assert.equal(get('quickstart-error').style.display, 'none');
        assert.deepEqual(plain(run('state.profileSet.statuses')), { sales: 'ready', service: 'ready', marketing: 'ready', success: 'ready' });
        for (const lens of ['sales', ...lenses]) {
          const view = plain(run(`personaView(state,'${lens}')`));
          assert.equal(view.recommendations.items[0].title, `${mode} ${lens} created`);
          assert.match(view.recommendations.items[0].image, /^data:image\/png/);
        }
        assert.equal(stub.imageCalls.length - imageStart, 4);

        await act(get('persona-service'));
        const identityInput = get(mode === 'b2b' ? 'account-name' : 'profile-name');
        identityInput.value = `Edited ${mode} identity`; await act(identityInput, 'input'); w.onFieldChange();
        get('strategy-brief').value = `Latest ${mode} service requirements`; await act(get('strategy-brief'), 'input');
        get('strategy-objective').value = 'resolve'; await act(get('strategy-objective'), 'change');
        const personalize = w.onPersonalizeCurrentPersona();
        await until(() => stub.overlays.length === 4, 'Personalization did not start');
        const request = stub.overlays[3];
        assert.equal(request.identity[mode === 'b2b' ? 'account' : 'profile'].name, `Edited ${mode} identity`);
        assert.equal(request.options.strategy.brief, `Latest ${mode} service requirements`);
        assert.equal(request.options.strategy.objective, 'resolve');
        await act(get('persona-sales'));
        request.resolve(aiFixture(mode, 'service', 'personalized'));
        await personalize;
        await until(() => run("state.profileSet.visuals.service.state==='ready'"), 'Personalized visuals did not complete');
        assert.equal(run('getProfileStrategy().lens'), 'sales', 'Off-screen completion must not change the selected persona');
        assert.match(get('studio-preview-title').textContent, /Sales/);
        assert.match(get('studio-personalize-scope').textContent, /Sales/);
        await act(get('persona-service'));
        assert.equal(run('state.recommendations.items[0].title'), `${mode} service personalized`);
        assert.equal(get('strategy-brief').value, `Latest ${mode} service requirements`);
        assert.equal(identityInput.id, mode === 'b2b' ? 'account-name' : 'profile-name');
        assert.equal(get(identityInput.id).value, `Edited ${mode} identity`);
        assert.equal(plain(run("personaView(state,'sales')")).recommendations.items[0].title, `${mode} sales created`);
        assert.ok(w.renderPreviewNow().includes(`${mode} service personalized`));
      } finally {
        w.stopProfileSetGeneration?.();
        stub.overlays.forEach(call => call.resolve(aiFixture(mode, call.options.strategy.lens)));
        if (generation) await generation;
        stub.restore();
      }
    });
    await check('stop keeps completed views and rejects an in-flight secondary result (stubbed AI)', async () => {
      assert.equal(typeof w.stopProfileSetGeneration, 'function', 'Stop generation control missing');
      const stub = stubAI('b2c'); let generation;
      try {
        await configureGeneration('b2c'); generation = w.onQuickStartAnalyze();
        await until(() => stub.overlays.length === 1, 'No in-flight view to stop');
        const sales = plain(run("personaView(state,'sales')"));
        const pendingView = plain(run("personaView(state,'service')"));
        assert.equal(get('profile-set-stop').hidden, false);
        await act(get('profile-set-stop'));
        assert.equal(w.isProfileSetGenerationRunning(), false);
        assert.equal(get('profile-set-stop').hidden, true); assert.equal(get('quickstart-btn').disabled, false);
        stub.overlays[0].resolve(aiFixture('b2c', 'service', 'must not apply')); await generation;
        assert.deepEqual(plain(run("personaView(state,'sales')")), sales);
        assert.deepEqual(plain(run("personaView(state,'service')")), pendingView);
        assert.equal(run("state.profileSet.statuses.sales"), 'ready');
        assert.equal(run("state.profileSet.statuses.service"), 'failed');
        assert.equal(stub.overlays.length, 1, 'Stopped generation must not start another persona');
        assert.match(get('quickstart-status').textContent, /Stopped/);
      } finally { w.stopProfileSetGeneration?.(); stub.overlays.forEach(call => call.resolve(aiFixture('b2c', call.options.strategy.lens))); if (generation) await generation; stub.restore(); }
    });
    await check('stop before initial analysis preserves the old draft (stubbed AI)', async () => {
      const gate = deferred(), stub = stubAI('b2b', gate); let generation;
      try {
        await configureGeneration('b2b');
        const imageStart = stub.imageCalls.length;
        generation = w.onQuickStartAnalyze();
        const before = plain(run('state'));
        w.stopProfileSetGeneration(); gate.resolve(aiFixture('b2b', 'sales')); await generation;
        assert.deepEqual(plain(run('state')), before);
        assert.equal(stub.overlays.length, 0); assert.equal(stub.imageCalls.length, imageStart);
        assert.equal(get('quickstart-btn').disabled, false);
      } finally { gate.resolve(aiFixture('b2b', 'sales')); if (generation) await generation; stub.restore(); }
    });
    await check('no unexpected alerts or network requests', () => {
      assert.deepEqual(alerts, []); assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
    });
  } finally { dom.window.close(); }
  console.log(`DOM-only result: ${passed} passed, ${failed} failed. Layout/paint, real AI, SSO, and deployed saves are not covered.`);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(`FAIL boot: ${error.stack}`); process.exitCode = 1; });
