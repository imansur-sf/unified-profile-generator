'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createProfileCapture } = require('../lib/profile-capture');

test('oversized HTML is rejected before launching a browser',async()=>{
  let calls=0;
  const renderer=createProfileCapture({launchBrowser:async()=>{calls++;throw Error('must not launch');}});
  await assert.rejects(renderer.capture('a'.repeat(24*1024*1024+1)),error=>error.code==='capture_html_too_large'&&error.status===413);
  assert.equal(calls,0);
});

function png(width = 1920, height = 1080) {
  const data = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.writeUInt32BE(13, 8); data.write('IHDR', 12); data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20);
  return data;
}
function fixture(options = {}) {
  const calls = { browserClosed: 0, contextClosed: 0 };
  const page = {
    async setContent(html, settings) { calls.html = html; calls.content = settings; if (options.content) await options.content(); },
    async evaluate(fn) {
      if (options.document) return vm.runInNewContext(`(${fn.toString()})()`, { document: options.document, requestAnimationFrame: next => next() });
      return options.assetsReady !== false;
    },
    async screenshot(settings) { calls.screenshot = settings; if (options.screenshot) return options.screenshot(); return options.png || png(); }
  };
  const context = {
    async route(pattern, handler) { calls.routePattern = pattern; calls.route = handler; },
    async newPage() { return page; },
    async close() { calls.contextClosed++; }
  };
  const browser = {
    async newContext(settings) { calls.contextOptions = settings; return context; },
    async close() { calls.browserClosed++; }
  };
  const launchBrowser = async settings => { calls.launchOptions = settings; return browser; };
  return { calls, browser, context, launchBrowser };
}
const fails = (promise, code, status) => assert.rejects(promise, error => error.code === code && error.status === status);
const tick = () => new Promise(resolve => setImmediate(resolve));

test('capture is opt-in and validates limits and input', async () => {
  const disabled = createProfileCapture({ executablePath: '/not/a/browser' });
  assert.equal(disabled.available, false);
  await fails(disabled.capture('<html>'), 'capture_not_configured', 503);
  assert.throws(() => createProfileCapture({ maxActive: 0 }), TypeError);
  const f = fixture();
  await fails(createProfileCapture(f).capture(null), 'invalid_capture_html', 400);
});

test('capture uses an isolated fixed widescreen viewport, sandbox and credential-free child environment', async () => {
  const f = fixture(), capture = createProfileCapture(f);
  const result = await capture.capture('<html>trusted export</html>');
  assert.equal(result.width, 1920); assert.equal(result.height, 1080); assert.deepEqual(result.png, png());
  assert.equal(f.calls.contextClosed, 1); assert.equal(f.calls.browserClosed, 1);
  assert.deepEqual(f.calls.contextOptions, { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, javaScriptEnabled: true, serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce', colorScheme: 'light' });
  assert.equal(f.calls.launchOptions.chromiumSandbox, true);
  assert.equal(f.calls.launchOptions.headless, true);
  assert.equal(f.calls.launchOptions.args, undefined);
  assert.ok(Object.keys(f.calls.launchOptions.env).every(key => ['PATH', 'LANG', 'LC_ALL', 'TZ', 'FONTCONFIG_PATH', 'FONTCONFIG_FILE'].includes(key)));
  assert.equal(f.calls.screenshot.fullPage, false);
  assert.equal(f.calls.screenshot.scale, 'device');
  assert.equal(f.calls.screenshot.animations, 'disabled');
  assert.match(f.calls.html, /trusted export<\/html>$/);
});

test('capture places restrictive CSP before document content and strips generated scripts', async () => {
  for (const html of [
    '<!doctype html><html><head><script>window.secret = 1</script><style>body{color:black}</style></head><body>Profile<script src="https://example.com/run.js"></script></body></html>',
    '<html><body>Profile<SCRIPT type="text/javascript">window.secret=1</SCRIPT></body></html>',
    '<div>Profile</div><script>window.secret=1</script>'
  ]) {
    const f = fixture(); await createProfileCapture(f).capture(html);
    const output = f.calls.html;
    assert.match(output, /<head><meta http-equiv="Content-Security-Policy"/);
    assert.match(output, /default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'/);
    assert.ok(output.indexOf('Content-Security-Policy') < output.indexOf('<body>'));
    assert.doesNotMatch(output, /<script\b|window.secret|run.js/i);
    assert.match(output, /Profile/);
  }
});

test('capture denies all non-data network requests', async () => {
  const f = fixture(); await createProfileCapture(f).capture('<html>');
  for (const url of ['https://example.com/a.png', 'http://127.0.0.1/private', 'file:///etc/passwd', 'blob:private']) {
    let aborted = false;
    await f.calls.route({ request: () => ({ url: () => url }), abort: () => { aborted = true; }, continue: () => assert.fail('network allowed') });
    assert.ok(aborted);
  }
  let continued = false;
  await f.calls.route({ request: () => ({ url: () => 'data:image/png;base64,AAAA' }), continue: () => { continued = true; }, abort: () => assert.fail('data blocked') });
  assert.ok(continued);
});

test('missing image assets fail explicitly and close resources', async () => {
  const f = fixture({ assetsReady: false });
  await fails(createProfileCapture(f).capture('<html>'), 'capture_assets_missing', 422);
  assert.equal(f.calls.contextClosed, 1); assert.equal(f.calls.browserClosed, 1);
  assert.equal(f.calls.screenshot, undefined);
});

test('readiness waits for fonts and image decoding before capture', async () => {
  let fontReady = false, decoded = false;
  const f = fixture({ document: { fonts: { ready: Promise.resolve().then(() => { fontReady = true; }) }, images: [{ complete: true, naturalWidth: 42, decode: async () => { assert.ok(fontReady); decoded = true; } }] } });
  await createProfileCapture(f).capture('<html>');
  assert.ok(decoded); assert.ok(f.calls.screenshot);
});

test('readiness rejects broken images and image decoding failures', async () => {
  for (const image of [{ complete: true, naturalWidth: 0 }, { complete: true, naturalWidth: 10, decode: async () => { throw new Error('decode failed'); } }]) {
    const f = fixture({ document: { images: [image] } });
    await fails(createProfileCapture(f).capture('<html>'), 'capture_assets_missing', 422);
    assert.equal(f.calls.screenshot, undefined);
  }
});

test('hard deadline covers pending fonts and PNG creation', async () => {
  for (const options of [{ document: { fonts: { ready: new Promise(() => {}) }, images: [] } }, { screenshot: () => new Promise(() => {}) }]) {
    const f = fixture(options);
    await fails(createProfileCapture({ ...f, timeoutMs: 15 }).capture('<html>'), 'capture_timeout', 504);
    assert.equal(f.calls.browserClosed, 1); assert.equal(f.calls.contextClosed, 1);
  }
});

test('invalid, wrongly sized and oversized PNG output is rejected', async () => {
  for (const data of [Buffer.from('not png'), png(1600, 900), Buffer.alloc(8 * 1024 * 1024 + 1)]) {
    const f = fixture({ png: data });
    await fails(createProfileCapture(f).capture('<html>'), 'capture_invalid_png', 502);
    assert.equal(f.calls.browserClosed, 1);
  }
});

test('capacity is reserved synchronously and released after completion', async () => {
  let finish;
  const f = fixture({ content: () => new Promise(resolve => { finish = resolve; }) });
  const renderer = createProfileCapture(f), pending = renderer.capture('<html>');
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  await tick(); finish(); await pending;
  const again = renderer.capture('<html>'); await tick(); finish(); await again;
});

test('hard deadline covers content, closes resources and frees capacity', async () => {
  const f = fixture({ content: () => new Promise(() => {}) });
  const renderer = createProfileCapture({ ...f, timeoutMs: 15 });
  await fails(renderer.capture('<html>'), 'capture_timeout', 504);
  assert.equal(f.calls.contextClosed, 1); assert.equal(f.calls.browserClosed, 1);
  await fails(renderer.capture('<html>'), 'capture_timeout', 504);
});

test('late browser launch is closed after hard deadline without starting a context', async () => {
  const f = fixture(); let finishLaunch;
  const renderer = createProfileCapture({ launchBrowser: () => new Promise(resolve => { finishLaunch = resolve; }), timeoutMs: 15 });
  await fails(renderer.capture('<html>'), 'capture_timeout', 504);
  finishLaunch(f.browser); await tick();
  assert.equal(f.calls.browserClosed, 1); assert.equal(f.calls.contextOptions, undefined);
});

test('late context is closed after hard deadline', async () => {
  const f = fixture(); let finishContext;
  f.browser.newContext = () => new Promise(resolve => { finishContext = resolve; });
  const renderer = createProfileCapture({ ...f, timeoutMs: 15 });
  await fails(renderer.capture('<html>'), 'capture_timeout', 504);
  finishContext(f.context); await tick();
  assert.equal(f.calls.browserClosed, 1); assert.equal(f.calls.contextClosed, 1);
});

test('browser failures do not expose underlying details and still close resources', async () => {
  const f = fixture({ content: () => { throw new Error('sensitive local path'); } });
  await fails(createProfileCapture(f).capture('<html>'), 'capture_failed', 502);
  assert.equal(f.calls.browserClosed, 1); assert.equal(f.calls.contextClosed, 1);
});

test('capacity remains reserved until slow browser cleanup confirms termination', async () => {
  const f = fixture(); let finishClose;
  f.browser.close = () => { f.calls.browserClosed++; return new Promise(resolve => { finishClose = resolve; }); };
  const renderer = createProfileCapture({ ...f, timeoutMs: 30 });
  const pending = renderer.capture('<html>');
  await tick();
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  await fails(pending, 'capture_timeout', 504);
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  finishClose(); await tick();
  f.browser.close = async () => { f.calls.browserClosed++; };
  await renderer.capture('<html>');
});

test('timeout with late launch cannot launch again until the late browser closes', async () => {
  const f = fixture(); let finishLaunch, finishClose, launches = 0;
  f.browser.close = () => new Promise(resolve => { finishClose = resolve; });
  const renderer = createProfileCapture({ launchBrowser: () => { launches++; return new Promise(resolve => { finishLaunch = resolve; }); }, timeoutMs: 15 });
  await fails(renderer.capture('<html>'), 'capture_timeout', 504);
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  finishLaunch(f.browser); await tick();
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  assert.equal(launches, 1);
  finishClose(); await tick();
});

test('cleanup failure fails closed and never launches another browser', async () => {
  const f = fixture(); let launches = 0;
  f.browser.close = async () => { throw new Error('cannot terminate'); };
  const renderer = createProfileCapture({ launchBrowser: async options => { launches++; return f.launchBrowser(options); } });
  await fails(renderer.capture('<html>'), 'capture_cleanup_failed', 503);
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  assert.equal(launches, 1);
});

test('late context creation retains capacity until that context is also closed', async () => {
  const f = fixture(); let finishContext, finishClose;
  f.browser.newContext = () => new Promise(resolve => { finishContext = resolve; });
  f.context.close = () => new Promise(resolve => { finishClose = resolve; });
  const renderer = createProfileCapture({ ...f, timeoutMs: 15 });
  await fails(renderer.capture('<html>'), 'capture_timeout', 504);
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  finishContext(f.context); await tick();
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
  finishClose(); await tick();
  f.browser.newContext = async () => f.context;
  f.context.close = async () => {};
  await renderer.capture('<html>');
});

test('a hung context close does not prevent browser close but retains capacity', async () => {
  const f = fixture();
  f.context.close = () => new Promise(() => {});
  const renderer = createProfileCapture({ ...f, timeoutMs: 15 });
  await fails(renderer.capture('<html>'), 'capture_timeout', 504);
  assert.equal(f.calls.browserClosed, 1);
  await fails(renderer.capture('<html>'), 'capture_busy', 429);
});
