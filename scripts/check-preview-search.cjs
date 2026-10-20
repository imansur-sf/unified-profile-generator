// DOM checks only; no browser, external requests, AI or persistence.
// UPG_JSDOM_PATH=/path/to/node_modules/jsdom node scripts/check-preview-search.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require(process.env.UPG_JSDOM_PATH || 'jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'preview-v2/index.html'), 'utf8');

async function main() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://upg.test/preview-v2/' });
  const w = dom.window, d = w.document;
  // The fixture supplies the integration contract independently of page markup.
  // This lets the navigation module run without booting generation or auth.
  d.querySelector('#studio-search')?.remove();
  const host = d.createElement('div');
  host.id = 'studio-search';
  host.innerHTML = '<label for="studio-search-input">Find something to edit</label><input id="studio-search-input" type="search" role="combobox" aria-controls="studio-search-results" aria-expanded="false"><kbd id="studio-search-shortcut"></kbd><div id="studio-search-popover" hidden><p id="studio-search-context"></p><div id="studio-search-results" role="listbox"></div><p id="studio-search-empty"></p></div><p id="studio-search-status" role="status"></p>';
  d.getElementById('wizard-col').prepend(host);
  w.HTMLElement.prototype.scrollIntoView = function (options) { this.__scrolled = options; };
  w.matchMedia = () => ({ matches: true });
  w.fetch = () => assert.fail('Finder must never use the network');
  let step = -1, focusMode;
  w.goToStep = (value, options) => {
    step = value;
    d.querySelectorAll('.step-panel').forEach(panel => panel.classList.toggle('active', Number(panel.dataset.step) === value));
    assert.deepEqual(JSON.parse(JSON.stringify(options)), { focus: false, scroll: false });
  };
  w.studioTogglePreviewFocus = value => { focusMode = value; };
  const ctx = dom.getInternalVMContext();
  vm.runInContext('var state = {profileType:"b2c"}; var lens = "sales"; function getProfileStrategy(){return {lens};}', ctx);
  if (d.readyState === 'loading') await new Promise(resolve => d.addEventListener('DOMContentLoaded', resolve, { once: true }));
  vm.runInContext(fs.readFileSync(path.join(root, 'preview-v2/js/studio-search.js'), 'utf8'), ctx);
  const input = d.getElementById('studio-search-input');
  const results = d.getElementById('studio-search-results');
  const popover = d.getElementById('studio-search-popover');
  const status = d.getElementById('studio-search-status');
  const type = text => { input.focus(); input.value = text; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const key = value => input.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  const tick = () => new Promise(resolve => setTimeout(resolve, 130));
  let passed = 0;
  function check(name, action) { action(); passed++; console.log(`PASS ${name}`); }

  check('empty query gives a hint without listing every field', () => {
    type(''); assert.equal(results.children.length, 0); assert.match(d.getElementById('studio-search-empty').textContent, /Search a field name/);
  });
  check('logo finds the existing shared editor control and keyboard opens it', () => {
    type('Brand Logo'); assert.ok(results.textContent.includes('Brand Logo'));
    key('ArrowDown'); assert.ok(input.hasAttribute('aria-activedescendant'));
    key('Enter'); assert.equal(step, 0); assert.equal(focusMode, false);
    assert.equal(d.activeElement.id, 'url-logo'); assert.equal(popover.hidden, true);
    assert.equal(d.activeElement.__scrolled.behavior, 'auto');
  });

  const recs = d.getElementById('recs-container');
  recs.innerHTML = '<div class="row-card"><input placeholder="Title" value="Reschedule family recruiting assessment call"><input placeholder="Image URL" value="data:image/png;base64,privateImageBytes"></div>';
  const details = d.createElement('details');
  details.innerHTML = '<summary>More options</summary><input id="test-expanded-field" aria-label="Consultation location" value="Recruiting office">';
  recs.appendChild(details);
  const extras = d.getElementById('extra-cards-container');
  extras.innerHTML = '<div class="row-card"><input placeholder="Card title" value="Call coaching summary"><select aria-label="Call coaching summary visibility"><option value="suggested">Suggested</option></select><div><input placeholder="Label" value="Events attended"><input placeholder="Value" value="12 workshops"></div></div>';

  check('actual recommendation text is searchable across inactive steps', () => {
    type('family recruiting'); assert.ok(results.children.length >= 1); key('Enter');
    assert.equal(step, 5); assert.equal(d.activeElement.value, 'Reschedule family recruiting assessment call');
  });
  check('suggested modules are navigable without changing visibility', () => {
    type('12 workshops'); assert.match(results.textContent, /Events attended/); assert.match(results.textContent, /Suggested module/); key('Enter');
    assert.equal(step, 4); assert.equal(d.activeElement.value, '12 workshops'); assert.equal(extras.querySelector('select').value, 'suggested');
  });
  check('metric labels identify their values instead of using an emoji as the row name', () => {
    const insights = d.getElementById('insights-container');
    insights.innerHTML = '<div class="row-card"><div><input placeholder="Icon" value="📈"><input placeholder="Label" value="Future attendance probability"><input placeholder="Value" value="84 percent"></div></div>';
    type('Future attendance probability');
    assert.ok([...results.children].some(option => /Future attendance probability · Value/.test(option.textContent)));
    const valueResult = [...results.children].find(option => /Future attendance probability · Value/.test(option.textContent));
    valueResult.click(); assert.equal(step, 2); assert.equal(d.activeElement.value, '84 percent');
  });
  check('opening a result expands ancestor disclosures', () => {
    type('Consultation location'); key('Enter'); assert.equal(details.open, true); assert.equal(d.activeElement.id, 'test-expanded-field');
  });
  check('data URLs and provider credentials do not enter the index', () => {
    type('privateImageBytes'); assert.equal(results.children.length, 0);
    const secret = d.querySelector('.quickstart-settings input');
    assert.ok(secret); secret.value = 'sensitiveProviderValue'; type('sensitiveProviderValue'); assert.equal(results.children.length, 0);
    recs.querySelector('input[placeholder="Image URL"]').value = 'https://cdn.example.test/privateRecommendationImage.jpg';
    type('privateRecommendationImage'); assert.equal(results.children.length, 0);
  });
  check('customer website URLs remain searchable and per-view instructions are not tagged shared', () => {
    d.getElementById('quickstart-url').value = 'https://www.customer-example.test/';
    type('https://www.customer-example.test/'); assert.equal(results.children.length, 1); assert.match(results.textContent, /Shared/);
    d.getElementById('strategy-brief').value = 'Unique sales instructions';
    type('Unique sales instructions'); assert.equal(results.children.length, 1); assert.doesNotMatch(results.textContent, /Shared/);
  });
  check('additional identity rail fields are scoped to the current view', () => {
    const rail = d.getElementById('rail-fields-container');
    rail.innerHTML = '<div><input placeholder="Label" value="Events attended this year"><input placeholder="Value" value="Seven events"></div>';
    type('Seven events'); assert.equal(results.children.length, 1); assert.doesNotMatch(results.textContent, /Shared/);
    assert.match(results.textContent, /Events attended this year/);
  });
  check('wrong profile mode and hidden custom-role fields are excluded', () => {
    const b2c = d.querySelector('.mode-b2c input'); const b2b = d.querySelector('.mode-b2b input');
    b2c.value = 'B2ConlyValue'; b2b.value = 'B2BonlyValue';
    type('B2ConlyValue'); assert.equal(results.children.length, 1);
    type('B2BonlyValue'); assert.equal(results.children.length, 0);
    vm.runInContext('state.profileType="b2b"', ctx);
    type('B2BonlyValue'); assert.equal(results.children.length, 1);
    type('B2ConlyValue'); assert.equal(results.children.length, 0);
    const custom = d.getElementById('strategy-custom-role'); custom.value = 'hiddenFinanceRole'; type('hiddenFinanceRole'); assert.equal(results.children.length, 0);
    vm.runInContext('state.profileType="b2c"', ctx);
  });
  check('stale persona results never focus another persona’s field', () => {
    type('family recruiting'); const stale = results.firstElementChild;
    vm.runInContext('lens="service"', ctx); stale.click();
    assert.equal(d.activeElement, input); assert.match(status.textContent, /editor changed/);
    vm.runInContext('lens="sales"', ctx);
  });
  check('custom views use their actual role label', () => {
    vm.runInContext('lens="custom"; function getProfileStrategyLabel(){return "Finance business partner";}', ctx);
    type('logo'); assert.match(d.getElementById('studio-search-context').textContent, /Finance business partner/);
    vm.runInContext('lens="sales"', ctx);
  });
  check('detached dynamic results are discarded instead of focusing stale nodes', () => {
    type('family recruiting'); const stale = results.firstElementChild;
    recs.querySelector('.row-card').remove(); stale.click();
    assert.equal(d.activeElement, input); assert.match(status.textContent, /editor changed/);
  });
  type('new live text');
  recs.insertAdjacentHTML('beforeend', '<input placeholder="Title" value="New live text after generation">');
  await tick();
  check('mutation refresh finds newly generated controls', () => { assert.equal(results.children.length, 1); });
  recs.lastElementChild.value = 'Updated without rerender';
  recs.lastElementChild.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick();
  check('input refresh removes old values from open results', () => { assert.equal(results.children.length, 0); });
  const targetPair = d.createElement('div');
  targetPair.innerHTML = '<input placeholder="First keyboard field" value="Keyboard fixture first"><input placeholder="Second keyboard field" value="Keyboard fixture second">';
  recs.appendChild(targetPair);
  type('Keyboard fixture'); key('ArrowDown'); key('ArrowDown');
  assert.match(d.getElementById(input.getAttribute('aria-activedescendant')).textContent, /Second keyboard field/);
  targetPair.insertAdjacentHTML('afterbegin', '<input placeholder="New keyboard field" value="Keyboard fixture inserted">');
  await tick();
  check('background refresh retains the selected field when result positions change', () => {
    assert.match(d.getElementById(input.getAttribute('aria-activedescendant')).textContent, /Second keyboard field/);
    key('Enter'); assert.equal(d.activeElement.placeholder, 'Second keyboard field');
  });
  check('Escape and Tab close search; command shortcut opens it', () => {
    type('logo'); key('Escape'); assert.equal(popover.hidden, true); assert.equal(input.getAttribute('aria-expanded'), 'false');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
    assert.equal(d.activeElement, input); assert.equal(popover.hidden, false); key('Tab'); assert.equal(popover.hidden, true);
  });
  check('command shortcut respects open dialogs', () => {
    const dialog = d.createElement('div'); dialog.setAttribute('role', 'dialog'); d.body.appendChild(dialog);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })); assert.equal(popover.hidden, true);
  });
  console.log(`${passed} field finder DOM checks passed`);
  dom.window.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
