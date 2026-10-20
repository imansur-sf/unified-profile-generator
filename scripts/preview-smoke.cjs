// Run in a Heroku one-off dyno for the deployed release:
//   node scripts/preview-smoke.cjs [--ai]
// This is an HTTP/backend smoke check, not browser or SSO/OTP verification.
// --ai explicitly opts into one small text call and one generated image.
// No credentials, generated content, or image bytes are printed or saved.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { app } = require('../server');
const baseline = require('../test/fixtures/preview-production-baseline.json');
const root = path.resolve(__dirname, '..');

async function main() {
  for (const [file, hash] of Object.entries(baseline)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), hash, `Production baseline changed: ${file}`);
  }
  console.log('PASS production baseline hashes');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const request = (pathname, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: server.address().port, path: pathname,
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(75000, () => req.destroy(new Error('Smoke request timed out')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
  try {
    const original = await request('/');
    assert.equal(original.status, 200);
    assert.equal(original.body, fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
    const redirect = await request('/preview-v2?projectId=smoke');
    assert.equal(redirect.headers.location, '/preview-v2/?projectId=smoke');
    const preview = await request('/preview-v2/');
    assert.equal(preview.status, 200);
    assert.equal(preview.headers['x-upg-editor'], 'preview-v2');
    assert.equal(preview.body, fs.readFileSync(path.join(root, 'preview-v2/index.html'), 'utf8'));
    const modulePaths = [...preview.body.matchAll(/['"](js\/[\w-]+\.js)['"]/g)].map(match => match[1]);
    assert.ok(modulePaths.length >= 10, 'Preview module loader incomplete');
    for (const module of new Set(modulePaths)) {
      const result = await request(`/preview-v2/${module}`);
      assert.equal(result.status, 200, module);
      assert.match(result.headers['content-type'], /javascript/);
    }
    assert.equal((await request('/preview-v2/js/missing.js')).status, 404);
    assert.equal((await request('/preview-v2/studio.css')).status, 200);
    assert.equal((await request('/preview-v2/assets/tony-robbins-workshop-v1.jpg')).status, 200);
    console.log('PASS production and preview HTTP routes, modules, stylesheet, starter assets');
    const health = await request('/api/health');
    assert.equal(health.status, 200);
    const info = JSON.parse(health.body);
    console.log(`PASS backend health; AI configured: ${Boolean(info.llm_configured)}`);
    const auth = await request('/saasy-auth.js?v=magic-v1');
    assert.equal(auth.status, 200, 'Shared sign-in script unreachable');
    assert.match(auth.headers['content-type'], /javascript/);
    assert.ok(auth.body.includes('SaasyAuth'), 'Unexpected sign-in response');
    console.log('PASS shared sign-in script reachable (interactive sign-in not tested)');
    if (process.argv.includes('--ai')) {
      assert.equal(info.llm_configured, true, 'AI backend is not configured');
      const text = await request('/api/llm', {
        tier: 'balanced', maxTokens: 300,
        prompt: 'For an application connectivity test, return only a JSON object with the key "status" and value "ok".'
      });
      const textResult = JSON.parse(text.body);
      assert.equal(text.status, 200, `Text generation failed: ${textResult.error || text.status}`);
      assert.ok(typeof textResult.text === 'string' && textResult.text.trim().length > 0);
      console.log(`PASS real text generation (${textResult.model_used})`);
      const image = await request('/api/generate-images', { prompts: [{
        slot: 'preview_smoke',
        prompt: 'A realistic small editorial photograph of a recruiting advisor at a desk with a laptop and a blank notebook, bright professional office, no text, no logos, landscape composition.'
      }] });
      assert.equal(image.status, 200, 'Image endpoint failed');
      const imageResult = JSON.parse(image.body).results?.[0];
      assert.ok(imageResult?.imageData?.startsWith('data:image/'), `Image generation failed: ${imageResult?.error || 'missing image'}`);
      console.log('PASS real recommendation image generation (image discarded)');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
