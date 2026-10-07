// Shared, inert logo discovery for the browser and server. Candidate URLs still
// pass through the server's public-fetch checks and image decoder before use.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UPGBrandLogo = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function decodeEntities(value) {
    const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
      if (entity[0] !== '#') return named[entity.toLowerCase()] || match;
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    });
  }

  function attributes(tag) {
    const attrs = Object.create(null);
    let at = 1;
    while (at < tag.length && /[\w:-]/.test(tag[at])) at++;
    while (at < tag.length) {
      while (at < tag.length && /[\s/]/.test(tag[at])) at++;
      const start = at;
      while (at < tag.length && !/[\s=<>/]/.test(tag[at])) at++;
      if (start === at) { at++; continue; }
      const name = tag.slice(start, at).toLowerCase();
      while (at < tag.length && /\s/.test(tag[at])) at++;
      let value = '';
      if (tag[at] === '=') {
        at++;
        while (at < tag.length && /\s/.test(tag[at])) at++;
        const quote = tag[at] === '"' || tag[at] === "'" ? tag[at++] : '';
        const valueStart = at;
        while (at < tag.length && (quote ? tag[at] !== quote : !/[\s>]/.test(tag[at]))) at++;
        value = tag.slice(valueStart, at);
        if (quote && tag[at] === quote) at++;
      }
      if (!Object.prototype.hasOwnProperty.call(attrs, name)) attrs[name] = decodeEntities(value);
    }
    return attrs;
  }

  // Single forward scan: malformed/unclosed quotes cannot cause regex
  // backtracking. Oversized tags are consumed but never inspected.
  function* tags(source, rawTags) {
    let at = 0;
    const lowerSource = source.toLowerCase();
    while (at < source.length) {
      const start = source.indexOf('<', at);
      if (start < 0) return;
      if (source.startsWith('<!--', start)) {
        const end = source.indexOf('-->', start + 4);
        at = end < 0 ? source.length : end + 3;
        continue;
      }
      at = start + 1;
      if (source[at] === '/') at++;
      if (!/[a-zA-Z]/.test(source[at] || '')) continue;
      let quote = '';
      while (at < source.length) {
        const char = source[at++];
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') break;
      }
      if (source[at - 1] === '>' && !quote && at - start <= 16384) {
        const tag = source.slice(start, at);
        yield { tag };
        const name = /^<([\w:-]+)/.exec(tag)?.[1].toLowerCase();
        if (rawTags.has(name)) {
          const closing = '</' + name;
          while (at < source.length) {
            const end = lowerSource.indexOf(closing, at);
            if (end < 0) return;
            at = end + closing.length;
            while (at < source.length && /\s/.test(source[at])) at++;
            if (source[at] === '>') { yield { tag: closing + '>' }; at++; break; }
          }
        }
      }
    }
  }

  function safeURL(value, base) {
    if (!value || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) return '';
    try {
      const url = new URL(value.trim(), base);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
      url.hash = '';
      return url.href;
    } catch { return ''; }
  }

  function extractLogoCandidates(html, pageURL) {
    const page = safeURL(pageURL);
    if (!page) return [];
    const candidates = [];
    const stack = [];
    let base = page;
    let hasBase = false;
    let index = 0;
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const rawTags = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'textarea', 'title', 'xmp']);
    // Bounded tokenization is intentionally not a browser HTML renderer. It
    // inspects only URL/identity attributes and never executes source content.
    const source = String(html || '').slice(0, 2 * 1024 * 1024);
    const add = (value, score) => {
      const url = safeURL(value, base);
      if (url) candidates.push({ url, score, index: index++ });
    };
    let count = 0;
    let rawName = '';
    for (const { tag } of tags(source, rawTags)) {
      if (count++ >= 30000) break;
      const name = /^<\/?([\w:-]+)/.exec(tag)?.[1].toLowerCase();
      if (!name) continue;
      if (rawName) {
        if (name === rawName && /^<\//.test(tag)) rawName = '';
        continue;
      }
      if (/^<\//.test(tag)) {
        const position = stack.map(entry => entry.name).lastIndexOf(name);
        if (position >= 0) stack.length = position;
        continue;
      }
      const attrs = attributes(tag);
      if (rawTags.has(name)) {
        rawName = name;
        continue;
      }
      if (name === 'base' && !hasBase && attrs.href) {
        const resolved = safeURL(attrs.href, page);
        if (resolved) { base = resolved; hasBase = true; }
      }
      const identity = [attrs.id, attrs.class, attrs.alt, attrs.title, attrs['aria-label']].filter(Boolean).join(' ');
      const context = stack.map(entry => entry.identity).join(' ') + ' ' + identity;
      const unrelated = /(?:partner|sponsor|client[-_ ]?(?:logo|brand)|customer[-_ ]?(?:logo|brand)|logo[-_ ]?(?:wall|carousel|grid|slider|list)|payment|testimonial|trust[-_ ]?(?:badge|logo))/i.test(context);
      const inHeader = stack.some(entry => entry.name === 'header' || entry.name === 'nav' || /(?:^|[-_\s])(?:header|masthead|navbar)(?:$|[-_\s])/i.test(entry.identity));
      if (name === 'img' && !unrelated) {
        const urls = [attrs['data-src'], attrs['data-lazy-src'], attrs['data-original'], attrs.src].filter(Boolean);
        // Generic "logos" wrappers elsewhere on the page often hold customer
        // or college logos, not the site's own identity. Only inherit that
        // signal in the header; elsewhere require a site-specific wrapper.
        const logoContext = stack.slice(-4).filter(entry => inHeader || /(?:site|navbar|header)[-_ ](?:logo|brand)/i.test(entry.identity)).map(entry => entry.identity).join(' ');
        const imageIdentity = inHeader ? identity : [attrs.alt, attrs.title, attrs['aria-label'], /brand[-_ ]?mark|wordmark|(?:navbar|site|header)[-_ ](?:logo|brand)/i.test(identity) ? identity : ''].filter(Boolean).join(' ');
        const explicitLogo = /logo|brand[-_ ]?mark|wordmark|(?:navbar|site|header)[-_ ]brand/i.test(imageIdentity + ' ' + logoContext + ' ' + urls.map(value => value.split(/[?#]/)[0]).join(' '));
        if (explicitLogo) {
          const score = inHeader ? 100 : 75;
          for (const value of urls) add(value, score);
          // srcset-only/lazy images are common on modern homepages. Prefer the
          // largest advertised version, with a strict cap on inspected entries.
          const srcset = attrs.srcset || attrs['data-srcset'] || '';
          const versions = srcset.split(',').slice(0, 20).map(value => value.trim().split(/\s+/)).filter(value => value[0]);
          versions.sort((a, b) => (parseFloat(b[1]) || 1) - (parseFloat(a[1]) || 1));
          for (const value of versions.slice(0, 2)) add(value[0], score - 1);
        }
      }
      if (name === 'link' && attrs.href) {
        const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
        if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) add(attrs.href, 60);
        else if (rel.includes('icon')) {
          const size = Math.max(0, ...String(attrs.sizes || '').split(/\s+/).map(value => parseInt(value, 10) || 0));
          add(attrs.href, attrs.type?.toLowerCase() === 'image/svg+xml' || attrs.sizes === 'any' ? 55 : size >= 64 ? 50 : 40);
        }
      }
      if (!voidTags.has(name) && !/\/\s*>$/.test(tag) && stack.length < 100) stack.push({ name, identity });
    }
    const fallback = new URL('/favicon.ico', page).href;
    const seen = new Set();
    const result = [];
    for (const candidate of candidates.sort((a, b) => b.score - a.score || a.index - b.index)) {
      if (candidate.url === fallback || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      result.push(candidate.url);
      if (result.length === 5) break;
    }
    return [...result, fallback];
  }

  return { extractLogoCandidates };
});
