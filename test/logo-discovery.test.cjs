'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { extractLogoCandidates } = require('../js/brand-logo');
const page = 'https://example.com/company/start';

test('actual header logos outrank touch icons, favicons, and unrelated images', () => {
  assert.deepEqual(extractLogoCandidates(`
    <meta property="og:image" content="/hero.jpg">
    <link rel="icon" href="/small.ico">
    <link rel="apple-touch-icon" href="/touch.png">
    <div class="partner-logos"><img src="/partner-logo.svg"></div>
    <header><img src="/brand.svg" alt="Example logo"></header>
    <main><img src="/hero.jpg"><img src="/hero-2.jpg?logo=yes"></main>
  `, page), ['https://example.com/brand.svg', 'https://example.com/touch.png', 'https://example.com/small.ico', 'https://example.com/favicon.ico']);
});

test('handles attribute order, case, unquoted values, shortcut rels, and entities', () => {
  assert.deepEqual(extractLogoCandidates(`
    <HEADER><IMG ALT='Our &quot;Logo&quot;' SRC=//cdn.example.com/logo.svg?color=blue&amp;v=2></HEADER>
    <LINK HREF='../favicon.png?v=1&#38;theme=light' TYPE=image/png REL='SHORTCUT ICON'>
  `, page), ['https://cdn.example.com/logo.svg?color=blue&v=2', 'https://example.com/favicon.png?v=1&theme=light', 'https://example.com/favicon.ico']);
});

test('resolves against the document base but keeps fallback on the final page origin', () => {
  assert.deepEqual(extractLogoCandidates(`
    <base href="javascript:alert(1)"><base href="//assets.example.com/v2/">
    <base href="https://ignored.example.com/">
    <img src="brand/logo.svg"><link rel="apple-touch-icon-precomposed" href="icons/touch.png">
  `, 'https://www.example.com/after/redirect'), [
    'https://assets.example.com/v2/brand/logo.svg', 'https://assets.example.com/v2/icons/touch.png', 'https://www.example.com/favicon.ico'
  ]);
});

test('rejects non-http URLs, URL credentials, control characters, and invalid page URLs', () => {
  const html = `<header><img alt="Logo" src="javascript:alert(1)"><img alt="Logo" src="data:image/png;base64,aaaa">
    <img alt="Logo" src="https://user:password@example.com/logo.svg"><img alt="Logo" src="https://example.com/lo&#10;go.svg"></header>
    <link rel="icon" href="file:///logo.png"><link rel="icon" href="https://safe.example.com/icon.svg">`;
  assert.deepEqual(extractLogoCandidates(html, page), ['https://safe.example.com/icon.svg', 'https://example.com/favicon.ico']);
  for (const url of ['file:///tmp/example.html', 'javascript:alert(1)', 'https://user:password@example.com/', 'not a URL']) {
    assert.deepEqual(extractLogoCandidates(html, url), []);
  }
});

test('ignores markup in raw text, templates, and comments without executing anything', () => {
  const html = `<!-- <img alt="Logo" src="/comment.svg"> -->
    <script>throw new Error('must not execute'); const template = '<header><img alt="Logo" src="/script.svg"></header>';</script>
    <style>.logo { content: '<img alt="Logo" src="/style.svg">'; }</style>
    <textarea><img alt="Logo" src="/textarea.svg"></textarea>
    <template><img alt="Logo" src="/template.svg"></template>
    <header><img alt="Logo" src="/real.svg"></header>`;
  assert.deepEqual(extractLogoCandidates(html, page), ['https://example.com/real.svg', 'https://example.com/favicon.ico']);
});

test('recognizes branded wrappers and lazy/srcset logos, excluding partner modules inside the header', () => {
  const html = `<header>
    <a class="navbar-brand"><img data-src="/identity.svg" src="data:image/gif;base64,aaaa"></a>
    <img class="brand-mark" data-srcset="/mark-small.png 1x, /mark-large.png 2x">
    <section class="sponsors"><img alt="Sponsor Logo" src="/sponsor.svg"></section>
    <div class="logo-carousel"><img src="/other-logo.svg"></div>
  </header>`;
  assert.deepEqual(extractLogoCandidates(html, page), [
    'https://example.com/identity.svg', 'https://example.com/mark-large.png', 'https://example.com/mark-small.png', 'https://example.com/favicon.ico'
  ]);
});

test('deduplicates candidates and preserves bounded alternatives plus the favicon fallback', () => {
  const html = `<header>${Array.from({ length: 20 }, (_, i) => `<img alt="Logo" src="/logo-${i}.svg">`).join('')}
    <img alt="Logo" src="https://example.com/logo-0.svg#duplicate"></header>
    <link rel="icon" href="/favicon.ico">`;
  const candidates = extractLogoCandidates(html, page);
  assert.equal(candidates.length, 6);
  assert.equal(new Set(candidates).size, 6);
  assert.equal(candidates[5], 'https://example.com/favicon.ico');
  assert.deepEqual(extractLogoCandidates('', page), ['https://example.com/favicon.ico']);
});

test('SVG/scalable and larger icons are ranked above small ICO alternatives', () => {
  assert.deepEqual(extractLogoCandidates(`
    <link rel="icon" href="/tiny.ico" sizes="16x16 32x32">
    <link rel="icon" href="/large.png" sizes="192x192">
    <link rel="icon" href="/mark.svg" sizes="any">
  `, page), ['https://example.com/mark.svg', 'https://example.com/large.png', 'https://example.com/tiny.ico', 'https://example.com/favicon.ico']);
});

test('generic logo collections do not promote unrelated college or customer images', () => {
  const html = `<header><img src="/ncsa-logo.svg"></header>
    <section class="logos"><div class="logo"><img src="/colleges/princeton.png" alt="Princeton"></div></section>
    <section class="ncsa-hp-hero"><span class="ncsa-hp-hero__bubble"><img class="ncsa-hp-hero__bubble-logo" src="/homepage-hero/coastal-carolina.png" alt="coastal carolina"></span></section>
    <footer><a class="site-logo"><img src="/identity.svg"></a></footer>`;
  assert.deepEqual(extractLogoCandidates(html, page), ['https://example.com/ncsa-logo.svg', 'https://example.com/identity.svg', 'https://example.com/favicon.ico']);
});

test('malformed tags finish in an isolated process without regex backtracking', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const { extractLogoCandidates } = require(${JSON.stringify(require.resolve('../js/brand-logo'))});
    const assert = require('node:assert/strict');
    for (const html of ['<img' + ' '.repeat(50000) + '"', '<img alt="' + 'x'.repeat(2000000), '<' + 'x'.repeat(2000000)]) {
      assert.deepEqual(extractLogoCandidates(html, 'https://example.com/'), ['https://example.com/favicon.ico']);
    }
  `], { timeout: 3000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('raw text with malformed markup cannot hide the real header logo', () => {
  const html = `<script>const example = '<img alt="';</script><header><img alt="Logo" src="/identity.svg"></header>`;
  assert.deepEqual(extractLogoCandidates(html, page), ['https://example.com/identity.svg', 'https://example.com/favicon.ico']);
});

test('browser UMD and pagehost expose the same candidates before DOM cleanup', () => {
  const html = '<header><img alt="Logo" src="/identity.svg"></header>';
  let discoveredBeforeCleanup = false;
  let scraped;
  const context = vm.createContext({ window: {}, URL, DOMParser: class {
    parseFromString() {
      return {
        querySelectorAll(selector) { return selector.startsWith('script,') ? [{ remove() { assert.equal(discoveredBeforeCleanup, true); } }] : []; },
        querySelector() { return null; }, body: { textContent: 'Example business' }
      };
    }
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/brand-logo.js'), 'utf8'), context);
  const discover = context.window.UPGBrandLogo.extractLogoCandidates;
  context.window.UPGBrandLogo.extractLogoCandidates = (...args) => { discoveredBeforeCleanup = true; return discover(...args); };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pagehost.js'), 'utf8'), context);
  scraped = context.window.UPG_Shared.extractCoreHTML(html, page);
  assert.deepEqual(Array.from(scraped.logoCandidates), extractLogoCandidates(html, page));
  assert.equal(scraped.favicon, 'https://example.com/identity.svg');
  assert.equal(scraped.bodyText, 'Example business');
});
