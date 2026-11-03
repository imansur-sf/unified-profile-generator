'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const icon = fs.readFileSync(path.join(root, 'assets/saasy-upg-logo.png'));

for (const entry of ['index.html', 'preview-v2/index.html', 'Unified_Profile_Generator.html']) {
  test(`${entry} uses the app header logo as its favicon`, () => {
    const html = fs.readFileSync(path.join(root, entry), 'utf8');
    const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1];
    const links = head.match(/<link\b[^>]*rel="icon"[^>]*>/g) || [];
    assert.equal(links.length, 1);
    assert.match(links[0], /type="image\/png"/);
    const href = links[0].match(/href="([^"]+)"/)[1];
    const favicon = href.startsWith('data:')
      ? Buffer.from(href.split(',')[1], 'base64')
      : fs.readFileSync(path.resolve(path.dirname(path.join(root, entry)), href));
    assert.deepEqual(favicon, icon);
    const headerImage = html.match(/<img src="data:image\/png;base64,([^"]+)"/)[1];
    assert.deepEqual(Buffer.from(headerImage, 'base64'), icon);
    if (entry === 'Unified_Profile_Generator.html') assert.match(href, /^data:image\/png;base64,/);
    assert.equal(icon.readUInt32BE(16), 128);
    assert.equal(icon.readUInt32BE(20), 128);
  });
}
