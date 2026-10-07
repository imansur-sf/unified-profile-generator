const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const { parsePublicOrigin, parseTrustedProxies, requestOrigin } = require('../lib/request-boundary');
const safeFetch = require('../lib/safe-fetch');
const root = path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, 'server.js'));

function loadServer({ env = {}, fetchPublicResource, fetch = async () => { throw Error('External network prohibited'); } } = {}) {
  const context = vm.createContext({
    require(name) {
      if (name === './lib/safe-fetch') return { ...safeFetch, fetchPublicResource: fetchPublicResource || (async () => { throw Error('External network prohibited'); }) };
      return localRequire(name);
    },
    __dirname: root, module: { exports: {} }, process: { env }, console,
    URL, Buffer, Response, TextEncoder, AbortController, setTimeout, clearTimeout, fetch
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context);
  return { app: context.module.exports.app, context };
}
function req({ headers = {}, body = {}, query = {}, protocol = 'https', ip = '93.184.216.34' } = {}) {
  const normalized = { host: 'upg.example', ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])) };
  return { headers: normalized, body, query, protocol, ip, get: key => normalized[key.toLowerCase()] };
}
function res() {
  return { statusCode: 200, headers: {}, body: null,
    status(value) { this.statusCode = value; return this; },
    set(key, value) { if (typeof key === 'object') Object.entries(key).forEach(([name, v]) => this.set(name, v)); else this.headers[key.toLowerCase()] = value; return this; },
    json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; }
  };
}
async function call(app, method, routePath, request) {
  const route = app._router.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]);
  const response = res();
  await route.route.stack[0].handle(request, response);
  return response;
}

test('scrape keeps source body usable as text but blocks active same-origin HTML', async () => {
  const html = '<!doctype html><script>/* inert regression marker */</script><h1>Customer</h1>';
  const { app } = loadServer({ fetchPublicResource: async () => ({ url: 'https://customer.example/about', body: Buffer.from(html), contentType: 'text/html' }) });
  const result = await call(app, 'get', '/api/scrape', req({ query: { url: 'https://customer.example' } }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.toString(), html);
  assert.equal(result.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.match(result.headers['content-security-policy'], /sandbox/);
});

test('scrape surfaces safe-fetch blocked destinations and size errors', async () => {
  for (const [code, status] of [['blocked_host', 403], ['too_large', 413], ['timeout', 502]]) {
    const { app } = loadServer({ fetchPublicResource: async () => { throw new safeFetch.SafeFetchError(code, status); } });
    const result = await call(app, 'get', '/api/scrape', req({ query: { url: 'https://customer.example' } }));
    assert.equal(result.statusCode, status);
    assert.equal(result.body.error, code);
  }
});

test('brand images and generation source use the shared bounded fetcher', async () => {
  const calls = [];
  const { context } = loadServer({ fetchPublicResource: async (url, options) => {
    calls.push({ url, options });
    return { url, body: Buffer.from(url.endsWith('.png') ? 'image' : '<title>Customer</title>'), contentType: url.endsWith('.png') ? 'image/png' : 'text/html' };
  } });
  const image = await context.fetchBrandImage('https://customer.example/logo.png');
  const source = await context.fetchGenerationSource('https://customer.example/');
  assert.equal(image.mime, 'image/png');
  assert.equal(source.title, 'Customer');
  assert.equal(calls[0].options.maxBytes, 512 * 1024);
  assert.equal(calls[0].options.timeoutMs, 12000);
  assert.equal(calls[1].options.maxBytes, 3000000);
  assert.equal(calls[1].options.timeoutMs, 15000);
});

test('guest AI quota ignores client-selected forwarded addresses', async () => {
  let upstreamCalls = 0;
  const { app } = loadServer({ env: { GEMINI_API_KEY: 'offline-test-only' }, fetch: async () => {
    upstreamCalls++;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'mock' }] } }] }), { status: 200 });
  } });
  for (let i = 0; i < 30; i++) {
    const result = await call(app, 'post', '/api/llm', req({ body: { prompt: 'test' }, headers: { 'x-forwarded-for': `198.51.100.${i + 1}` } }));
    assert.equal(result.statusCode, 200);
  }
  const blocked = await call(app, 'post', '/api/llm', req({ body: { prompt: 'test' }, headers: { 'x-forwarded-for': '198.51.100.254' } }));
  assert.equal(blocked.statusCode, 429);
  assert.equal(upstreamCalls, 30);
});

test('origin/proxy configuration rejects ambiguous broad trust', () => {
  assert.equal(parsePublicOrigin('https://upg.example/'), 'https://upg.example');
  for (const invalid of ['https://user:pass@upg.example', 'https://upg.example/path', 'https://upg.example/?query', 'javascript:alert(1)']) assert.throws(() => parsePublicOrigin(invalid));
  assert.equal(parseTrustedProxies(''), false);
  assert.deepEqual(parseTrustedProxies('127.0.0.1, 10.0.0.0/24'), ['127.0.0.1', '10.0.0.0/24']);
  for (const invalid of ['true', '1', '0.0.0.0/0', '::/0', 'not-a-proxy', '10.0.0.1/33']) assert.throws(() => parseTrustedProxies(invalid));
  assert.equal(requestOrigin(req({ protocol: 'http', headers: { 'x-forwarded-proto': 'https' } })), 'http://upg.example');
});

test('configured HTTPS origin drives MCP discovery and origin validation behind HTTP proxy', async () => {
  const { app, context } = loadServer({ env: { PUBLIC_ORIGIN: 'https://public.example' } });
  const request = req({ protocol: 'http', headers: { host: 'internal.example', origin: 'https://public.example', 'x-forwarded-proto': 'http' } });
  const discovery = await call(app, 'get', '/.well-known/mcp.json', request);
  assert.equal(discovery.body.endpoint, 'https://public.example/mcp');
  let allowed = false;
  context.validateMcpOrigin(request, res(), () => { allowed = true; });
  assert.equal(allowed, true);
  const blocked = res();
  context.validateMcpOrigin(req({ headers: { origin: 'https://attacker.example' } }), blocked, () => assert.fail('Origin must remain enforced'));
  assert.equal(blocked.statusCode, 403);
});

test('Express trusts forwarding only from explicitly configured proxies', () => {
  const { app } = loadServer({ env: { TRUST_PROXY: '10.0.0.0/24' } });
  const trust = app.get('trust proxy fn');
  assert.equal(trust('10.0.0.1'), true);
  assert.equal(trust('93.184.216.34'), false);
  const { app: defaultApp } = loadServer();
  assert.equal(defaultApp.get('trust proxy fn')('10.0.0.1'), false);
});

test('malformed host fails discovery cleanly and never creates a generation job', async () => {
  const { app, context } = loadServer({ fetch: async () => new Response(JSON.stringify({ email: 'test@example.com' }), { status: 200 }) });
  const request = req({ headers: { host: 'not/a/host', 'x-api-key': 'offline-test-only' }, body: { url: 'https://customer.example' } });
  assert.equal((await call(app, 'get', '/.well-known/mcp.json', request)).statusCode, 400);
  const result = await context.createGenerationJob(request, request.body);
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'invalid_request_origin');
  assert.equal(vm.runInContext('generationJobs.size', context), 0);
});

test('server generation validates AI content before rendering a starter profile', () => {
  const { context } = loadServer();
  assert.throws(() => context.buildGeneratedProfile({}, { profileType: 'b2c' }, 'https://upg.example'), error => error.code === 'invalid_ai_response');
});
