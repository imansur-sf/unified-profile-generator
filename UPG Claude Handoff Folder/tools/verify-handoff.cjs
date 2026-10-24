'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 or newer required.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE-MANIFEST.json')));
const packageManifestPath = path.join(root,'PACKAGE-MANIFEST.json');
if (fs.existsSync(packageManifestPath)) {
  for (const item of JSON.parse(fs.readFileSync(packageManifestPath)).files) {
    const target = path.resolve(root,item.path);
    if (!target.startsWith(root+path.sep)) throw Error('Unsafe package path');
    const bytes = fs.readFileSync(target);
    if (bytes.length !== item.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('Package mismatch: '+item.path);
  }
}
for (const item of manifest.files) {
  const target = path.resolve(root, item.destination);
  if (!target.startsWith(root + path.sep)) throw Error('Unsafe manifest path');
  const bytes = fs.readFileSync(target);
  if (bytes.length !== item.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('Source mismatch: ' + item.destination);
}
const runtime = require('../source/upg-core/lib/profile-runtime').getRuntime();
for (const name of ['getSystemPrompt', 'buildUserPrompt', 'buildPersonaOverlayPrompt', 'parseAIResponseText']) {
  if (typeof runtime.prompts[name] !== 'function') throw Error('Missing prompt helper: ' + name);
}
if (typeof runtime.images.buildRecommendationImagePrompts !== 'function') throw Error('Missing image prompts');
console.log(`PASS: ${manifest.files.length} source files match ${manifest.sourceCommit}; runtime/prompt helpers load on Node ${process.versions.node}. No network or installs used.`);
