// ============================================================
// apiclient.js — Cloudflare Worker API client (LPG-mirror)
// ------------------------------------------------------------
// Mirrors the Loyalty Portal Generator's architecture:
//
// Default path (no BYOK): calls the shared loyalty-scraper Worker,
// which holds an SF LLM Gateway key as a Cloudflare secret. Any
// Salesforce employee visiting the GitHub Pages site can use the
// tool out of the box.
//
// BYOK path: if the user pastes an API key into the Advanced
// panel, this client sends X-Api-Key and X-Provider headers so
// the same Worker routes to Anthropic (sk-ant-*) or the SF LLM
// Gateway (other keys) using the user's key.
//
//   POST {WORKER}/scrape { url }                      → { html, title, favicon, og_image }
//   POST {WORKER}/llm    { prompt, system, tier, ... } → { text, model }
// ============================================================

(function () {
  const WORKER_BASE = 'https://loyalty-scraper.imansur.workers.dev';

  // Namespaced under `upg_gemini_*` so this variant does NOT inherit a stale
  // key from the original UPG (same GH Pages origin → shared localStorage).
  const LS_KEY = 'upg_gemini_api_key';
  const LS_MODEL = 'upg_gemini_model';
  const LS_SCRAPER = 'upg_gemini_scraper_endpoint';

  function getStoredKey() {
    try { return (localStorage.getItem(LS_KEY) || '').trim(); } catch { return ''; }
  }
  function setStoredKey(v) {
    try { if (v) localStorage.setItem(LS_KEY, v); else localStorage.removeItem(LS_KEY); } catch {}
  }
  function getStoredScraper() {
    try { return (localStorage.getItem(LS_SCRAPER) || '').trim(); } catch { return ''; }
  }
  function setStoredScraper(v) {
    try { if (v) localStorage.setItem(LS_SCRAPER, v); else localStorage.removeItem(LS_SCRAPER); } catch {}
  }

  // Provider detection — mirrors LPG's localai.js semantics.
  //   no key           → 'default'    (Worker uses server-side SF Gateway key)
  //   sk-ant-*         → 'anthropic'
  //   other non-empty  → 'sfgateway'
  function currentProvider() {
    const k = getStoredKey();
    if (!k) return 'default';
    if (/^sk-ant-/i.test(k)) return 'anthropic';
    return 'sfgateway';
  }

  function scraperEndpoint() {
    const custom = getStoredScraper();
    return custom || `${WORKER_BASE}/scrape`;
  }

  function normalizeURL(raw) {
    if (!raw) return null;
    let u = raw.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try { return new URL(u).toString(); }
    catch { return null; }
  }

  function extractCoreHTML(html, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg, iframe, template').forEach(n => n.remove());

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const description =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const siteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

    const faviconEl = doc.querySelector('link[rel~="icon"]') || doc.querySelector('link[rel="apple-touch-icon"]');
    let favicon = faviconEl?.getAttribute('href') || '';
    if (favicon && !favicon.startsWith('http')) {
      try { favicon = new URL(favicon, url).toString(); } catch {}
    }

    const bodyText = (doc.body?.innerText || doc.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(Boolean)
      .slice(0, 30)
      .join('\n');

    const navLinkCandidates = Array.from(doc.querySelectorAll('nav a, header a'))
      .map(a => a.textContent.trim())
      .filter(t => t && t.length < 30)
      .slice(0, 15);

    return { url, title, siteName, description, ogImage, favicon, headings, navLinkCandidates, bodyText };
  }

  const SYSTEM_PROMPT = `You are a brand analyst helping a Salesforce Solution Engineer build a demo Data Cloud unified customer profile for a specific customer.

You will receive scraped content from a customer's website. Extract brand identity and generate a realistic, on-brand unified profile — a fictional but plausible individual member/customer/patient/client/athlete/etc. — that the customer's marketing or engagement team would recognize as accurate to their business.

Return ONLY a single JSON object matching the schema below. No preamble, no markdown fences, no trailing prose.

Schema:
{
  "brandName": string,
  "industry": "recruiting" | "retail" | "healthcare" | "financial" | "generic",
  "appName": string,
  "tabName": string,
  "colors": { "primary": "#RRGGBB", "accent": "#RRGGBB", "secondary": "#RRGGBB", "menu": "#RRGGBB", "menuText": "#RRGGBB", "pageBg": "#RRGGBB" },
  "navLinks": [ string ],
  "profile": { "name": string, "city": "City, ST", "customerId": string, "email": string, "secondaryEmail": string, "secondaryEmailLabel": string, "secondaryEmailInclude": boolean, "phone": "(NNN) NNN-NNNN", "address": "Street\\nCity, ST ZIP", "segment": string },
  "loyalty": { "title": string, "memberId": string, "tier": string, "points": string, "redeemedPoints": string },
  "insights": { "title": string, "items": [ { "icon": "emoji", "label": string, "value": string } ] },
  "affinities": { "title": "Affinities", "seriesA": { "label": string, "color": "#RRGGBB" }, "seriesB": { "label": string, "color": "#RRGGBB" }, "groups": [ { "name": string, "items": [ { "label": string, "a": 0-100, "b": 0-100 } ] } ] },
  "preferences": { "title": string, "items": [ { "label": string, "value": string } ] },
  "events": { "title": string, "items": [ { "name": string, "date": string, "confirmation": string } ] },
  "membership": { "title": string, "items": [ { "label": string, "value": string } ] },
  "recommendations": { "title": "Einstein Recommendations", "items": [ { "eyebrow": string, "title": string, "cta": string, "image": "" } ] },
  "activity": { "title": "Engagement Activity", "items": [ { "icon": "emoji", "title": string, "body": "may include <b>bold</b> or <span style='color:#RRGGBB'>colored</span> HTML — use SINGLE quotes for HTML attrs", "time": string } ] },
  "extraCards": [ { "title": string, "icon": "emoji", "items": [ { "label": string, "value": string } ] } ],
  "rightExtraCards": [ { "title": string, "icon": "emoji", "items": [ { "label": string, "value": string } ] } ]
}

Rules:
- Profile MUST feel specific to this customer's business — not generic.
- For sports-recruiting/education/youth-athletics brands, set industry:"recruiting" and secondaryEmailInclude:true with a parent-email label.
- Colors should match the customer's actual visual brand where discernible.
- DENSITY MATTERS — SEs screenshot the entire profile onto slides. Every section must feel FULL. Aim for the maximum item count. Populate extraCards (1-2) and rightExtraCards (0-1).
- Return ONLY the JSON. No explanation.`;

  function buildUserPrompt(scraped) {
    return `Customer URL: ${scraped.url}
Site title: ${scraped.title || '(not extracted)'}
Description: ${scraped.description || '(not extracted)'}
Site name (og): ${scraped.siteName || '(not extracted)'}

Headings:
${scraped.headings || '(none)'}

Nav links: ${scraped.navLinkCandidates.join(' • ') || '(none)'}

Body text (truncated):
${scraped.bodyText.slice(0, 5000) || '(no body text — analyze from URL/domain alone)'}

Now generate the Unified Profile JSON per the schema.`;
  }

  function parseAIResponseText(text) {
    if (!text) throw new Error('Empty AI response');
    let t = text.trim();
    if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first >= 0 && last > first) t = t.slice(first, last + 1);
    t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    try { return JSON.parse(t); } catch (_) {}
    try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch (_) {}
    const recovered = attemptTruncationRecovery(t);
    if (recovered) {
      try { return JSON.parse(recovered); } catch (_) {}
    }
    console.error('[UPG-Gemini] JSON parse failed. Raw:', text);
    throw new Error('AI returned malformed JSON. Try again — usually transient.');
  }

  function attemptTruncationRecovery(s) {
    let inString = false, escape = false;
    const stack = [];
    let lastSafe = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (c === '\\') { escape = true; continue; }
        if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{' || c === '[') { stack.push(c); continue; }
      if (c === '}' || c === ']') {
        const want = c === '}' ? '{' : '[';
        if (stack.length && stack[stack.length - 1] === want) {
          stack.pop();
          if (stack.length === 0) lastSafe = i + 1;
        }
      }
    }
    if (inString) {
      const cutIdx = s.lastIndexOf(',');
      if (cutIdx > 0) return attemptTruncationRecovery(s.slice(0, cutIdx));
      return null;
    }
    if (stack.length === 0) return null;
    let truncated = s;
    if (lastSafe > 0) {
      const tail = s.slice(lastSafe);
      const cutIdx = tail.lastIndexOf(',');
      truncated = s.slice(0, lastSafe) + (cutIdx > 0 ? tail.slice(0, cutIdx) : '');
    } else {
      const cutIdx = s.lastIndexOf(',');
      if (cutIdx > 0) truncated = s.slice(0, cutIdx);
    }
    let closer = '';
    for (let i = stack.length - 1; i >= 0; i--) closer += (stack[i] === '{' ? '}' : ']');
    return truncated.replace(/,\s*$/, '') + closer;
  }

  // ============================================================
  // Scrape — always hits the shared loyalty-scraper Worker.
  // ============================================================
  async function callScrape(url) {
    const endpoint = scraperEndpoint();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Scrape failed (HTTP ${res.status}): ${body.detail || body.error || res.statusText}`);
    }
    return res.json();
  }

  // ============================================================
  // LLM — hits the same Worker. When BYOK key is present, forwards
  // it via X-Api-Key / X-Provider; otherwise Worker uses its
  // server-side SF Gateway secret.
  // ============================================================
  async function callLLM({ prompt, system }) {
    const key = getStoredKey();
    const provider = currentProvider();
    const headers = { 'Content-Type': 'application/json' };
    if (key) {
      headers['X-Api-Key'] = key;
      headers['X-Provider'] = provider;
    }
    let model;
    try { model = localStorage.getItem(LS_MODEL) || undefined; } catch {}

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90000);
    let res;
    try {
      res = await fetch(`${WORKER_BASE}/llm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt, system, tier: 'balanced', model, maxTokens: 8000 }),
        signal: ctl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('LLM took longer than 90s — try again.');
      throw new Error(`Network error contacting proxy: ${e.message}`);
    }
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`LLM failed (HTTP ${res.status}): ${body.detail || body.error || res.statusText}`);
    }
    return res.json();
  }

  // ============================================================
  // Orchestration
  // ============================================================
  async function analyzeCustomerURL(rawUrl, opts = {}) {
    const url = normalizeURL(rawUrl);
    if (!url) throw new Error("That URL doesn't look right — include the domain (e.g. ncsasports.org).");

    const onStatus = opts.onStatus || (() => {});
    const provider = currentProvider();

    let scraped = null, fallbackReason = null;

    onStatus('fetching');
    try {
      const { html } = await callScrape(url);
      scraped = extractCoreHTML(html, url);
    } catch (e) {
      console.warn('[UPG] scrape failed, falling back to URL-only:', e.message);
      fallbackReason = 'scrape_failed';
      onStatus('fallback_url_only');
    }
    if (!scraped) scraped = { url, title: '', bodyText: '', headings: '', favicon: '', ogImage: '', navLinkCandidates: [] };

    onStatus('analyzing');
    const { text, model } = await callLLM({
      prompt: buildUserPrompt(scraped),
      system: SYSTEM_PROMPT
    });

    const parsed = parseAIResponseText(text);
    parsed._meta = {
      source_url: url,
      favicon: scraped.favicon,
      og_image: scraped.ogImage,
      model_used: model || provider,
      mode: fallbackReason ? `${provider}-url-only` : provider,
      fallback_reason: fallbackReason
    };
    return parsed;
  }

  // ============================================================
  // Public surface — matches what app.js expects.
  // ============================================================
  window.LocalAI = {
    analyzeCustomerURL,
    hasKey: () => !!getStoredKey(),
    getKey: () => getStoredKey(),
    setKey: (v) => setStoredKey((v || '').trim()),
    getModel: () => {
      try { return localStorage.getItem(LS_MODEL) || ''; } catch { return ''; }
    },
    setModel: (v) => {
      try { if (v) localStorage.setItem(LS_MODEL, v); else localStorage.removeItem(LS_MODEL); } catch {}
    },
    getScraperEndpoint: () => getStoredScraper() || `${WORKER_BASE}/scrape`,
    setScraperEndpoint: (v) => setStoredScraper((v || '').trim()),
    getDefaultScraperEndpoint: () => `${WORKER_BASE}/scrape`,
    hasCustomScraperEndpoint: () => !!getStoredScraper(),
    currentProvider,
  };
})();
