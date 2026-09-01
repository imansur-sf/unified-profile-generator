// ============================================================
// localai.js — AI client (Heroku server default + BYOK Anthropic/SF Gateway)
// ============================================================
// Architecture:
//   • Default path  →  Same-origin Heroku server /api/llm (holds Gemini
//                      API key server-side; no user key required).
//   • sk-ant-* key  →  Anthropic direct.
//   • Any other sk- →  SF LLM Gateway direct.
// Scraping uses the same-origin /api/scrape endpoint (server-side fetch,
// no CORS issues).
// ============================================================

(function () {
  if (!window.UPG_Shared) {
    console.error('[localai] pagehost.js must load before localai.js');
    return;
  }
  const shared = window.UPG_Shared;

  // Share storage keys with the Loyalty Portal Generator so a BYOK key
  // pasted into either app auto-applies in the other.
  const KEY_STORAGE = 'anthropic_api_key';
  const MODEL_STORAGE = 'anthropic_model';
  const SCRAPER_URL_STORAGE = 'scraper_endpoint_url';

  // Default: same-origin (empty string). The Express server on Heroku
  // serves both the frontend and the API endpoints.
  // Users can override in Advanced → Backend Endpoint.
  const DEFAULT_SCRAPER_URL = '';
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
  //   no key         → 'default' (Heroku server /api/llm → Gemini)
  //   sk-ant-* key   → 'anthropic'
  //   any other sk-* → 'sfgateway'
  function detectProvider(key) {
    if (!key) return 'default';
    if (/^sk-ant-/i.test(key)) return 'anthropic';
    return 'sfgateway';
  }
  function currentProvider() { return detectProvider(getApiKey()); }

  // ---- SCRAPING (server-side via /api/scrape) ----
  async function scrape(url) {
    const base = getScraperEndpoint();
    try {
      const res = await fetch(`${base}/api/scrape?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        const html = await res.text();
        if (html && html.length >= 40) {
          const looksJson = /application\/json/i.test(ct) || (html.trim().startsWith('{') && !html.trim().startsWith('{"contents"'));
          if (!looksJson) return html;
        }
        throw localError('scraper_empty', { endpoint: base });
      } else {
        const body = await res.json().catch(() => ({}));
        throw localError('scraper_status', { status: res.status, endpoint: base, upstream: body.error });
      }
    } catch (e) {
      if (e.code) throw e; // already a localError
      throw localError('scraper_network', { endpoint: base, cause: e.message });
    }
  }

  // ---- LLM ROUTER ----
  async function callLLM({ prompt, system, tier = 'balanced', maxTokens = 4000 }) {
    const provider = currentProvider();
    if (provider === 'anthropic')  return callAnthropicDirect({ prompt, system, tier, maxTokens });
    if (provider === 'sfgateway')  return callSFGateway({ prompt, system, tier, maxTokens });
    return callDefaultBackend({ prompt, system, tier, maxTokens });
  }

  // Heroku server /api/llm — server holds the Gemini API key. No BYOK required.
  // A 60s AbortController guards against slow Gemini responses.
  async function callDefaultBackend({ prompt, system, tier = 'balanced', maxTokens = 4000 }) {
    const base = getScraperEndpoint();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60000);
    let res;
    try {
      res = await fetch(`${base}/api/llm`, {
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

  // ---- AI IMAGE GENERATION ----
  // Calls the server-side /api/generate-images endpoint to generate images
  // using Gemini's image generation model. Each prompt includes a slot ID
  // so results can be mapped back to the right field.
  async function generateImages(prompts) {
    const base = getScraperEndpoint();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90000); // 90s for batch
    let res;
    try {
      res = await fetch(`${base}/api/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts }),
        signal: ctl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      console.warn('[UPG] Image generation network error:', e.message);
      return []; // Non-fatal — profile works without images
    }
    clearTimeout(timer);
    if (!res.ok) {
      console.warn('[UPG] Image generation failed:', res.status);
      return [];
    }
    const data = await res.json();
    return data.results || [];
  }

  // Build image generation prompts from the parsed AI profile.
  // Returns an array of { slot, prompt } objects.
  function buildImagePrompts(parsed, profileType) {
    const prompts = [];
    const brand = parsed.brandName || 'company';
    const industry = parsed.industry || 'generic';

    // A person-level profile benefits from a headshot. Account profiles use a
    // company monogram/logo treatment instead, so don't spend an image call on
    // a misleading individual portrait in B2B mode.
    if (profileType !== 'b2b' && !parsed.profile?.photo) {
      const name = parsed.profile?.name || 'person';
      const city = parsed.profile?.city || '';
      prompts.push({
        slot: 'profile_photo',
        prompt: 'Professional headshot photograph of a person named ' + name + (city ? ' from ' + city : '') + '. ' +
          'They are a customer of ' + brand + ' (' + industry + ' industry). ' +
          'Realistic photograph, warm lighting, friendly natural smile, business casual attire, ' +
          'clean neutral background. High quality portrait photo, shot on DSLR, shallow depth of field. ' +
          'Do NOT include any text or labels in the image.'
      });
    }

    // Einstein recommendation images
    if (Array.isArray(parsed.recommendations?.items)) {
      parsed.recommendations.items.forEach(function(rec, i) {
        if (!rec.image && rec.title) {
          prompts.push({
            slot: 'rec_' + i,
            prompt: 'Marketing lifestyle photograph for ' + brand + ': "' + rec.title + '". ' +
              industry + ' industry context. Beautiful commercial photography, ' +
              'vibrant colors, professional product/lifestyle shot suitable for a recommendation card. ' +
              'Aspirational, on-brand imagery. No text overlays, no logos, no words in the image.'
          });
        }
      });
    }

    return prompts;
  }

  // ---- MAIN ----
  async function analyzeCustomerURL(rawUrl, opts = {}) {
    const url = shared.normalizeURL(rawUrl);
    if (!url) throw localError('invalid_url');
    const onStatus = opts.onStatus || (function() {});
    const provider = currentProvider();
    const tier = opts.tier || 'balanced';

    var scraped = null, fallbackReason = null;
    onStatus('fetching');
    try {
      const html = await scrape(url);
      scraped = shared.extractCoreHTML(html, url);
    } catch (e) {
      fallbackReason = e.code || 'scrape_failed';
      onStatus('fallback_url_only');
    }
    if (!scraped) scraped = { url: url, title: '', bodyText: '', headings: '', favicon: '', ogImage: '', navLinkCandidates: [] };

    onStatus('analyzing');
    const profileType = opts.profileType === 'b2b' ? 'b2b' : 'b2c';
    const { text, model_used } = await callLLM({
      prompt: shared.buildUserPrompt(scraped, { profileType: profileType }),
      system: shared.getSystemPrompt ? shared.getSystemPrompt(profileType) : shared.SYSTEM_PROMPT,
      tier: tier,
      maxTokens: 8000
    });

    const parsed = shared.parseAIResponseText(text);
    parsed._meta = {
      source_url: url,
      favicon: scraped.favicon,
      og_image: scraped.ogImage,
      model_used: model_used,
      tier: tier,
      provider: provider,
      mode: fallbackReason ? 'scrape-fallback-url-only' : provider,
      fallback_reason: fallbackReason
    };

    // Generate images for profile photo + recommendation cards
    // Only when using the default (Gemini) backend which has the image endpoint
    const imagePrompts = buildImagePrompts(parsed, profileType);
    if (imagePrompts.length > 0 && provider === 'default') {
      onStatus('generating_images');
      try {
        const imageResults = await generateImages(imagePrompts);
        // Map results back into the parsed profile
        for (var r = 0; r < imageResults.length; r++) {
          var result = imageResults[r];
          if (result.error) continue;
          if (result.slot === 'profile_photo' && result.imageData) {
            parsed.profile.photo = result.imageData;
          } else if (result.slot && result.slot.indexOf('rec_') === 0 && result.imageData) {
            var idx = parseInt(result.slot.split('_')[1], 10);
            if (parsed.recommendations && parsed.recommendations.items && parsed.recommendations.items[idx]) {
              parsed.recommendations.items[idx].image = result.imageData;
            }
          }
        }
      } catch (e) {
        console.warn('[UPG] Image generation failed (non-fatal):', e.message);
        // Continue without images — the profile still works
      }
    }

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
