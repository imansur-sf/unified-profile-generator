const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = require('sharp');
const { parsePublicOrigin, parseTrustedProxies, requestOrigin } = require('../lib/request-boundary');
const safeFetch = require('../lib/safe-fetch');
const root = path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, 'server.js'));

function loadServer({ env = {}, fetchPublicResource, worker, profileRuntime, fetch = async () => { throw Error('External network prohibited'); } } = {}) {
  const context = vm.createContext({
    require(name) {
      if (name === './lib/safe-fetch') return { ...safeFetch, fetchPublicResource: fetchPublicResource || (async () => { throw Error('External network prohibited'); }) };
      if (name === './lib/generation-worker' && worker) return { createGenerationWorker: () => worker };
      if (name === './lib/profile-runtime' && profileRuntime) return { ...localRequire(name), ...profileRuntime };
      return localRequire(name);
    },
    __dirname: root, module: { exports: {} }, process: { env }, console,
    URL, Buffer, Response, TextEncoder, AbortController, setTimeout, clearTimeout, fetch
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context);
  return { app: context.module.exports.app, context };
}
function req({ headers = {}, body = {}, query = {}, params = {}, protocol = 'https', ip = '93.184.216.34' } = {}) {
  const normalized = { host: 'upg.example', ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])) };
  return { headers: normalized, body, query, params, protocol, ip, get: key => normalized[key.toLowerCase()] };
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
  assert.equal(result.headers['x-scraper-url'], 'https://customer.example/about');
  const corsLayer = app._router.stack.find(layer => !layer.route && layer.regexp.toString().includes('api'));
  const corsResponse = res();
  corsLayer.handle({ method: 'GET' }, corsResponse, () => {});
  assert.match(corsResponse.headers['access-control-expose-headers'], /X-Scraper-URL/);
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
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ee000080' } }).png().toBuffer();
  const { context } = loadServer({ fetchPublicResource: async (url, options) => {
    calls.push({ url, options });
    return { url, body: url.endsWith('.png') ? png : Buffer.from('<title>Customer</title>'), contentType: url.endsWith('.png') ? 'image/png' : 'text/html' };
  } });
  const image = await context.fetchBrandImage('https://customer.example/logo.png');
  const source = await context.fetchGenerationSource('https://customer.example/');
  assert.equal(image.mime, 'image/png');
  assert.equal(source.title, 'Customer');
  assert.equal(calls[0].options.maxBytes, 512 * 1024);
  assert.equal(calls[0].options.timeoutMs, 12000);
  assert.equal(calls[0].options.maxRedirects, 3);
  assert.equal(calls[1].options.maxBytes, 3000000);
  assert.equal(calls[1].options.timeoutMs, 15000);
  assert.equal(calls[1].options.maxRedirects, 8);
});

test('GET logo normalizes SVG bytes to inert PNG and rejects spoofed MIME content', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path fill="red" d="M0 0h5v5H0z"/></svg>';
  const { app } = loadServer({ fetchPublicResource: async () => ({ url: 'https://customer.example/icon.svg', body: Buffer.from(svg), contentType: 'image/svg+xml' }) });
  const result = await call(app, 'get', '/api/brand-image', req({ query: { url: 'https://customer.example/icon.svg' } }));
  assert.equal(result.statusCode, 200);
  assert.match(result.body.imageData, /^data:image\/png;base64,/);
  assert.equal((await sharp(Buffer.from(result.body.imageData.split(',')[1], 'base64')).metadata()).width, 10);
  const spoofed = loadServer({ fetchPublicResource: async () => ({ url: 'https://customer.example/logo.png', body: Buffer.from('<html>no image</html>'), contentType: 'image/png' }) });
  assert.equal((await call(spoofed.app, 'get', '/api/brand-image', req({ query: { url: 'https://customer.example/logo.png' } }))).statusCode, 422);
});

test('legacy embedded SVG repair is POST-only, bounded, validated, and never fetches URLs', async () => {
  let calls = 0;
  const { app } = loadServer({ fetchPublicResource: async () => { calls++; throw Error('unexpected fetch'); } });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="4"/></svg>';
  const input = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const result = await call(app, 'post', '/api/brand-image', req({ body: { imageData: input } }));
  assert.equal(result.statusCode, 200);
  assert.match(result.body.imageData, /^data:image\/png;base64,/);
  assert.equal(result.headers['cache-control'], 'no-store');
  for (const imageData of ['https://customer.example/logo.svg', 'data:image/png;base64,abc']) assert.equal((await call(app, 'post', '/api/brand-image', req({ body: { imageData } }))).statusCode, 400);
  assert.equal((await call(app, 'post', '/api/brand-image', req({ body: { imageData: 'data:image/png;base64,' + 'A'.repeat(800000) } }))).statusCode, 413);
  const unsafe = `data:image/svg+xml;base64,${Buffer.from(svg.replace('<circle', '<script>alert(1)</script><circle')).toString('base64')}`;
  assert.equal((await call(app, 'post', '/api/brand-image', req({ body: { imageData: unsafe } }))).statusCode, 422);
  assert.equal(calls, 0);
});

test('generation source finds explicit logos and resolves against final redirected page URL', async () => {
  const { context, app } = loadServer({ fetchPublicResource: async (url, options) => {
    assert.equal(options.maxRedirects, 8);
    return { url: 'https://www.customer.example/site/', contentType: 'text/html', body: Buffer.from('<header><img class="logo" src="images/logo.svg"></header><link rel="icon" href="/favicon.ico">') };
  } });
  const source = await context.fetchGenerationSource('https://customer.example');
  assert.equal(source.logoCandidates[0], 'https://www.customer.example/site/images/logo.svg');
  assert.equal(source.favicon, source.logoCandidates[0]);
  assert.equal((await call(app, 'get', '/api/scrape', req({ query: { url: 'https://customer.example' } }))).headers['x-scraper-url'], 'https://www.customer.example/site/');
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
  assert.equal(vm.runInContext('generationWorker.activeCount', context), 0);
});

test('server generation validates AI content before rendering a starter profile', () => {
  const { context } = loadServer();
  assert.throws(() => context.buildGeneratedProfile({}, { profileType: 'b2c' }, 'https://upg.example'), error => error.code === 'invalid_ai_response');
});

test('generation create uses durable idempotency; replay and GET never launch paid work', async () => {
  const id = 'gen_' + 'a'.repeat(32);
  let launches = 0;
  let posts = 0;
  let savedInput;
  const job = { id, status: 'queued', phase: 'queued', input: {} };
  const { context } = loadServer({ env: { GEMINI_API_KEY: 'offline-only' }, worker: { start: async () => { launches++; return { status: 202, body: { job } }; } }, fetch: async (url, options) => {
    assert.match(url, /\/integrations\/v1\/upg\/jobs/);
    assert.equal(options.headers['X-API-Key'], 'owner-key');
    if (options.method === 'POST') {
      assert.equal(options.headers['Idempotency-Key'], 'stable-request-key-123');
      savedInput = JSON.parse(options.body).input;
      return new Response(JSON.stringify({ job: { ...job, input: savedInput }, created: posts++ === 0 }), { status: posts === 1 ? 202 : 200 });
    }
    return new Response(JSON.stringify({ job: { ...job, status: 'interrupted', resumable: true } }));
  } });
  const request = req({ headers: { 'x-api-key': 'owner-key', 'idempotency-key': 'stable-request-key-123' }, body: { url: 'https://customer.example', profileType: 'b2b', views: [{ persona: 'sales', brief: 'commercial' }, { persona: 'service', brief: 'support' }] } });
  assert.equal((await context.createGenerationJob(request, request.body)).status, 202);
  assert.equal((await context.createGenerationJob(request, request.body)).status, 200);
  assert.equal((await context.getGeneration(request, id)).body.job.status, 'interrupted');
  assert.equal(launches, 1);
  assert.equal(savedInput.views[1].brief, 'support');
  assert.equal(savedInput.includeImages, true);
  assert.doesNotMatch(JSON.stringify(savedInput), /owner-key/);
});

test('REST and MCP explicit resume share worker; completed resume returns same job', async () => {
  const id = 'gen_' + 'b'.repeat(32);
  const calls = [];
  const job = { id, input: {}, status: 'completed', projectId: '42' };
  const { context, app } = loadServer({ env: { GEMINI_API_KEY: 'offline-only' }, fetch: async () => new Response(JSON.stringify({ job: { ...job, status: 'interrupted' } })), worker: { start: async (...args) => { calls.push(args); return { status: 409, body: { error: 'job_completed', job } }; } } });
  const request = req({ headers: { 'x-api-key': 'owner-key' }, params: { id } });
  const rest = await call(app, 'post', '/integrations/v1/upg/generations/:id/resume', request);
  assert.equal(rest.statusCode, 200);
  assert.equal(rest.body.job.profile.id, '42');
  const mcp = await context.callMcpTool(request, 'upg_resume_generation', { jobId: id });
  assert.equal(mcp.isError, undefined);
  assert.equal(JSON.parse(mcp.content[0].text).job.projectId, '42');
  assert.equal(calls.length, 2);
});

test('invalid views/idempotency fail before any storage or provider work', async () => {
  const { context } = loadServer({ env: { GEMINI_API_KEY: 'offline-only' }, fetch: async () => assert.fail('invalid input reached storage') });
  for (const body of [
    { views: [] }, { views: [{ persona: 'sales' }, { persona: 'sales' }] }, { persona: 'unknown' },
    { persona: 'custom' }, { includeImages: 'yes' }, { profileType: 'invalid' }, { idempotencyKey: 'too-short' }
  ]) {
    const request = req({ body: { url: 'https://customer.example', ...body } });
    assert.equal((await context.createGenerationJob(request, request.body)).status, 400);
  }
});

test('fenced storage retries identical checkpoint body after lost response, not provider work', async () => {
  const calls = [];
  const { context } = loadServer({ fetch: async (url, options) => {
    calls.push({ url, body: options.body });
    if (calls.length === 1) throw Error('response lost after database committed');
    return new Response(JSON.stringify({ version: '4' }));
  } });
  const result = await context.requestGenerationStore('test-key', 'gen_test/checkpoint', { method: 'PUT', body: { leaseId: 'worker-id', expectedVersion: '3', checkpoint: { phase: 'ready' }, phase: 'ready' } });
  assert.equal(result.version, '4');
  assert.deepEqual(calls[0], calls[1]);
});

test('REST export renders authorized saved state, preserves persona and forces inert attachment boundary', async () => {
  let rendered;
  const { app } = loadServer({ profileRuntime: { renderSavedProfile: (payload, options) => { rendered = { payload, options }; return { html: '<!doctype html><p>Saved image view</p>', persona: options.persona }; } }, fetch: async (url, options) => {
    assert.match(url, /\/profiles\/42\/export-state$/);
    assert.equal(options.headers['X-API-Key'], 'export-only-key');
    return new Response(JSON.stringify({ profile: { id: '42' }, payload: { inlineImage: 'data:image/png;base64,aW1hZ2U=' } }));
  } });
  const result = await call(app, 'get', '/integrations/v1/upg/profiles/:id/export', req({ params: { id: '42' }, query: { persona: 'service' }, headers: { 'x-api-key': 'export-only-key' } }));
  assert.equal(result.statusCode, 200);
  assert.equal(rendered.options.persona, 'service');
  assert.match(rendered.payload.inlineImage, /^data:/);
  assert.match(result.headers['content-disposition'], /^attachment;/);
  assert.match(result.headers['content-security-policy'], /sandbox allow-scripts/);
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
});

test('large MCP image export returns scoped path and never embeds caller key in URL', async () => {
  const { context } = loadServer({ profileRuntime: { renderSavedProfile: () => ({ html: 'x'.repeat(200001), persona: 'marketing' }) }, fetch: async () => new Response(JSON.stringify({ profile: { id: '42' }, payload: {} })) });
  const result = await context.callMcpTool(req({ headers: { 'x-api-key': 'private-api-key' } }), 'upg_get_profile_export', { profileId: '42', persona: 'marketing', includeHtml: true });
  const output = JSON.parse(result.content[0].text);
  assert.match(output.exportPath, /persona=marketing$/);
  assert.equal(output.html, undefined);
  assert.match(output.htmlOmitted, /limit/);
  assert.doesNotMatch(JSON.stringify(output), /private-api-key/);
});

test('production without canonical origin blocks only integrations and exposes a non-secret health diagnostic', async () => {
  const { context, app } = loadServer({ env: { NODE_ENV: 'production', GEMINI_API_KEY: 'never-emit-this' } });
  const blocked = res();
  context.requireConfiguredPublicOrigin(req(), blocked, () => assert.fail('integration must be configured'));
  assert.equal(blocked.statusCode, 503);
  assert.equal(blocked.body.error, 'public_origin_required');
  const health = await call(app, 'get', '/api/health', req());
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.integrations_configured, false);
  assert.equal(health.body.llm_configured, true);
  assert.doesNotMatch(JSON.stringify(health.body), /never-emit-this/);
  const configured = loadServer({ env: { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://upg.example' } });
  let allowed = false;
  configured.context.requireConfiguredPublicOrigin(req(), res(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test('resume authenticates ownership before local busy/capacity state can be observed', async () => {
  const id = 'gen_' + 'c'.repeat(32);
  const { context } = loadServer({ env: { GEMINI_API_KEY: 'offline-only' }, worker: { start: async () => assert.fail('foreign or invalid key reached local worker state') }, fetch: async (url, options) => {
    assert.match(url, new RegExp('/jobs/' + id + '$'));
    const status = options.headers['X-API-Key'] === 'foreign-owner-key' ? 404 : 401;
    return new Response(JSON.stringify({ error: status === 404 ? 'generation_not_found' : 'invalid_api_key' }), { status });
  } });
  const foreign = await context.resumeGeneration(req({ headers: { 'x-api-key': 'foreign-owner-key' } }), id);
  assert.equal(foreign.status, 404);
  assert.equal(foreign.body.error, 'generation_not_found');
  const invalid = await context.resumeGeneration(req({ headers: { 'x-api-key': 'invalid-key' } }), id);
  assert.equal(invalid.status, 401);
});
