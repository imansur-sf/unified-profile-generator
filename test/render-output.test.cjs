const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ URL, console });
for (const name of ['defaults', 'generator']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', `${name}.js`), 'utf8'), context, { filename: name });
}
const evaluate = code => vm.runInContext(code, context);
const profile = (mode = 'b2c', industry = 'generic') => context.cloneProfileMode(mode, industry);
const render = state => context.generateProfileHTML(state);

// HTMLParser's script CDATA handling exercises the HTML boundary, unlike
// compiling a concatenation of .js files. No browser or network is involved.
function parseHTML(html) {
  return JSON.parse(execFileSync('python3', ['-c', `
import json, sys
from html.parser import HTMLParser
class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags=[]; self.scripts=[]; self.script=None
    def handle_starttag(self, tag, attrs):
        self.tags.append({'tag':tag,'attrs':dict(attrs)})
        if tag == 'script': self.script=''
    def handle_data(self, data):
        if self.script is not None: self.script += data
    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            self.scripts.append(self.script); self.script=None
p=Parser(); p.feed(sys.stdin.read()); print(json.dumps({'tags':p.tags,'scripts':p.scripts}))
`], { input: html, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
}

test('all ten industry/mode fixtures render complete HTML', () => {
  for (const industry of ['recruiting', 'retail', 'healthcare', 'financial', 'generic']) {
    for (const mode of ['b2c', 'b2b']) {
      const html = render(profile(mode, industry));
      assert.ok(html.startsWith('<!DOCTYPE html>'), `${mode}/${industry}`);
      assert.ok(html.endsWith('</html>'), `${mode}/${industry}`);
      assert.ok(!html.includes('undefined'));
    }
  }
});

test('both templates preserve every visible extra identity field and escape its content', () => {
  for (const mode of ['b2c', 'b2b']) {
    const state = profile(mode);
    state.railFields = Array.from({ length: 12 }, (_, i) => ({ id: `rail-${i}`, label: `FACT_${i}`, value: `VALUE_${i}`, visible: true }));
    state.railFields.push({ id: 'hidden', label: 'HIDDEN_RAIL', value: 'secret', visible: false });
    state.railFields.push({ id: '\" onclick=\"bad()', label: '<script>LABEL</script>', value: 0, icon: '<b>✓</b><img src=x onerror=bad()>' });
    const html = render(state);
    const { tags } = parseHTML(html);
    const fields = tags.filter(({ attrs }) => attrs['data-rail-field-id'] !== undefined);
    assert.equal(fields.length, 13);
    for (let i = 0; i < 12; i++) assert.ok(html.includes(`FACT_${i}`) && html.includes(`VALUE_${i}`));
    assert.ok(!html.includes('HIDDEN_RAIL'));
    assert.ok(html.includes('&lt;script&gt;LABEL&lt;/script&gt;'));
    assert.match(html, /<b>✓<\/b>/);
    assert.ok(!tags.some(({ attrs }) => attrs.onclick === 'bad()' || attrs.onerror));
    assert.match(html, mode === 'b2b' ? /<b>0<\/b>/ : /class="profile-field-value">0<\/span>/);
    assert.ok(html.indexOf('FACT_0') < html.indexOf('FACT_11'));
  }
});

test('B2C retains added recommendations, activities and visible cards', () => {
  const state = profile();
  state.recommendations.items = Array.from({ length: 7 }, (_, n) => ({ title: `REC_${n}`, cta: 'Review' }));
  state.activity.items = Array.from({ length: 12 }, (_, n) => ({ title: `EVENT_${n}`, body: '', time: '' }));
  state.extraCards = [{ title: 'MIDDLE_CARD', items: [], visibility: 'visible' }, { title: 'HIDDEN_CARD', items: [], visibility: 'hidden' }];
  state.rightExtraCards = [{ title: 'RIGHT_CARD', items: [], visibility: 'visible' }];
  const html = render(state);
  for (let i = 0; i < 7; i++) assert.ok(html.includes(`REC_${i}`));
  for (let i = 0; i < 12; i++) assert.ok(html.includes(`EVENT_${i}`));
  assert.ok(html.includes('MIDDLE_CARD') && html.includes('RIGHT_CARD'));
  assert.ok(html.indexOf('RIGHT_CARD') > html.indexOf('class="right-col"'));
  assert.ok(!html.includes('HIDDEN_CARD'));
  assert.ok(!html.includes('<div class="recs-arrow'));
  assert.ok(!html.includes('>View All</div>'));
});

test('B2B preserves every visible module and all authored rows with placement', () => {
  const state = profile('b2b');
  const rows = Array.from({ length: 9 }, (_, n) => ({ label: `ROW_${n}`, value: `VALUE_${n}` }));
  state.extraCards = [{ title: 'MIDDLE_ONE', items: rows }, { title: 'MIDDLE_TWO', items: rows }, { title: 'SUGGESTED_ONLY', visibility: 'suggested', items: [] }];
  state.rightExtraCards = [{ title: 'RIGHT_ONE', items: rows }, { title: 'RIGHT_HIDDEN', visibility: 'hidden', items: [] }];
  state.preferences.items = rows;
  state.membership.items = rows.map(row => ({ ...row, label: `PRODUCT_${row.label}` }));
  state.insights.items = rows.map(row => ({ ...row, label: `INSIGHT_${row.label}` }));
  state.events.items = rows.map((_, n) => ({ name: `PERSON_${n}`, date: 'Sponsor' }));
  state.activity.items = rows.map((_, n) => ({ title: `ACTIVITY_${n}` }));
  state.recommendations.items = rows.map((_, n) => ({ title: `ACTION_${n}`, image: `https://example.com/image-${n}.png` }));
  state.affinities.groups = [0, 1, 2].map(n => ({ name: `GROUP_${n}`, items: rows.map((row, n) => ({ ...row, a: n, b: 10 })) }));
  const html = render(state);
  for (const key of ['ROW_8', 'PRODUCT_ROW_8', 'INSIGHT_ROW_8', 'PERSON_8', 'ACTIVITY_8', 'ACTION_8', 'GROUP_2', 'image-8.png']) assert.ok(html.includes(key), key);
  assert.match(html, /data-module-placement="middle">[\s\S]*MIDDLE_ONE[\s\S]*MIDDLE_TWO[\s\S]*data-module-placement="right">[\s\S]*RIGHT_ONE/);
  assert.ok(!html.includes('SUGGESTED_ONLY') && !html.includes('RIGHT_HIDDEN'));
});

test('activity and recommendation content has focusable bounded list containers', () => {
  for (const mode of ['b2c', 'b2b']) {
    const html = render(profile(mode));
    const { tags } = parseHTML(html);
    const lists = tags.filter(tag => tag.attrs.role === 'list');
    assert.ok(lists.length >= 2);
    assert.ok(lists.every(tag => tag.attrs.tabindex === '0' && tag.attrs['aria-label']));
    if (mode === 'b2b') {
      assert.ok(tags.some(tag => /account-activity-card/.test(tag.attrs.class || '')));
      assert.match(html, /\.account-activity-card>\.account-activity\{[^}]*max-height:285px[^}]*overflow-y:auto/);
      assert.match(html, /\.account-actions\{[^}]*max-height:430px[^}]*overflow-y:auto/);
    } else {
      assert.match(html, /\.activity-list\s*\{[^}]*max-height: 290px;[^}]*overflow-y: auto/);
      assert.match(html, /\.recs-carousel\s*\{[^}]*max-height: 390px;[^}]*overflow-y: auto/);
    }
  }
});

test('both modes honor authored app, navigation and record-tab labels without links', () => {
  for (const mode of ['b2c', 'b2b']) {
    const state = profile(mode);
    state.appName = 'CUSTOM_CLOUD'; state.navLinks = ['CUSTOM_MENU']; state.tabName = 'CUSTOM_RECORD';
    const html = render(state);
    for (const value of [state.appName, state.navLinks[0], state.tabName]) assert.ok(html.includes(value));
    assert.equal(parseHTML(html).tags.filter(tag => tag.tag === 'a').length, 0);
  }
});

test('percentage parsing retains zero, handles fractions and rejects unknown labels', () => {
  for (const [input, expected] of [[0, 0], ['0%', 0], ['42/100', 42], ['3/4', 75], ['22.5%', 22.5], ['-10%', 0], ['140%', 100], ['', null], ['N/A', null], ['Critical risk', null], ['1/0', null], ['42/100 garbage', null]]) {
    assert.equal(context.scorePercent(input), expected, String(input));
  }
});

test('B2B meters and narrative do not invent favorable health or coverage', () => {
  const state = profile('b2b');
  state.accountMetrics.usageScore = '42/100'; state.accountMetrics.healthScore = '0%'; state.accountMetrics.healthTrend = 'Critical churn risk'; state.insights.items = [];
  let html = render(state);
  assert.ok(html.includes('aria-valuenow="0"><i style="width:0%"'));
  assert.ok(html.includes('aria-valuenow="42"><i style="width:42%"'));
  assert.ok(html.includes('Critical churn risk'));
  for (const invented of ['On track', '8 of 10 roles mapped', 'Expansion propensity:</b> High', 'class="rail-gauge"', 'class="account-spark"']) assert.ok(!html.includes(invented), invented);
  state.accountMetrics.healthScore = 'Unknown';
  html = render(state);
  assert.ok(html.includes('Health score: unavailable'));
  assert.ok(!html.includes('aria-valuenow="72"'));
});

function contrast(a, b) {
  const luminance = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test('light, white and dark brand colors receive readable semantic foregrounds', () => {
  for (const color of ['#ffffff', '#000000', '#404040', '#ff8800', '#ff0000', '#00ff00', '#0000ff', '#888888', '#fff7d1']) {
    const theme = context.getAccountColorTheme(color, color, color);
    assert.ok(contrast(color, theme.text) >= 4.5, color);
    assert.ok(contrast(color, theme.markText) >= 4.5, color);
    assert.ok(contrast('#ffffff', theme.primaryInk) >= 4.5, color);
    assert.ok(contrast('#ffffff', theme.accentInk) >= 4.5, color);
    assert.ok(contrast(color, theme.navInk) >= 4.5, color);
  }
  for (const mode of ['b2c', 'b2b']) {
    const state = profile(mode); state.colors.primary = state.colors.accent = '#ffffff';
    const html = render(state);
    assert.match(html, /--primary:\s*#ffffff/);
    if (mode === 'b2c') assert.match(html, /\.rec-cta\s*\{[^}]*color: var\(--primary-text\)/);
    else assert.match(html, /\.account-action-label\{[^}]*color:var\(--accent-ink\)/);
  }
});

test('both modes give image logos a white box without changing primary branding or monograms', () => {
  for (const mode of ['b2c', 'b2b']) {
    const state = profile(mode); state.colors.primary = '#002b66'; state.logo = 'data:image/png;base64,cG5n';
    const html = render(state), parsed = parseHTML(html);
    const mark = parsed.tags.find(tag => /sf-brand-(?:logo|mark) has-image/.test(tag.attrs.class || ''));
    assert.ok(mark, mode); assert.match(html, /--primary:\s*#002b66/);
    if(mode==='b2c')assert.match(html,/\.sf-brand-logo\.has-image\s*\{\s*background: #ffffff/);
    else assert.equal(mark.attrs.style,'background:#ffffff');
    state.logo='';assert.ok(!parseHTML(render(state)).tags.some(tag=>/sf-brand-(?:logo|mark) has-image/.test(tag.attrs.class || '')));
  }
});

test('image URL policy permits supported images and rejects executable schemes', () => {
  for (const input of ['https://example.com/a.png', 'http://example.com/a.jpg', 'assets/tony-robbins-workshop-v1.jpg', 'data:image/png;base64,AAAA']) assert.ok(context.safeImageURL(input), input);
  for (const input of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', '//example.com/a.png', 'file:///tmp/a.png', 'https://u:p@example.com/a.png', 'https://example.com/\na.png', 'assets/../a.png']) assert.equal(context.safeImageURL(input), '', input);
});

test('authored formatting keeps safe bold and span styling while removing executable markup', () => {
  const html = context.raw('<b>Important</b> <span style="color:#066AFE;font-weight:700" onclick="bad()">17%</span><br><em>Growth</em>');
  assert.ok(html.includes('<b>Important</b>') && html.includes('font-weight:700') && html.includes('<em>Growth</em>'));
  assert.ok(!html.includes('onclick'));
  for (const payload of ['<script>alert(1)</script>', '<img src=x onerror=bad()>', '<svg><foreignObject><iframe srcdoc="bad"></iframe></foreignObject></svg>', '<span style="color:red;background:url(javascript:bad());position:fixed" onmouseover="bad()">Hello</span>', '</span></div><b>Safe</b>', '<span title="x>y" onclick="bad()">Text</span>']) {
    const parsed = parseHTML(context.raw(payload));
    assert.ok(parsed.tags.every(tag => ['b', 'strong', 'span', 'br', 'em', 'i', 'u', 's'].includes(tag.tag)));
    assert.ok(parsed.tags.every(tag => Object.keys(tag.attrs).every(key => key === 'style')));
    assert.equal(parsed.scripts.length, 0);
  }
});

test('hostile rich-text, image, color and revision values cannot add executable output', () => {
  for (const mode of ['b2c', 'b2b']) {
    const state = profile(mode);
    state.logo = 'javascript:alert(1)'; state.userAvatar = 'data:text/html,<script>bad()</script>';
    state.colors.primary = '</style><script>bad()</script>'; state.colors.accent = 'red;background:url(javascript:bad())';
    state.activity.items[0].body = '<script>BAD_MARKER</script><img src=x onerror=bad()><b>Retained text</b>';
    state.activity.items[0].icon = '<svg onload=bad()></svg>';
    state._renderRevision = '</script><img src=x onerror=bad()>';
    const html = render(state), parsed = parseHTML(html);
    assert.equal(parsed.scripts.length, mode === 'b2b' ? 2 : 1);
    parsed.scripts.forEach(script => assert.doesNotThrow(() => new vm.Script(script)));
    assert.ok(parsed.tags.every(tag => !Object.keys(tag.attrs).some(key => /^on/i.test(key))));
    assert.ok(parsed.tags.every(tag => !/^(javascript:|data:text\/html)/i.test(tag.attrs.src || '')));
    assert.ok(html.includes('<b>Retained text</b>'));
  }
});

test('rendering does not modify the saved state', () => {
  for (const mode of ['b2c', 'b2b']) {
    const state = profile(mode); state.colors.primary = 'invalid'; state.activity.items[0].body = '<b>Keep</b>';
    const before = JSON.stringify(state); render(state); assert.equal(JSON.stringify(state), before);
  }
});

test('both templates report layout after images and fonts settle without scroll listeners', async () => {
  for (const mode of ['b2c', 'b2b']) {
    const state = profile(mode); state._renderRevision = 'revision-42';
    const script = parseHTML(render(state)).scripts.at(-1);
    const listeners = {}, messages = [];
    const window = { parent: { postMessage: (message, origin) => messages.push({ message, origin }) }, innerHeight: 860, addEventListener: (name, fn) => { listeners[name] = fn; } };
    const document = { documentElement: { scrollHeight: 1100 }, body: { scrollHeight: 1090 }, readyState: 'loading', fonts: { ready: Promise.resolve() } };
    vm.runInNewContext(script, { window, document });
    await Promise.resolve();
    assert.equal(messages.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), { message: { type: 'upg:layout-status', revision: 'revision-42', height: 1100, viewport: 860 }, origin: '*' });
    document.body.scrollHeight = 1250; listeners.load();
    assert.equal(messages.at(-1).message.height, 1250);
    assert.deepEqual(Object.keys(listeners), ['load']);
    document.documentElement.scrollHeight = 860; document.body.scrollHeight = 860; window.upgReportLayout();
    assert.equal(messages.at(-1).message.height, 860);
    window.parent = window; window.upgReportLayout();
    assert.equal(messages.length, 3);
  }
});

test('B2B render selects exactly the persisted account tab with accessible relationships', () => {
  for (const selection of ['overview', 'people', 'sales', 'success', 'related', 'invalid']) {
    const state = profile('b2b'); state.accountViewTab = selection;
    const tags = parseHTML(render(state)).tags;
    const tabs = tags.filter(tag => tag.attrs.role === 'tab');
    const selected = tabs.filter(tag => tag.attrs['aria-selected'] === 'true');
    const expected = selection === 'invalid' ? 'overview' : selection;
    assert.equal(selected.length, 1); assert.equal(selected[0].attrs['data-account-tab'], expected); assert.equal(selected[0].attrs.tabindex, '0');
    assert.equal(tabs.filter(tag => tag.attrs.tabindex === '0').length, 1);
    const active = tags.filter(tag => tag.attrs.role === 'tabpanel' && !Object.hasOwn(tag.attrs, 'hidden'));
    assert.equal(active.length, 1); assert.equal(active[0].attrs.id, `account-${expected}`); assert.equal(active[0].attrs['aria-labelledby'], `tab-${expected}`);
  }
});

test('exported account tabs synchronize clicks and keyboard selection with a revision', () => {
  const state = profile('b2b'); state._renderRevision = 'draft:7:sales';
  const script = parseHTML(render(state)).scripts[0];
  const names = ['overview', 'people', 'sales', 'success', 'related'];
  const tabs = names.map(name => ({ attrs: { 'data-account-tab': name }, handlers: {}, getAttribute(key) { return this.attrs[key]; }, setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(key, fn) { this.handlers[key] = fn; }, focus() { this.focused = true; } }));
  const panels = names.map(name => ({ id: `account-${name}`, classList: { toggle() {} }, hidden: true }));
  const messages = [], window = { parent: { postMessage: (data, origin) => messages.push({ ...data, origin }) } };
  vm.runInNewContext(script, { window, document: { querySelectorAll: selector => selector === '[data-account-tab]' ? tabs : panels } });
  tabs[2].handlers.click();
  assert.deepEqual(messages[0], { type: 'upg:account-tab-change', tab: 'sales', revision: 'draft:7:sales', origin: '*' });
  assert.equal(panels[2].hidden, false); assert.equal(panels[0].hidden, true);
  let prevented = false;
  tabs[2].handlers.keydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.ok(prevented && tabs[3].focused); assert.equal(messages[1].tab, 'success');
  assert.equal(tabs[3].attrs.tabindex, '0'); assert.equal(tabs[2].attrs.tabindex, '-1');
});

test('legacy account renderer uses the same supported output', () => {
  const state = profile('b2b');
  assert.equal(context.generateAccountProfileHTML(state), context.generateTabbedAccountProfileHTML(state));
});

test('fresh standalone build preserves script boundaries and includes every current module', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-render-build-'));
  const output = path.join(temp, 'builder.html');
  try {
    execFileSync('python3', [path.join(root, 'build-standalone.py'), '-o', output], { cwd: root });
    const html = fs.readFileSync(output, 'utf8'), { scripts } = parseHTML(html);
    scripts.forEach(script => assert.doesNotThrow(() => new vm.Script(script)));
    const builder = scripts.find(script => script.includes('function bootstrap()'));
    assert.ok(builder, 'HTML parser must retain the complete builder script');
    for (const name of ['defaults', 'profile-contract', 'images', 'generator', 'brand-logo', 'pagehost', 'localai', 'editor-support', 'app']) assert.ok(builder.includes(`inlined from ./js/${name}.js`), name);
    assert.equal(html, fs.readFileSync(path.join(root, 'Unified_Profile_Generator.html'), 'utf8'), 'Run npm run build when changing editor sources');
    assert.ok(!html.includes('window.__UPG_BUILD__'));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
