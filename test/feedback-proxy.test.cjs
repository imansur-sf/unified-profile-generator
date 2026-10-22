const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createFeedbackProxy } = require('../lib/feedback-proxy');

async function fixture(t, fetchImpl) {
  const app = express();
  app.use('/feedback', express.json({ limit: '5mb' }));
  app.use('/feedback', createFeedbackProxy({ upstream: 'https://accounts.test', fetchImpl }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? 'payload_too_large' : 'invalid_request' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return 'http://127.0.0.1:' + server.address().port;
}

test('feedback proxy pins every inbox operation to UPG and forwards only explicit authentication', async t => {
  const calls = [];
  const base = await fixture(t, async (url, request) => { calls.push({ url, request }); return Response.json({ ok: true }); });
  const id = '1e526da8-d309-4c26-b88b-544b30b647d2';
  for (const [path, method, body] of [
    ['/feedback/session', 'GET'], ['/feedback/inbox?category=bug&page=2', 'GET'],
    ['/feedback/inbox/' + id, 'GET'], ['/feedback/inbox/' + id, 'PUT', { status: 'reviewing' }],
    ['/feedback/inbox/' + id + '/attachments/' + id, 'GET'], ['/feedback/inbox/' + id, 'DELETE']
  ]) {
    const result = await fetch(base + path, { method, headers: { Authorization: 'Bearer verified-by-accounts', Cookie: 'private-cookie', 'X-API-Key': 'private-provider-key', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(result.status, 200);
    const call = calls.at(-1);
    assert.equal(new URL(call.url).searchParams.get('tool'), 'upg');
    assert.equal(call.request.headers.authorization, 'Bearer verified-by-accounts');
    assert.equal(call.request.headers.cookie, undefined);
    assert.equal(call.request.headers['x-api-key'], undefined);
    assert.match(result.headers.get('cache-control'), /private, no-store/);
  }
});

test('guest submissions retain the retry key and support the screenshot payload allowance', async t => {
  let sent;
  const base = await fixture(t, async (url, request) => { sent = { url, request }; return Response.json({ id: 'stored' }, { status: 201 }); });
  const result = await fetch(base + '/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'same-request-key-123' }, body: JSON.stringify({ name: 'Guest', email: 'guest@example.test', description: 'A'.repeat(1100000) }) });
  assert.equal(result.status, 201);
  assert.equal(JSON.parse(sent.request.body).tool, 'upg');
  assert.equal(sent.request.headers['idempotency-key'], 'same-request-key-123');
  assert.equal(sent.request.headers.authorization, undefined);
  assert.equal(new URL(sent.url).searchParams.get('tool'), 'upg');
  assert.equal((await result.json()).id, 'stored');
});

test('UPG refuses cross-tool parameters and paths before contacting accounts', async t => {
  const base = await fixture(t, () => { assert.fail('Invalid tool selection must not reach accounts'); });
  for (const query of ['tool=lpg', 'tool=icp', 'tool=', 'tool=upg&tool=lpg']) assert.equal((await fetch(base + '/feedback/inbox?' + query)).status, 400);
  assert.equal((await fetch(base + '/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'lpg' }) })).status, 400);
  assert.equal((await fetch(base + '/feedback/not-an-endpoint')).status, 404);
});

test('private attachment response headers survive the proxy; connection errors do not report success', async t => {
  const image = Buffer.from('image bytes');
  const base = await fixture(t, async url => {
    if (url.includes('/attachments/')) return new Response(image, { headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="screenshot.png"', 'X-Content-Type-Options': 'nosniff' } });
    if (url.includes('/session')) return new Response(null, { status: 302, headers: { location: 'https://sso.test' } });
    throw Error('connection failed');
  });
  const id = '1e526da8-d309-4c26-b88b-544b30b647d2';
  const result = await fetch(base + `/feedback/inbox/${id}/attachments/${id}`);
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.match(result.headers.get('content-disposition'), /inline/);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), image);
  for (const path of ['/feedback/session', '/feedback/inbox']) {
    const unavailable = await fetch(base + path);
    assert.equal(unavailable.status, 502);
    assert.equal((await unavailable.json()).error, 'feedback_service_unavailable');
  }
});
