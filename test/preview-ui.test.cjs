const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'preview-v2/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'preview-v2/studio.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'preview-v2/js/studio.js'), 'utf8');

test('preview workspace preserves original input IDs and contains only one persona picker', () => {
  const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ids = text => [...text.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const originalIds = new Set(ids(original));
  const previewIds = ids(html);
  assert.equal(previewIds.length, new Set(previewIds).size, 'preview HTML must not duplicate IDs');
  originalIds.forEach(id => assert.ok(previewIds.includes(id), `missing original control ${id}`));
  ['sales', 'service', 'marketing', 'success', 'custom'].forEach(lens => {
    assert.equal((html.match(new RegExp(`id="persona-${lens}"`, 'g')) || []).length, 1);
  });
  assert.match(html, /id="persona-picker" role="radiogroup"/);
  assert.match(html, /href="\/">Back to original/);
  assert.match(html, /saves create separate preview copies/);
});

test('preview design loads last, keeps named navigation and has accessible preference fallbacks', () => {
  assert.match(html, /href="studio\.css/);
  assert.match(html, /'js\/app\.js','js\/studio\.js'/);
  ['Customer', 'Identity', 'Insights', 'Signals', 'Modules', 'Recommendations', 'Export'].forEach(name => {
    assert.match(html, new RegExp(`studio-step-number[^<]*[^]*?</span>${name}</button>`));
  });
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /prefers-reduced-transparency:\s*reduce/);
  assert.match(css, /prefers-contrast:\s*more/);
  assert.match(css, /forced-colors:\s*active/);
  assert.doesNotMatch(source, /(?:innerHTML|outerHTML)\s*=/, 'chrome must not recreate focused controls');
});

test('visual-recovery link inherits a readable color on the light inspector surface', () => {
  const app = fs.readFileSync(path.join(root, 'preview-v2/js/app.js'), 'utf8');
  const retry = app.match(/<button[^>]+onclick="retryPersonaRecommendationImages\(\)"[^>]*>/)?.[0];
  assert.ok(retry);
  assert.doesNotMatch(retry, /style="[^"]*color\s*:/);
  assert.match(css, /\.studio-app \.quickstart-settings-toggle \{ color: #335e90/);
});

test('preview logo stays prominent without shrinking or distorting the original artwork', () => {
  const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const logoSource = text => text.match(/<img src="([^"]+)" alt="SaaSy Solutions"/)?.[1];
  assert.ok(logoSource(original));
  assert.equal(logoSource(html), logoSource(original), 'The original artwork must not change');
  assert.match(html, /class="studio-brand-logo flex items-center justify-center overflow-hidden"/);
  assert.match(css, /\.studio-brand-logo \{ width: 5rem; height: 5rem; flex: 0 0 5rem; \}/);
  assert.match(css, /\.studio-brand-logo > img \{ display: block; width: 100%; height: 100%; object-fit: contain; \}/);
  assert.doesNotMatch(css.slice(css.indexOf('@media')), /\.studio-brand-logo\s*\{/, 'Narrow layouts must not shrink the logo');
  assert.match(css, /#preview-col \{[^}]*top: 6\.5rem;/, 'Sticky preview must clear the taller header');
  assert.match(css, /\.strategy-panel \{[^}]*scroll-margin-top: 6\.75rem;/);
});

test('preview branding retains readable blue accents', () => {
  assert.match(css, /\.studio-app \.app-topbar \{ background: linear-gradient\(110deg, #001e5b 0%, #022ac0 55%, #075dcc 100%\); color: #fff/);
  assert.match(css, /\.studio-app \.persona-option.active \{ color: #fff; border-color: var\(--studio-blue\); background: var\(--studio-blue\)/);
  assert.match(css, /\.studio-header-actions > \.studio-button-primary \{ background: #fff; color: #064eb2/);
  assert.match(css, /\.studio-header-actions > \.studio-menu > summary:focus-visible \{ outline-color: #fff/);
  for (const preference of ['prefers-reduced-transparency', 'prefers-contrast']) {
    const block = css.slice(css.indexOf(`@media (${preference}:`) + '@media'.length).split('@media')[0];
    assert.match(block, /\.studio-app \.app-topbar \{ background: #001e5b/);
  }
  const luminance = hex => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
  };
  for (const background of ['001e5b', '022ac0', '075dcc']) {
    assert.ok(contrast('ffffff', background) >= 4.5, `Header text on #${background}`);
    assert.ok(contrast('dceaff', background) >= 4.5, `Header subtitle on #${background}`);
  }
  assert.ok(contrast('ffffff', '075dcc') >= 4.5, 'Selected view');
  assert.ok(contrast('064eb2', 'ffffff') >= 4.5, 'Primary toolbar action');
  for (const background of ['e8f1ff', 'dbeafe']) {
    assert.ok(contrast('164e99', background) >= 4.5, 'Unselected profile title');
    assert.ok(contrast('345b87', background) >= 4.5, 'Unselected profile description');
  }
  assert.ok(contrast('ffffff', '004eae') >= 4.5, 'Selected profile hover');
  assert.ok(contrast('526b8e', 'f7faff') >= 4.5, 'Customer URL placeholder');
  assert.ok(contrast('397bd2', 'f7faff') >= 3, 'Customer URL border');
});

test('profile type and customer URL accents preserve distinct selection and focus states', () => {
  assert.match(css, /\.profile-type-option \{[^}]*background: #e8f1ff; border-color: #397bd2;/);
  assert.match(css, /\.profile-type-option span \{[^}]*opacity: 1;/, 'Descriptions must not inherit the original translucent text');
  assert.match(css, /\.profile-type-option\.active \{ background: var\(--studio-blue\); border-color: var\(--studio-blue\);/);
  assert.match(css, /\.profile-type-option\.active strong, \.studio-app \.profile-type-option\.active span \{ color: #fff;/);
  assert.match(css, /\.studio-app #wizard-col #quickstart-url \{[^}]*border: 2px solid #397bd2;/, 'URL border must outrank generic field styling');
  assert.match(css, /#quickstart-url:focus-visible \{ outline: 2px solid var\(--studio-blue\); outline-offset: 2px;/);
  const forcedColors = css.slice(css.indexOf('@media (forced-colors:'));
  assert.match(forcedColors, /\.profile-type-option\.active \{ outline: 2px solid Highlight;/);
  assert.match(forcedColors, /#quickstart-url:focus-visible \{ outline-color: Highlight;/);
});

function harness() {
  const elements = new Map();
  const calls = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', open: true, attributes: {},
      contains: () => false,
      setAttribute(key, value) { this.attributes[key] = value; },
      scrollIntoView: options => calls.push(['scroll', options]),
      focus: options => calls.push(['focus', id, options])
    });
    return elements.get(id);
  };
  const profile = {
    brandName: 'NCSA', profileType: 'b2c',
    profileStrategy: { lens: 'service' },
    profileSet: { statuses: {} }
  };
  const context = {
    state: profile,
    window: { matchMedia: () => ({ matches: true }) },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById: get,
      querySelectorAll: () => [{ value: 'sales' }, { value: 'service' }],
      activeElement: { closest: () => null },
      body: { classList: { toggle: (...args) => calls.push(['toggle', ...args]) } }
    },
    requestAnimationFrame: callback => { callback(); return 1; },
    cancelAnimationFrame() {},
    fitPreviewScale: () => calls.push(['fit']),
    getProfileStrategy: () => profile.profileStrategy,
    getProfileStrategyLabel: () => 'Service',
    goToStep: step => calls.push(['step', step]),
    downloadHTML: () => calls.push(['download']),
    copyHTML: () => calls.push(['copy']),
    exportForCloudy: () => calls.push(['cloudy'])
  };
  vm.runInNewContext(source, context);
  return { context, get, calls, profile };
}

test('workspace chrome reflects active view without changing customer state', () => {
  const { context, get, profile } = harness();
  const before = JSON.stringify(profile);
  context.window.renderStudioUI();
  assert.equal(get('studio-preview-title').textContent, 'Service preview');
  assert.equal(get('studio-personalize-label').textContent, 'Personalize Service');
  assert.equal(get('studio-project-name').textContent, 'NCSA · Individual profiles');
  assert.equal(get('studio-view-set-summary').textContent, '2 selected');
  assert.equal(get('profile-set-progress').hidden, true);
  assert.equal(JSON.stringify(profile), before);
});

test('real generation and image retry statuses remain visible', () => {
  const { context, get, profile } = harness();
  profile.profileSet.visuals = { service: { state: 'failed' } };
  context.window.renderStudioUI();
  assert.equal(get('profile-set-progress').hidden, false);
  profile.profileSet.visuals = {};
  profile.profileSet.statuses.service = 'generating';
  context.window.renderStudioUI();
  assert.equal(get('profile-set-progress').hidden, false);
});

test('completed generation stays quiet and creation count does not interrupt a running request', () => {
  const { context, get, profile } = harness();
  profile.profileSet.statuses.service = 'ready';
  profile.profileSet.visuals = { service: { state: 'ready' } };
  context.window.renderStudioUI();
  assert.equal(get('profile-set-progress').hidden, true);
  assert.equal(get('quickstart-btn').textContent, 'Create 2 views →');
  get('quickstart-btn').disabled = true;
  get('quickstart-btn').textContent = 'Creating views…';
  context.window.renderStudioUI();
  assert.equal(get('quickstart-btn').textContent, 'Creating views…');
  profile.profileSet.visuals.service.state = 'partial';
  context.window.renderStudioUI();
  assert.equal(get('profile-set-progress').hidden, false, 'Incomplete images retain their recovery actions');
});

test('view-set disclosure collapses only once and never closes around focused content', () => {
  const { context, get, profile } = harness();
  profile.profileSet.statuses.service = 'ready';
  context.window.renderStudioUI();
  assert.equal(get('studio-view-set').open, false);
  get('studio-view-set').open = true;
  context.window.renderStudioUI();
  assert.equal(get('studio-view-set').open, true, 'later user expansion should be preserved');
  const second = harness();
  second.profile.profileSet.statuses.service = 'ready';
  second.get('studio-view-set').contains = () => true;
  second.context.window.renderStudioUI();
  assert.equal(second.get('studio-view-set').open, true, 'must not hide a focused field');
});

test('focus mode and personalize remain reversible and respect reduced motion', () => {
  const { context, get, calls } = harness();
  context.window.studioTogglePreviewFocus(true);
  assert.equal(get('studio-focus-preview').attributes['aria-pressed'], 'true');
  assert.equal(get('studio-focus-preview').textContent, 'Show editor');
  context.window.studioPersonalizeView();
  assert.equal(get('studio-focus-preview').attributes['aria-pressed'], 'false');
  assert.ok(calls.some(call => call[0] === 'step' && call[1] === 0));
  assert.ok(calls.some(call => call[0] === 'scroll' && call[1].behavior === 'auto'));
  assert.ok(calls.some(call => call[0] === 'focus' && call[1] === 'strategy-brief'));
});

test('export menu delegates to the existing output handlers', () => {
  const { context, get, calls } = harness();
  for (const action of ['download', 'copy', 'cloudy', 'help']) context.window.studioExport(action);
  assert.equal(get('studio-export').open, false);
  for (const name of ['download', 'copy', 'cloudy']) assert.ok(calls.some(call => call[0] === name));
  assert.ok(calls.some(call => call[0] === 'step' && call[1] === 6));
});
