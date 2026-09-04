const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// Browser clients in a Heroku Private Space cannot always reach a sibling
// internal app directly. Keep account/auth traffic same-origin by proxying it
// through UPG; the UPG dyno can reach the accounts service privately.
const SAASY_ACCOUNTS_URL = (process.env.SAASY_ACCOUNTS_URL || 'https://sassysolutions-accounts-8215113235cf.aster-virginia.herokuapp.com').replace(/\/$/, '');
const MCP_ALLOWED_ORIGINS = new Set((process.env.MCP_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const MCP_MAX_TEXT_CHARS = 60000;
const MCP_MAX_EXPORT_CHARS = 200000;
const MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28'];
const MAX_SCRAPE_BYTES = 3000000;
const SCRAPE_TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (compatible; UnifiedProfileGenerator/1.0)';
const IMAGE_GEN_MODEL = 'gemini-3.1-flash-image';
const IMAGE_GEN_TIMEOUT_MS = 30000;
const MAX_IMAGE_GEN_BATCH = 12;
const TIER_MODELS = { fast: 'gemini-3.5-flash-lite', balanced: 'gemini-3.5-flash', powerful: 'gemini-3.1-pro-preview' };
const DEFAULT_MODEL = TIER_MODELS.balanced;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(['/saasy-auth.js', '/auth', '/projects', '/api-keys', '/integrations'], proxySaasyAccounts);
app.get('/.well-known/mcp.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    name: 'Unified Profile Generator',
    version: '1.0.0',
    transport: 'streamable-http',
    endpoint: `${req.protocol}://${req.get('host')}/mcp`,
    authentication: { type: 'api-key', header: 'X-API-Key', keyPrefix: 'upg_' },
    protocolVersions: MCP_PROTOCOL_VERSIONS,
    capabilities: { tools: ['upg_list_profiles', 'upg_get_profile', 'upg_get_profile_export'] },
    plannedCapabilities: ['upg_generate_profile', 'upg_get_generation_status']
  });
});
app.post('/mcp', validateMcpOrigin, handleMcpRequest);
app.get('/mcp', (req, res) => {
  res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed', message: 'Use POST with MCP JSON-RPC messages.' });
});
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'unified-profile-generator', version: 1, endpoints: ['GET /api/scrape', 'POST /api/llm', 'POST /api/generate-images', 'GET /api/health'], llm_configured: Boolean(GEMINI_API_KEY) });
});
app.get('/api/scrape', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'missing_url' });
  let targetURL;
  try { targetURL = new URL(target); } catch { return res.status(400).json({ error: 'invalid_url' }); }
  if (targetURL.protocol !== 'https:' && targetURL.protocol !== 'http:') return res.status(400).json({ error: 'bad_protocol', got: targetURL.protocol });
  if (isDangerousHost(targetURL.hostname)) return res.status(403).json({ error: 'blocked_host', hostname: targetURL.hostname });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
    const upstream = await fetch(targetURL.toString(), { method: 'GET', redirect: 'follow', headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' }, signal: controller.signal });
    clearTimeout(timeout);
    if (!upstream.ok) return res.status(502).json({ error: 'upstream_status', status: upstream.status });
    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    if (!/^text\//i.test(contentType) && !/(json|xml|xhtml)/i.test(contentType)) return res.status(415).json({ error: 'not_text', contentType });
    const reader = upstream.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > MAX_SCRAPE_BYTES) { try { reader.cancel(); } catch (_) {} return res.status(413).json({ error: 'too_large', limitBytes: MAX_SCRAPE_BYTES }); } chunks.push(value); }
    const body = Buffer.concat(chunks);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=600', 'X-Scraper-Source': targetURL.hostname, 'X-Scraper-Bytes': String(total) });
    res.send(body);
  } catch (err) { const code = err && err.name === 'AbortError' ? 'timeout' : 'network_error'; res.status(502).json({ error: code, message: (err && err.message) || 'unknown' }); }
});
app.post('/api/llm', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'llm_not_configured', hint: 'Set GEMINI_API_KEY config var on this Heroku app' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
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
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.ok) return res.status(429).json({ error: 'rate_limited', retryAfterMs: rl.retryAfterMs });
  const { prompts } = req.body;
  if (!Array.isArray(prompts) || prompts.length === 0 || prompts.length > MAX_IMAGE_GEN_BATCH) return res.status(400).json({ error: 'invalid_prompts', max: MAX_IMAGE_GEN_BATCH });
  for (const p of prompts) { if (!p || !p.slot || !p.prompt || typeof p.prompt !== 'string' || p.prompt.length > 2000) return res.status(400).json({ error: 'invalid_prompt_entry', slot: p?.slot }); }
  const results = await Promise.allSettled(prompts.map(async (p) => { const result = await generateImage(p.prompt); return { slot: p.slot, ...result }; }));
  const output = results.map((r, i) => { if (r.status === 'fulfilled') return r.value; return { slot: prompts[i].slot, error: r.reason?.message || 'generation_failed' }; });
  res.json({ results: output });
});
async function generateImage(prompt) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const geminiBody = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);
  const upstream = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal });
  clearTimeout(timeout);
  if (!upstream.ok) { const body = await upstream.text().catch(() => ''); throw new Error(`Gemini ${upstream.status}: ${body.slice(0, 200)}`); }
  const data = await upstream.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData);
  if (!imagePart) throw new Error('No image in Gemini response');
  const mime = imagePart.inlineData.mimeType || 'image/jpeg';
  return { imageData: `data:${mime};base64,${imagePart.inlineData.data}` };
}
app.use(express.static(path.join(__dirname), { extensions: ['html'], maxAge: '1h' }));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.listen(PORT, '::', () => { console.log(`unified-profile-generator running on port ${PORT} (IPv6 dual-stack)`); console.log(`LLM backend: ${GEMINI_API_KEY ? 'Gemini API configured' : 'NOT configured (set GEMINI_API_KEY)'}`); });
async function proxySaasyAccounts(req, res) {
  const headers = {};
  for (const name of ['accept', 'authorization', 'content-type', 'x-api-key']) {
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
  const sameOrigin = `${req.protocol}://${req.get('host')}`;
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
        includeHtml: { type: 'boolean', description: 'Return HTML directly when it is 200,000 characters or less. Defaults to false.' }
      },
      required: ['profileId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
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
      instructions: 'This server provides read-only access to saved Unified Profile Generator profiles. Profile generation is not yet available through MCP.'
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
    const response = await callAccountsIntegration(req, `/integrations/v1/upg/profiles/${encodeURIComponent(profileId)}/export`);
    const html = await response.text();
    if (!response.ok) return mcpToolError(integrationErrorMessage(response, parseJsonSafely(html)));
    const output = {
      profileId,
      mimeType: 'text/html',
      exportPath: `/integrations/v1/upg/profiles/${encodeURIComponent(profileId)}/export`,
      htmlCharacters: html.length,
      note: 'Use the same X-API-Key to retrieve exportPath through the UPG REST API.'
    };
    if (args.includeHtml === true) {
      if (html.length > MCP_MAX_EXPORT_CHARS) return mcpToolError(`The export is ${html.length.toLocaleString()} characters and exceeds the MCP direct-export limit. Retrieve exportPath through the REST API instead.`);
      output.html = html;
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
async function callAccountsIntegration(req, path) {
  const apiKey = String(req.get('x-api-key') || '').trim();
  if (!apiKey) return new Response(JSON.stringify({ error: 'missing_api_key' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  try {
    return await fetch(`${SAASY_ACCOUNTS_URL}${path}`, { headers: { 'X-API-Key': apiKey, Accept: 'application/json, text/html;q=0.9' } });
  } catch (err) {
    console.error('MCP accounts integration failed:', err.message);
    return new Response(JSON.stringify({ error: 'integration_unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
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
function isDangerousHost(host) { if (!host) return true; const h = host.toLowerCase(); if (h === 'localhost' || h === 'localhost.localdomain') return true; if (h === 'metadata.google.internal') return true; if (h.endsWith('.internal') || h.endsWith('.local')) return true; if (h === '169.254.169.254') return true; if (/^(10|127)\./.test(h)) return true; if (/^192\.168\./.test(h)) return true; if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true; if (/^169\.254\./.test(h)) return true; if (h === '0.0.0.0') return true; if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd00:')) return true; return false; }
function checkRateLimit(ip) { const now = Date.now(); let bucket = rateBuckets.get(ip); if (!bucket || now >= bucket.resetAt) { bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }; rateBuckets.set(ip, bucket); } bucket.count++; if (rateBuckets.size > 5000) { for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k); } if (bucket.count > RATE_LIMIT_MAX) return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) }; return { ok: true }; }
