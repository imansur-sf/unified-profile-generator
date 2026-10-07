const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { fetchPublicResource, validatePublicUrl } = require('./lib/safe-fetch');
const { parsePublicOrigin, parseTrustedProxies, requestOrigin: resolveRequestOrigin } = require('./lib/request-boundary');
const { buildState, renderSavedProfile, integrationArtifact, LENSES } = require('./lib/profile-runtime');
const { runGenerationPipeline } = require('./lib/generation-pipeline');
const { createGenerationWorker } = require('./lib/generation-worker');
const app = express();
const PUBLIC_ORIGIN = parsePublicOrigin(process.env.PUBLIC_ORIGIN || '');
app.set('trust proxy', parseTrustedProxies(process.env.TRUST_PROXY || ''));
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_BASE_URL = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
// Browser clients in a Heroku Private Space cannot always reach a sibling
// internal app directly. Keep account/auth traffic same-origin by proxying it
// through UPG; the UPG dyno can reach the accounts service privately.
const SAASY_ACCOUNTS_URL = (process.env.SAASY_ACCOUNTS_URL || 'https://sassysolutions-accounts-8215113235cf.aster-virginia.herokuapp.com').replace(/\/$/, '');
const MCP_ALLOWED_ORIGINS = new Set((process.env.MCP_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const MCP_MAX_TEXT_CHARS = 60000;
const MCP_MAX_EXPORT_CHARS = 200000;
const MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28'];
const GENERATION_TIMEOUT_MS = 90000;
const MAX_SCRAPE_BYTES = 3000000;
const SCRAPE_TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (compatible; UnifiedProfileGenerator/1.0)';
const IMAGE_GEN_MODEL = 'gemini-3.1-flash-image';
const IMAGE_GEN_TIMEOUT_MS = 30000;
const MAX_IMAGE_GEN_BATCH = 12;
const BRAND_IMAGE_TIMEOUT_MS = 12000;
// Keep the embedded shared logo small enough that it does not materially add
// to saved-project payloads already containing generated recommendation art.
const MAX_BRAND_IMAGE_BYTES = 512 * 1024;
const TIER_MODELS = { fast: 'gemini-3.5-flash-lite', balanced: 'gemini-3.5-flash', powerful: 'gemini-3.1-pro-preview' };
const DEFAULT_MODEL = TIER_MODELS.balanced;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();
// Saved profiles can include several AI-created recommendation images. Keep a
// deliberate cap, but apply the larger allowance only to project saves.
app.use('/projects', express.json({ limit: '20mb' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(['/saasy-auth.js', '/auth', '/projects', '/api-keys'], proxySaasyAccounts);
app.use(['/integrations', '/mcp', '/.well-known/mcp.json'], requireConfiguredPublicOrigin);
app.post('/integrations/v1/upg/generations', handleCreateGeneration);
app.get('/integrations/v1/upg/generations/:id', handleGetGeneration);
app.post('/integrations/v1/upg/generations/:id/resume', handleResumeGeneration);
app.get('/integrations/v1/upg/profiles/:id/export', handleProfileExport);
app.use('/integrations', proxySaasyAccounts);
app.get('/.well-known/mcp.json', (req, res) => {
  let origin;
  try { origin = requestOrigin(req); } catch (_) { return res.status(400).json({ error: 'invalid_request_origin' }); }
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    name: 'Unified Profile Generator',
    version: '1.0.0',
    transport: 'streamable-http',
    endpoint: `${origin}/mcp`,
    authentication: { type: 'api-key', header: 'X-API-Key', keyPrefix: 'upg_' },
    protocolVersions: MCP_PROTOCOL_VERSIONS,
    capabilities: { tools: MCP_TOOLS.map(tool => tool.name) },
    generation: { asynchronous: true, durable: true, explicitResume: true, requiredScopes: ['generations:write', 'profiles:write'] }
  });
});
app.post('/mcp', validateMcpOrigin, handleMcpRequest);
app.get('/mcp', (req, res) => {
  res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed', message: 'Use POST with MCP JSON-RPC messages.' });
});
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'unified-profile-generator', version: 1, endpoints: ['GET /api/scrape', 'GET /api/brand-image', 'POST /api/llm', 'POST /api/generate-images', 'GET /api/health'], llm_configured: Boolean(GEMINI_API_KEY), public_origin_configured: Boolean(PUBLIC_ORIGIN), integrations_configured: process.env.NODE_ENV !== 'production' || Boolean(PUBLIC_ORIGIN) });
});
app.get('/api/scrape', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'missing_url' });
  try {
    const upstream = await fetchPublicResource(target, {
      maxBytes: MAX_SCRAPE_BYTES, timeoutMs: SCRAPE_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
      acceptContentType: value => !value || /^text\//i.test(value) || /(json|xml|xhtml)/i.test(value)
    });
    res.set({
      'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'public, max-age=600',
      'X-Scraper-Source': new URL(upstream.url).hostname, 'X-Scraper-Bytes': String(upstream.body.length)
    });
    res.send(upstream.body);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || 'network_error', ...(err.upstreamStatus ? { status: err.upstreamStatus } : {}), ...(err.limitBytes ? { limitBytes: err.limitBytes } : {}) });
  }
});
app.get('/api/brand-image', async (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!target) return res.status(400).json({ error: 'missing_url' });
  try {
    const image = await fetchBrandImage(target);
    res.set('Cache-Control', 'private, max-age=86400');
    res.json({ imageData: `data:${image.mime};base64,${image.data.toString('base64')}` });
  } catch (err) {
    res.status(err?.status || 502).json({ error: err?.code || 'brand_image_failed' });
  }
});
app.post('/api/llm', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'llm_not_configured', hint: 'Set GEMINI_API_KEY config var on this Heroku app' });
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.ok) return res.status(429).json({ error: 'rate_limited', retryAfterMs: rl.retryAfterMs });
  const { prompt, system, tier, maxTokens } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'missing_prompt' });
  if (prompt.length > 200000) return res.status(413).json({ error: 'prompt_too_long' });
  const chosenTier = ['fast', 'balanced', 'powerful'].includes(tier) ? tier : 'balanced';
  const model = TIER_MODELS[chosenTier] || DEFAULT_MODEL;
  const tokens = Math.min(Math.max(parseInt(maxTokens, 10) || 8000, 100), 16000);
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const geminiBody = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: tokens } };
  if (system && typeof system === 'string' && system.trim()) geminiBody.systemInstruction = { parts: [{ text: system }] };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const upstream = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal });
    clearTimeout(timeout);
    if (upstream.status === 400) { const body = await upstream.text().catch(() => ''); return res.status(502).json({ error: 'gemini_bad_request', body: body.slice(0, 300) }); }
    if (upstream.status === 401 || upstream.status === 403) return res.status(502).json({ error: 'gemini_auth_failed' });
    if (upstream.status === 429) return res.status(429).json({ error: 'gemini_rate_limited' });
    if (!upstream.ok) { const body = await upstream.text().catch(() => ''); return res.status(502).json({ error: 'gemini_failed', status: upstream.status, body: body.slice(0, 300) }); }
    const data = await upstream.json();
    const text = data?.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('') || '';
    if (!text) return res.status(502).json({ error: 'gemini_empty_response' });
    res.json({ text, model_used: model, tier: chosenTier, usage: data.usageMetadata || null });
  } catch (err) { const code = err && err.name === 'AbortError' ? 'timeout' : 'network_error'; res.status(502).json({ error: code, message: (err && err.message) || 'unknown' }); }
});
app.post('/api/generate-images', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'llm_not_configured', hint: 'Set GEMINI_API_KEY' });
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.ok) return res.status(429).json({ error: 'rate_limited', retryAfterMs: rl.retryAfterMs });
  const { prompts } = req.body;
  if (!Array.isArray(prompts) || prompts.length === 0 || prompts.length > MAX_IMAGE_GEN_BATCH) return res.status(400).json({ error: 'invalid_prompts', max: MAX_IMAGE_GEN_BATCH });
  for (const p of prompts) { if (!p || !p.slot || !p.prompt || typeof p.prompt !== 'string' || p.prompt.length > 2000) return res.status(400).json({ error: 'invalid_prompt_entry', slot: p?.slot }); }
  const results = await Promise.allSettled(prompts.map(async (p) => { const result = await generateImage(p.prompt); return { slot: p.slot, ...result }; }));
  const output = results.map((r, i) => { if (r.status === 'fulfilled') return r.value; return { slot: prompts[i].slot, error: r.reason?.message || 'generation_failed' }; });
  res.json({ results: output });
});
async function generateImage(prompt, signal) {
  const geminiUrl = `${GEMINI_API_BASE_URL}/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const geminiBody = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, IMAGE_GEN_TIMEOUT_MS);
  try {
    const upstream = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal });
    if (!upstream.ok) throw generationError('image_generation_failed');
    const data = JSON.parse(await readBoundedText(upstream, 8 * 1024 * 1024));
    const imagePart = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    const mime = imagePart?.inlineData?.mimeType;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mime || '') || !/^[a-z0-9+/]+=*$/i.test(imagePart?.inlineData?.data || '')) throw generationError('invalid_image_response');
    return { imageData: `data:${mime};base64,${imagePart.inlineData.data}` };
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

function brandImageError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function normalizedBrandImageMime(contentType, url) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (mime.startsWith('image/')) return mime;
  if (mime === 'application/octet-stream' || mime === 'application/x-ico') {
    const pathName = url.pathname.toLowerCase();
    if (pathName.endsWith('.png')) return 'image/png';
    if (pathName.endsWith('.jpg') || pathName.endsWith('.jpeg')) return 'image/jpeg';
    if (pathName.endsWith('.gif')) return 'image/gif';
    if (pathName.endsWith('.webp')) return 'image/webp';
    if (pathName.endsWith('.svg')) return 'image/svg+xml';
    return 'image/x-icon';
  }
  return '';
}

async function fetchBrandImage(rawUrl) {
  try {
    const upstream = await fetchPublicResource(rawUrl, {
      maxBytes: MAX_BRAND_IMAGE_BYTES, timeoutMs: BRAND_IMAGE_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
      acceptContentType: (contentType, url) => Boolean(normalizedBrandImageMime(contentType, url)),
      contentTypeError: 'not_image'
    });
    if (!upstream.body.length) throw brandImageError('empty_image', 502);
    return { mime: normalizedBrandImageMime(upstream.contentType, new URL(upstream.url)), data: upstream.body };
  } catch (err) {
    if (err.code === 'too_large') throw brandImageError('image_too_large', 413);
    throw err;
  }
}
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large', message: 'The project is larger than the 20 MB save limit.' });
  }
  return next(err);
});
app.use(express.static(path.join(__dirname), { extensions: ['html'], maxAge: '1h' }));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
if (require.main === module) app.listen(PORT, '::', () => { console.log(`unified-profile-generator running on port ${PORT} (IPv6 dual-stack)`); console.log(`LLM backend: ${GEMINI_API_KEY ? 'Gemini API configured' : 'NOT configured (set GEMINI_API_KEY)'}`); });
async function proxySaasyAccounts(req, res) {
  const headers = {};
  for (const name of ['accept', 'authorization', 'content-type', 'x-api-key', 'idempotency-key']) {
    const value = req.get(name);
    if (value) headers[name] = value;
  }
  const request = { method: req.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) request.body = JSON.stringify(req.body);
  try {
    const upstream = await fetch(`${SAASY_ACCOUNTS_URL}${req.originalUrl}`, request);
    const contentType = upstream.headers.get('content-type');
    const cacheControl = upstream.headers.get('cache-control');
    if (contentType) res.set('Content-Type', contentType);
    if (cacheControl) res.set('Cache-Control', cacheControl);
    if (req.path !== '/saasy-auth.js') res.set('Cache-Control', 'no-store');
    res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error('Saasy Accounts proxy failed:', err.message);
    res.status(502).json({ error: 'sign_in_service_unavailable' });
  }
}
function validateMcpOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  let sameOrigin;
  try { sameOrigin = requestOrigin(req); } catch (_) { return res.status(400).json({ error: 'invalid_request_origin' }); }
  if (origin === sameOrigin || MCP_ALLOWED_ORIGINS.has(origin)) return next();
  res.status(403).json({ jsonrpc: '2.0', error: { code: -32003, message: 'Origin is not allowed for this MCP server.' }, id: null });
}
const MCP_TOOLS = [
  {
    name: 'upg_list_profiles',
    title: 'List saved Unified Profile Generator profiles',
    description: 'List the signed-in API key owner\'s saved UPG profiles. Use this to find an individual or account profile before retrieving or exporting it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'upg_get_profile',
    title: 'Get a saved Unified Profile Generator profile',
    description: 'Get the data and presentation metadata for one saved UPG profile. The rendered HTML is excluded; use the export tool when a presentation artifact is needed.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'The profile ID returned by upg_list_profiles.' },
        includeState: { type: 'boolean', description: 'Include the editable profile state when it is small enough to safely return. Defaults to false.' }
      },
      required: ['profileId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'upg_get_profile_export',
    title: 'Get a presentation export reference for a UPG profile',
    description: 'Return a presentation-ready export reference for a saved profile. By default this returns metadata and an authenticated REST export path; set includeHtml only when the calling client can safely handle the HTML payload.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'The profile ID returned by upg_list_profiles.' },
        persona: { type: 'string', enum: ['sales', 'service', 'marketing', 'success', 'custom'], description: 'Optional saved persona view to export. Defaults to the active saved view; preserves its saved tab and images.' },
        includeHtml: { type: 'boolean', description: 'Return HTML directly when it is 200,000 characters or less. Defaults to false.' }
      },
      required: ['profileId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'upg_generate_profile',
    title: 'Generate and save a Unified Profile Generator profile',
    description: 'Start an AI generation job from a customer website and a viewer persona. This creates a saved UPG profile when complete and requires an API key with generation permission. Ask for user confirmation before calling it.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Customer website URL to analyze.' },
        profileType: { type: 'string', enum: ['b2c', 'b2b'], description: 'Generate an individual B2C or account B2B profile.' },
        persona: { type: 'string', enum: ['sales', 'service', 'marketing', 'success', 'custom'], description: 'The person who will use the profile.' },
        objective: { type: 'string', description: 'What the profile user needs to decide or do.' },
        customRole: { type: 'string', description: 'Required when persona is custom.' },
        brief: { type: 'string', description: 'Optional business context or requirements.' },
        projectName: { type: 'string', description: 'Optional name for the saved UPG project.' },
        idempotencyKey: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,200}$', description: 'Stable unique request key (16–200 letters, digits, underscores or hyphens). Reuse only for the exact same generation request.' },
        includeImages: { type: 'boolean', description: 'Generate shared portrait and persona-specific recommendation images. Defaults to true; incurs image-generation usage.' },
        views: { type: 'array', minItems: 1, maxItems: 5, description: 'Optional distinct persona views. Replaces the single persona strategy.', items: { type: 'object', properties: { persona: { type: 'string', enum: ['sales', 'service', 'marketing', 'success', 'custom'] }, objective: { type: 'string' }, brief: { type: 'string' }, customRole: { type: 'string' } }, required: ['persona'], additionalProperties: false } },
        tier: { type: 'string', enum: ['fast', 'balanced', 'powerful'], description: 'AI generation quality tier. Defaults to balanced.' }
      },
      required: ['url', 'profileType'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  },
  {
    name: 'upg_get_generation_status',
    title: 'Get Unified Profile Generator generation status',
    description: 'Check the state of an asynchronous UPG profile generation job. When completed, use the returned profile ID to retrieve or export the saved profile.',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string', description: 'Generation job ID returned by upg_generate_profile.' } }, required: ['jobId'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'upg_resume_generation',
    title: 'Resume an interrupted Unified Profile Generator job',
    description: 'Explicitly resume a queued, failed, or interrupted job from its last durable checkpoint using the same job ID. Ask for confirmation: a provider call that finished just before interruption may be repeated and charged again. Reading status never resumes work.',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  }
];
async function handleMcpRequest(req, res) {
  res.set({ 'Cache-Control': 'no-store', 'MCP-Protocol-Version': selectMcpProtocolVersion(req) });
  const message = req.body;
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return sendMcpError(res, message?.id ?? null, -32600, 'Invalid JSON-RPC request.');
  const isNotification = message.id === undefined || message.id === null;
  if (message.method === 'notifications/initialized') return res.status(202).end();
  if (message.method === 'initialize') {
    const auth = await verifyMcpApiKey(req);
    if (!auth.ok) return sendMcpError(res, message.id, -32001, auth.message);
    return sendMcpResult(res, message.id, {
      protocolVersion: selectMcpProtocolVersion(req),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'unified-profile-generator', version: '1.0.0' },
      instructions: 'This server provides saved-profile discovery, retrieval, export, and asynchronous AI generation. Generation requires a UPG API key created with profile-generation permission and should be called only after user confirmation.'
    });
  }
  if (message.method === 'tools/list') {
    const auth = await verifyMcpApiKey(req);
    if (!auth.ok) return sendMcpError(res, message.id, -32001, auth.message);
    return sendMcpResult(res, message.id, { tools: MCP_TOOLS });
  }
  if (message.method === 'tools/call') {
    const toolName = message.params?.name;
    const tool = MCP_TOOLS.find(candidate => candidate.name === toolName);
    if (!tool) return sendMcpError(res, message.id, -32602, 'Unknown MCP tool.');
    const result = await callMcpTool(req, toolName, message.params?.arguments || {});
    if (isNotification) return res.status(202).end();
    return sendMcpResult(res, message.id, result);
  }
  if (isNotification) return res.status(202).end();
  return sendMcpError(res, message.id, -32601, `Method not found: ${message.method}`);
}
function selectMcpProtocolVersion(req) {
  const requested = req.get('mcp-protocol-version') || req.body?.params?.protocolVersion || req.body?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  return MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : '2025-06-18';
}
async function verifyMcpApiKey(req) {
  const response = await callAccountsIntegration(req, '/integrations/v1/upg/connection');
  if (response.ok) return { ok: true };
  return { ok: false, message: response.status === 401 ? 'A valid UPG API key is required.' : 'UPG could not verify this API key.' };
}
async function callMcpTool(req, name, args) {
  if (name === 'upg_list_profiles') return mcpIntegrationJson(req, '/integrations/v1/upg/profiles');
  if (name === 'upg_generate_profile') {
    const result = await createGenerationJob(req, args);
    return result.status < 300 ? mcpToolResult(result.body) : mcpToolError(result.body?.error || 'UPG could not start generation.');
  }
  if (name === 'upg_get_generation_status' || name === 'upg_resume_generation') {
    const jobId = typeof args.jobId === 'string' ? args.jobId.trim() : '';
    const result = name === 'upg_resume_generation' ? await resumeGeneration(req, jobId) : await getGeneration(req, jobId);
    return result.status < 300 ? mcpToolResult(result.body) : mcpToolError(result.body.error);
  }
  const profileId = typeof args.profileId === 'string' ? args.profileId.trim() : '';
  if (!profileId) return mcpToolError('profileId is required.');
  if (name === 'upg_get_profile') {
    const response = await callAccountsIntegration(req, `/integrations/v1/upg/profiles/${encodeURIComponent(profileId)}`);
    const body = await readAccountsJson(response);
    if (!response.ok) return mcpToolError(integrationErrorMessage(response, body));
    const artifact = Object.assign({}, body.artifact || {});
    const hasRenderedHtml = Boolean(artifact.renderedHtml);
    delete artifact.renderedHtml;
    const output = { profile: body.profile, artifact: { ...artifact, hasRenderedHtml } };
    if (args.includeState === true && body.state !== undefined) output.state = limitMcpValue(body.state, 'state');
    return mcpToolResult(output);
  }
  if (name === 'upg_get_profile_export') {
    const result = await getProfileExport(req, profileId, args.persona);
    if (result.status !== 200) return mcpToolError(result.body.error);
    const { html, persona } = result.body;
    const output = {
      profileId,
      mimeType: 'text/html',
      persona,
      exportPath: `/integrations/v1/upg/profiles/${encodeURIComponent(profileId)}/export?persona=${encodeURIComponent(persona)}`,
      htmlCharacters: html.length,
      note: 'Retrieve exportPath from this UPG server with the same X-API-Key request header. Never put the key in a URL. The HTML preserves saved images and the selected persona’s saved tab.'
    };
    if (args.includeHtml === true) {
      if (html.length > MCP_MAX_EXPORT_CHARS) output.htmlOmitted = 'The image-bearing export exceeds the direct MCP text limit. Retrieve exportPath instead.';
      else output.html = html;
    }
    return mcpToolResult(output);
  }
  return mcpToolError('Unsupported MCP tool.');
}
async function mcpIntegrationJson(req, path) {
  const response = await callAccountsIntegration(req, path);
  const body = await readAccountsJson(response);
  return response.ok ? mcpToolResult(body) : mcpToolError(integrationErrorMessage(response, body));
}
async function callAccountsIntegration(req, path, options = {}) {
  return callAccountsWithApiKey(String(req.get('x-api-key') || '').trim(), path, options);
}
async function callAccountsWithApiKey(apiKey, path, options = {}) {
  if (!apiKey) return new Response(JSON.stringify({ error: 'missing_api_key' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = { 'X-API-Key': apiKey, Accept: 'application/json, text/html;q=0.9' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const response = await fetch(`${SAASY_ACCOUNTS_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal, redirect: 'error'
    });
    const body = await readBoundedText(response, 24 * 1024 * 1024);
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'integration_unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  } finally { clearTimeout(timeout); }
}
async function readBoundedText(response, limit) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > limit) throw generationError('upstream_response_too_large');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw generationError('upstream_response_too_large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}
async function readAccountsJson(response) { return parseJsonSafely(await response.text()); }
function parseJsonSafely(value) { try { return JSON.parse(value); } catch { return { error: value || 'upstream_error' }; } }
function integrationErrorMessage(response, body) {
  if (response.status === 401) return 'A valid UPG API key is required.';
  if (response.status === 403) return 'This API key does not have permission for that operation.';
  if (response.status === 404) return 'The requested profile was not found.';
  if (response.status === 409) return body?.error === 'profile_needs_resave' ? 'This saved project needs to be re-saved in UPG before it can be shared.' : 'A presentation export is not available for this profile yet.';
  return body?.error || `UPG integration request failed (${response.status}).`;
}
function limitMcpValue(value, label) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= MCP_MAX_TEXT_CHARS) return value;
  return { truncated: true, reason: `${label} exceeds the MCP payload limit. Use the REST API for the complete saved profile.` };
}
function mcpToolResult(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }] }; }
function mcpToolError(message) { return { content: [{ type: 'text', text: String(message) }], isError: true }; }
function sendMcpResult(res, id, result) { return res.json({ jsonrpc: '2.0', id, result }); }
function sendMcpError(res, id, code, message) { return res.json({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handleCreateGeneration(req, res) {
  const result = await createGenerationJob(req, req.body);
  res.status(result.status).set('Cache-Control', 'no-store').json(result.body);
}

async function createGenerationJob(req, body) {
  const apiKey = String(req.get('x-api-key') || '').trim();
  const input = normalizeGenerationRequest(body);
  if (input.error) return { status: 400, body: { error: input.error } };
  try { requestOrigin(req); } catch (_) { return { status: 400, body: { error: 'invalid_request_origin' } }; }
  if (!GEMINI_API_KEY) return { status: 503, body: { error: 'llm_not_configured' } };
  const headerKey = req.get('idempotency-key');
  if (headerKey && body?.idempotencyKey && headerKey !== body.idempotencyKey) return { status: 400, body: { error: 'idempotency_key_mismatch' } };
  const idempotencyKey = headerKey || body?.idempotencyKey || crypto.randomUUID();
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,200}$/.test(idempotencyKey)) return { status: 400, body: { error: 'invalid_idempotency_key' } };
  try {
    const created = await requestGenerationStore(apiKey, '', { method: 'POST', idempotencyKey, body: { input } });
    let job = created.job;
    let startError;
    if (created.created) {
      const started = await generationWorker.start(job.id, apiKey);
      if (started.status < 300) job = started.body.job;
      else startError = started.body.error;
    }
    return { status: created.created ? 202 : 200, body: { job: publicGenerationJob(job), created: created.created, idempotencyKey, ...(startError ? { startError, message: 'The request is saved. Explicitly resume this job to start its worker.' } : {}) } };
  } catch (error) { return jobErrorResult(error); }
}

async function handleGetGeneration(req, res) {
  const result = await getGeneration(req, req.params.id);
  res.status(result.status).set('Cache-Control', 'no-store').json(result.body);
}
async function getGeneration(req, id) {
  if (!/^gen_[0-9a-f]{32}$/.test(id || '')) return { status: 400, body: { error: 'invalid_job_id' } };
  try {
    const result = await requestGenerationStore(String(req.get('x-api-key') || '').trim(), id);
    return { status: 200, body: { job: publicGenerationJob(result.job) } };
  } catch (error) { return jobErrorResult(error); }
}
async function handleResumeGeneration(req, res) {
  const result = await resumeGeneration(req, req.params.id);
  res.status(result.status).set('Cache-Control', 'no-store').json(result.body);
}
async function resumeGeneration(req, id) {
  if (!/^gen_[0-9a-f]{32}$/.test(id || '')) return { status: 400, body: { error: 'invalid_job_id' } };
  // The accounts owner check must precede local busy/capacity shortcuts. All
  // generated UPG generation keys include profiles:read for status/resume.
  const existing = await getGeneration(req, id);
  if (existing.status !== 200 || existing.body.job.status === 'completed') return existing;
  if (!GEMINI_API_KEY) return { status: 503, body: { error: 'llm_not_configured' } };
  const result = await generationWorker.start(id, String(req.get('x-api-key') || '').trim());
  if (result.body.job) result.body.job = publicGenerationJob(result.body.job);
  if (result.body.error === 'job_completed') return { status: 200, body: { job: result.body.job } };
  return result;
}
function jobErrorResult(error) { return { status: error.status || 502, body: { error: error.code || 'integration_unavailable', ...(error.job ? { job: publicGenerationJob(error.job) } : {}) } }; }

async function requestGenerationStore(apiKey, suffix, options = {}) {
  // Only storage calls are retried, with identical fenced bodies. Paid model calls
  // are never retried automatically. Accounts makes these transitions idempotent.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await callAccountsWithApiKey(apiKey, `/integrations/v1/upg/jobs${suffix ? '/' + suffix : ''}`, options);
    const body = await readAccountsJson(response);
    if (response.ok) return body;
    if (response.status >= 500 && attempt === 0) continue;
    throw Object.assign(new Error(body.error || 'integration_unavailable'), { code: body.error || 'integration_unavailable', status: response.status, job: body.job });
  }
}

const generationWorker = createGenerationWorker({
  request: requestGenerationStore,
  pipeline: options => runGenerationPipeline(options, {
    fetchSource: fetchGenerationSource, generateText: generateProfileText, generateImage,
    fetchLogo: async url => { const image = await fetchBrandImage(url); return `data:${image.mime};base64,${image.data.toString('base64')}`; }
  }),
  onError: code => console.error('UPG generation stopped:', code)
});

function normalizeGenerationRequest(body) {
  const rawUrl = String(body?.url || '').trim();
  let url;
  try { url = validatePublicUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`); } catch { return { error: 'invalid_url' }; }
  if (!rawUrl) return { error: 'invalid_url' };
  if (body?.profileType !== undefined && !['b2b', 'b2c'].includes(body.profileType)) return { error: 'invalid_profile_type' };
  if (body?.includeImages !== undefined && typeof body.includeImages !== 'boolean') return { error: 'invalid_include_images' };
  const profileType = body?.profileType === 'b2b' ? 'b2b' : 'b2c';
  const candidates = body?.views === undefined ? [body || {}] : body.views;
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 5) return { error: 'invalid_views' };
  const views = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') return { error: 'invalid_views' };
    const lens = candidate.persona || 'sales';
    if (!LENSES.includes(lens) || views.some(view => view.lens === lens)) return { error: 'invalid_or_duplicate_persona' };
    const objective = String(candidate.objective || defaultObjective(lens)).trim().slice(0, 80) || defaultObjective(lens);
    const customRole = String(candidate.customRole || '').trim().slice(0, 120);
    const brief = String(candidate.brief || '').trim().slice(0, 2000);
    if (lens === 'custom' && !customRole) return { error: 'custom_role_required' };
    views.push({ lens, objective, customRole, brief });
  }
  return {
    url: url.toString(), profileType, ...views[0], views, includeImages: body?.includeImages !== false,
    projectName: String(body?.projectName || '').trim().slice(0, 160),
    tier: ['fast', 'balanced', 'powerful'].includes(body?.tier) ? body.tier : 'balanced'
  };
}

function publicGenerationJob(job) {
  return {
    ...job, input: { ...job.input, persona: job.input?.lens || job.input?.persona },
    profile: job.projectId ? { id: job.projectId, name: job.input?.projectName || undefined } : null,
    statusPath: `/integrations/v1/upg/generations/${job.id}`,
    resumePath: `/integrations/v1/upg/generations/${job.id}/resume`
  };
}

function defaultObjective(lens) {
  return ({ sales: 'convert', service: 'resolve', marketing: 'engage', success: 'retain', custom: 'engage' })[lens] || 'convert';
}

function generationError(code, message) { const err = new Error(message || code); err.code = code; return err; }

async function fetchGenerationSource(url) {
  try {
    const upstream = await fetchPublicResource(url, {
      maxBytes: MAX_SCRAPE_BYTES, timeoutMs: SCRAPE_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
      acceptContentType: value => /text\/html|application\/xhtml\+xml/i.test(value)
    });
    return extractGenerationContext(upstream.body.toString('utf8'), upstream.url);
  } catch (err) {
    if (err.code === 'timeout') throw generationError('generation_timeout');
    throw err;
  }
}

function extractGenerationContext(html, url) {
  const title = extractHtmlTag(html, 'title');
  const description = extractMetaContent(html, 'name', 'description') || extractMetaContent(html, 'property', 'og:description');
  const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)).map(match => cleanHtmlText(match[1])).filter(Boolean).slice(0, 20).join('\n');
  const navLinkCandidates = Array.from(html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)).map(match => cleanHtmlText(match[1])).filter(value => value && value.length <= 60).slice(0, 30);
  const icon = html.match(/<link\b(?=[^>]*\brel=["'][^"']*icon[^"']*["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i);
  let favicon = '';
  try { favicon = validatePublicUrl(new URL(icon?.[1] || '/favicon.ico', url).href).href; } catch (_) {}
  return { url, title, description, headings, navLinkCandidates: [...new Set(navLinkCandidates)], siteName: extractMetaContent(html, 'property', 'og:site_name'), favicon, bodyText: cleanHtmlText(html).slice(0, 8000) };
}

function extractHtmlTag(html, tag) { const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); return match ? cleanHtmlText(match[1]) : ''; }
function extractMetaContent(html, attribute, value) { const pattern = new RegExp(`<meta[^>]*${attribute}=["']${value}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta[^>]*content=["']([^"']*)["'][^>]*${attribute}=["']${value}["'][^>]*>`, 'i'); const match = html.match(pattern); return match ? cleanHtmlText(match[1] || match[2]) : ''; }
function cleanHtmlText(value) { return String(value || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim(); }

async function generateProfileText({ prompt, system, tier, signal }) {
  if (!GEMINI_API_KEY) throw generationError('llm_not_configured');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, GENERATION_TIMEOUT_MS);
  try {
    const model = TIER_MODELS[tier] || DEFAULT_MODEL;
    const upstream = await fetch(`${GEMINI_API_BASE_URL}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens: 8000 } }), signal: controller.signal
    });
    if (!upstream.ok) throw generationError(upstream.status === 401 || upstream.status === 403 ? 'llm_auth_failed' : 'llm_failed');
    const data = JSON.parse(await readBoundedText(upstream, 1024 * 1024));
    const text = data?.candidates?.[0]?.content?.parts?.filter(part => part.text).map(part => part.text).join('') || '';
    if (!text) throw generationError('invalid_ai_response');
    return text;
  } catch (err) {
    if (err.name === 'AbortError') throw generationError('generation_timeout');
    throw err;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

// Retained as a small synchronous entry point for validation and integrations
// that already have modeled text. Async jobs use the same builder via the pipeline.
function buildGeneratedProfile(ai, input) {
  const strategy = { lens: input.lens || 'sales', objective: input.objective || 'convert', brief: input.brief || '', customRole: input.customRole || '' };
  const state = buildState(ai, { ...input, views: input.views || [strategy] }, strategy);
  state.integrationArtifact = integrationArtifact(state);
  return { name: input.projectName || `${state.brandName} — ${state.integrationArtifact.subject}`.slice(0, 160), payload: state, sourceUrl: input.url };
}

async function getProfileExport(req, id, persona) {
  if (!/^\d+$/.test(id || '')) return { status: 400, body: { error: 'invalid_profile_id' } };
  if (persona !== undefined && !LENSES.includes(persona)) return { status: 400, body: { error: 'invalid_persona' } };
  try {
    const origin = requestOrigin(req);
    const response = await callAccountsIntegration(req, `/integrations/v1/upg/profiles/${encodeURIComponent(id)}/export-state`);
    const data = await readAccountsJson(response);
    if (!response.ok) return { status: response.status, body: { error: integrationErrorMessage(response, data) } };
    return { status: 200, body: { ...renderSavedProfile(data.payload, { persona, origin }), profile: data.profile } };
  } catch (error) { return { status: error.status || 422, body: { error: error.code || 'profile_not_renderable' } }; }
}
async function handleProfileExport(req, res) {
  const result = await getProfileExport(req, req.params.id, req.query.persona);
  if (result.status !== 200) return res.status(result.status).json(result.body);
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Disposition': `attachment; filename="upg-${req.params.id}-${result.body.persona}.html"`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: https:"
  });
  res.send(result.body.html);
}
function requestOrigin(req) { return resolveRequestOrigin(req, PUBLIC_ORIGIN); }
function requireConfiguredPublicOrigin(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !PUBLIC_ORIGIN) return res.status(503).json({ error: 'public_origin_required', message: 'Set PUBLIC_ORIGIN to this UPG application’s canonical HTTPS origin to enable API and MCP integrations.' });
  next();
}
function checkRateLimit(ip) { const now = Date.now(); let bucket = rateBuckets.get(ip); if (!bucket || now >= bucket.resetAt) { bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }; rateBuckets.set(ip, bucket); } bucket.count++; if (rateBuckets.size > 5000) { for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k); } if (bucket.count > RATE_LIMIT_MAX) return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) }; return { ok: true }; }

module.exports = { app };
