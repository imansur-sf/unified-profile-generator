const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { app } = require('../server');
const root = path.resolve(__dirname, '..');
const baseline = require('./fixtures/preview-production-baseline.json');

test('the preview trial leaves the production frontend and generation runtime byte-for-byte unchanged', () => {
  for (const [file, expected] of Object.entries(baseline)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    assert.equal(actual, expected, `${file}: production changes require explicit promotion approval`);
  }
});

// HTTP routing checks only: no browser, external API, credentials or AI calls.
test('preview routes are canonical, isolated and do not swallow missing modules', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const get = pathname => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  const redirect = await get('/preview-v2?projectId=sample');
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.location, '/preview-v2/?projectId=sample');
  const preview = await get('/preview-v2/');
  assert.equal(preview.status, 200);
  assert.equal(preview.headers['x-upg-editor'], 'preview-v2');
  assert.equal(preview.headers['cache-control'], 'no-store');
  assert.equal(preview.body.toString(), fs.readFileSync(path.join(root, 'preview-v2/index.html'), 'utf8'));
  const original = await get('/');
  assert.equal(original.status, 200);
  assert.equal(original.body.toString(), fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  const module = await get('/preview-v2/js/app.js');
  assert.equal(module.status, 200);
  assert.match(module.headers['content-type'], /javascript/);
  assert.equal(module.body.toString(), fs.readFileSync(path.join(root, 'preview-v2/js/app.js'), 'utf8'));
  for (const pathname of ['/preview-v2/js/missing.js', '/preview-v2/not-a-page', '/preview-v2/assets/missing.jpg']) {
    const missing = await get(pathname);
    assert.equal(missing.status, 404);
    assert.doesNotMatch(missing.headers['content-type'], /html/);
  }
  const image = await get('/preview-v2/assets/tony-robbins-workshop-v1.jpg');
  assert.equal(image.status, 200);
  assert.match(image.headers['content-type'], /image\/jpeg/);
  assert.ok(image.body.equals(fs.readFileSync(path.join(root, 'assets/tony-robbins-workshop-v1.jpg'))));
  const health = await get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body.toString()).service, 'unified-profile-generator');
});
