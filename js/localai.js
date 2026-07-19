// ============================================================
// localai.js — AI client (Worker default + BYOK Anthropic/SF Gateway)
// ============================================================
// Mirrors the Loyalty Portal Generator v2.1 architecture:
//   • Default path  →  Cloudflare Worker /llm (holds SF Gateway key
//                      server-side; no user key required).
//   • sk-ant-* key  →  Anthropic direct.
//   • Any other sk- →  SF LLM Gateway direct.
// Scraping uses the same Worker's /scrape endpoint first, then falls
// back to public CORS proxies.
// ============================================================

(function () {
  if (!window.UPG_Shared) {
    console.error('[localai] pagehost.js must load before localai.js');
    return;
  }
  const shared = window.UPG_Shared;

  // Share storage keys with the Loyalty Portal Generator so a BYOK key
  // pasted into either app auto-applies in the other. This also lets UPG
  // inherit any `sk-ant-…` key you've already saved from LPG, which
  // matters when the shared Worker's SF Gateway upstream is down —
  // Anthropic direct still works.
  const KEY_STORAGE = 'anthropic_api_key';
  const MODEL_STORAGE = 'anthropic_model';
  const SCRAPER_URL_STORAGE = 'scraper_endpoint_url';

  // Reuse the Loyalty Portal Generator's Worker — same shape (/scrape + /llm).
  // Users can override in Advanced → Scraper Endpoint.
  const DEFAULT_SCRAPER_URL = 'https://loyalty-scraper.imansur.workers.dev';
  const SF_GATEWAY_BASE = 'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl';

  const TIER_MODELS_ANTHROPIC = {
    fast:      'claude-haiku-4-5-20251001',
    balanced:  'claude-sonnet-5',
    powerful:  'claude-opus-4-8'
  };
  const TIER_MODELS_SF_GATEWAY = {
    fast:      'claude-3-5-sonnet-20241022',
    balanced:  'claude-sonnet-4-5-20250929',
    powerful:  'claude-sonnet-4-5-20250929'
  };
  const DEFAULT_MODEL = TIER_MODELS_ANTHROPIC.balanced;

  const CORS_PROXIES = [
    { name: 'corsproxy.io',   wrap: u => `https://corsproxy.io/?${encodeURIComponent(u)}`, unwrap: async r => await r.text() },
    { name: 'allorigins.win', wrap: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, unwrap: async r => { const d = await r.json(); return d?.contents || ''; } },
    { name: 'codetabs',       wrap: u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`, unwrap: async r => await r.text() },
    { name: 'thingproxy',     wrap: u => `https://thingproxy.freeboard.io/fetch/${u}`, unwrap: async r => await r.text() }
  ];

  function localError(code, extra) {
    const err = new Error(code);
    err.code = code;
    Object.assign(err, extra || {});
    return err;
  }

  // ---- KEY / MODEL / ENDPOINT STORAGE ----
  function getApiKey()   { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
  function setApiKey(k)  { try { k?.trim() ? localStorage.setItem(KEY_STORAGE, k.trim()) : localStorage.removeItem(KEY_STORAGE); } catch {} }
  function hasKey()      { return getApiKey().length > 10; }
  function getModel()    { try { return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; } }
  function setModel(m)   { try { m ? localStorage.setItem(MODEL_STORAGE, m) : localStorage.removeItem(MODEL_STORAGE); } catch {} }
  function getScraperEndpoint() {
    try {
      const override = (localStorage.getItem(SCRAPER_URL_STORAGE) || '').trim();
      return override || DEFAULT_SCRAPER_URL;
    } catch { return DEFAULT_SCRAPER_URL; }
  }
  function setScraperEndpoint(u) {
    try {
      const t = (u || '').trim();
      if (t) localStorage.setItem(SCRAPER_URL_STORAGE, t.replace(/\/+$/, ''));
      else localStorage.removeItem(SCRAPER_URL_STORAGE);
    } catch {}
  }
  function hasCustomScraperEndpoint() {
    try { return Boolean((localStorage.getItem(SCRAPER_URL_STORAGE) || '').trim()); }
    catch { return false; }
  }
  function getDefaultScraperEndpoint() { return DEFAULT_SCRAPER_URL; }

  // ---- PROVIDER DETECTION ----
  //   no key         → 'default' (Worker /llm)
  //   sk-ant-* key   → 'anthropic'
  //   any other sk-* → 'sfgateway'
  function detectProvider(key) {
    if (!key) return 'default';
    if (/^sk-ant-/i.test(key)) return 'anthropic';
    return 'sfgateway';
  }
  function currentProvider() { return detectProvider(getApiKey()); }

  // ---- SCRAPING (Worker first, then public proxies) ----
  async function scrape(url) {
    let last = null;
    const own = getScraperEndpoint();
    if (own) {
      try {
        const res = await fetch(`${own}/scrape?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          const html = await res.text();
          if (html && html.length >= 40) {
            const looksJson = /application\/json/i.test(ct) || (html.trim().startsWith('{') && !html.trim().startsWith('{"contents"'));
            if (!looksJson) return html;
          }
          last = localError('own_scraper_empty', { endpoint: own });
        } else {
          last = localError('own_scraper_status', { status: res.status, endpoint: own });
        }
      } catch (e) {
        last = localError('own_scraper_network', { endpoint: own, cause: e.message });
      }
    }
    for (const p of CORS_PROXIES) {
      try {
        const res = await fetch(p.wrap(url));
        if (!res.ok) { last = localError('proxy_fetch_failed', { proxy: p.name, status: res.status }); continue; }
        const html = await p.unwrap(res);
        if (!html || html.length < 40) { last = localError('proxy_empty_response', { proxy: p.name }); continue; }
        return html;
      } catch (e) {
        last = localError('proxy_network_error', { proxy: p.name, cause: e.message });
      }
    }
    throw last || localError('scrape_failed');
  }

  // ---- LLM ROUTER ----
  async function callLLM({ prompt, system, tier = 'balanced', maxTokens = 4000 }) {
    const provider = currentProvider();
    if (provider === 'anthropic')  return callAnthropicDirect({ prompt, system, tier, maxTokens });
    if (provider === 'sfgateway')  return callSFGateway({ prompt, system, tier, maxTokens });
    return callDefaultBackend({ prompt, system, tier, maxTokens });
  }

  // Worker /llm — server holds the LLM key. No BYOK required for typical use.
  // A 45s AbortController guards against Cloudflare-side hangs (SF Gateway
  // can occasionally take a long time to first byte).
  async function callDefaultBackend({ prompt, system, tier = 'balanced', maxTokens = 4000 }) {
    const base = getScraperEndpoint();
    if (!base) throw localError('no_default_backend');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    let res;
    try {
      res = await fetch(`${base}/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system, tier, maxTokens }),
        signal: ctl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw localError('default_timeout', { endpoint: base });
      throw localError('default_network', { endpoint: base, cause: e.message });
    }
    clearTimeout(timer);
    if (res.status === 429) throw localError('default_rate_limited');
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      if (body.error === 'llm_not_configured') throw localError('default_not_configured');
      throw localError('default_unavailable', { status: 503, upstream: body.error, upstreamStatus: body.status, upstreamBody: body.body });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw localError('default_failed', {
        status: res.status,
        upstream: body.error,
        upstreamStatus: body.status,
        upstreamBody: typeof body.body === 'string' ? body.body.slice(0, 300) : undefined
      });
    }
    const data = await res.json();
    if (!data || !data.text) throw localError('default_empty_response');
    return { text: data.text, model_used: data.model_used, usage: data.usage };
  }

  async function callAnthropicDirect({ prompt, system, tier = 'balanced', maxTokens = 4000 }) {
    const key = getApiKey();
    if (!key) throw localError('missing_api_key');
    const chosenModel = getModel() || TIER_MODELS_ANTHROPIC[tier] || DEFAULT_MODEL;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (res.status === 401) throw localError('anthropic_bad_key');
    if (res.status === 403) throw localError('anthropic_forbidden');
    if (res.status === 429) throw localError('anthropic_rate_limited');
    if (res.status === 529) throw localError('anthropic_overloaded');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw localError('anthropic_failed', { status: res.status, body: body.slice(0, 200) });
    }
    const data = await res.json();
    const text = Array.isArray(data.content)
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : '';
    if (!text) throw localError('anthropic_empty_response');
    return { text, model_used: data.model, usage: data.usage };
  }

  async function callSFGateway({ prompt, system, tier = 'balanced', maxTokens = 4000 }) {
    const key = getApiKey();
    if (!key) throw localError('missing_api_key');
    const chosenModel = getModel() || TIER_MODELS_SF_GATEWAY[tier] || TIER_MODELS_SF_GATEWAY.balanced;
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const res = await fetch(`${SF_GATEWAY_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: chosenModel, messages, max_tokens: maxTokens })
    });
    if (res.status === 401) throw localError('sfgateway_bad_key');
    if (res.status === 403) throw localError('sfgateway_forbidden');
    if (res.status === 429) throw localError('sfgateway_rate_limited');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw localError('sfgateway_failed', { status: res.status, body: body.slice(0, 200) });
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) throw localError('sfgateway_empty_response');
    return { text, model_used: data.model || chosenModel, usage: data.usage };
  }

  // ---- MAIN ----
  async function analyzeCustomerURL(rawUrl, opts = {}) {
    const url = shared.normalizeURL(rawUrl);
    if (!url) throw localError('invalid_url');
    const onStatus = opts.onStatus || (() => {});
    const provider = currentProvider();
    const tier = opts.tier || 'balanced';

    let scraped = null, fallbackReason = null;
    onStatus('fetching');
    try {
      const html = await scrape(url);
      scraped = shared.extractCoreHTML(html, url);
    } catch (e) {
      fallbackReason = e.code || 'scrape_failed';
      onStatus('fallback_url_only');
    }
    if (!scraped) scraped = { url, title: '', bodyText: '', headings: '', favicon: '', ogImage: '', navLinkCandidates: [] };

    onStatus('analyzing');
    const { text, model_used } = await callLLM({
      prompt: shared.buildUserPrompt(scraped),
      system: shared.SYSTEM_PROMPT,
      tier,
      maxTokens: 4000
    });

    const parsed = shared.parseAIResponseText(text);
    parsed._meta = {
      source_url: url,
      favicon: scraped.favicon,
      og_image: scraped.ogImage,
      model_used,
      tier,
      provider,
      mode: fallbackReason ? 'scrape-fallback-url-only' : provider,
      fallback_reason: fallbackReason
    };
    return parsed;
  }

  window.LocalAI = {
    getKey: getApiKey, setKey: setApiKey, hasKey,
    getModel, setModel,
    getScraperEndpoint, setScraperEndpoint, hasCustomScraperEndpoint, getDefaultScraperEndpoint,
    currentProvider,
    analyzeCustomerURL
  };
})();
