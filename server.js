const express = require('express');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const app = express();
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
const GENERATION_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const GENERATION_TIMEOUT_MS = 90000;
const MAX_GENERATION_JOBS = 500;
const generationJobs = new Map();
let generationRenderer = null;
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
app.use(['/saasy-auth.js', '/auth', '/projects', '/api-keys'], proxySaasyAccounts);
app.post('/integrations/v1/upg/generations', handleCreateGeneration);
app.get('/integrations/v1/upg/generations/:id', handleGetGeneration);
app.use('/integrations', proxySaasyAccounts);
app.get('/.well-known/mcp.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    name: 'Unified Profile Generator',
    version: '1.0.0',
    transport: 'streamable-http',
    endpoint: `${req.protocol}://${req.get('host')}/mcp`,
    authentication: { type: 'api-key', header: 'X-API-Key', keyPrefix: 'upg_' },
    protocolVersions: MCP_PROTOCOL_VERSIONS,
    capabilities: { tools: ['upg_list_profiles', 'upg_get_profile', 'upg_get_profile_export', 'upg_generate_profile', 'upg_get_generation_status'] },
    generation: { asynchronous: true, requiredScopes: ['generations:write', 'profiles:write'] }
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
        tier: { type: 'string', enum: ['fast', 'balanced', 'powerful'], description: 'AI generation quality tier. Defaults to balanced.' }
      },
      required: ['url', 'profileType', 'persona'],
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
    return result.status === 202 ? mcpToolResult(result.body) : mcpToolError(result.body?.error || 'UPG could not start generation.');
  }
  if (name === 'upg_get_generation_status') {
    const jobId = typeof args.jobId === 'string' ? args.jobId.trim() : '';
    if (!jobId) return mcpToolError('jobId is required.');
    const connectionResponse = await callAccountsIntegration(req, '/integrations/v1/upg/connection');
    const connection = await readAccountsJson(connectionResponse);
    if (!connectionResponse.ok) return mcpToolError(integrationErrorMessage(connectionResponse, connection));
    const job = generationJobs.get(jobId);
    if (!job || job.email !== connection.email) return mcpToolError('The generation job was not found.');
    return mcpToolResult({ job: publicGenerationJob(job) });
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
async function callAccountsIntegration(req, path, options = {}) {
  return callAccountsWithApiKey(String(req.get('x-api-key') || '').trim(), path, options);
}
async function callAccountsWithApiKey(apiKey, path, options = {}) {
  if (!apiKey) return new Response(JSON.stringify({ error: 'missing_api_key' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  try {
    const headers = { 'X-API-Key': apiKey, Accept: 'application/json, text/html;q=0.9' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    return await fetch(`${SAASY_ACCOUNTS_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
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

async function handleCreateGeneration(req, res) {
  const result = await createGenerationJob(req, req.body);
  res.status(result.status).set('Cache-Control', 'no-store').json(result.body);
}

async function createGenerationJob(req, body) {
  const apiKey = String(req.get('x-api-key') || '').trim();
  const authResponse = await callAccountsWithApiKey(apiKey, '/integrations/v1/upg/generation-authorize', { method: 'POST', body: {} });
  const auth = await readAccountsJson(authResponse);
  if (!authResponse.ok) return { status: authResponse.status, body: { error: integrationErrorMessage(authResponse, auth) } };
  const input = normalizeGenerationRequest(body);
  if (input.error) return { status: 400, body: { error: input.error } };
  pruneGenerationJobs();
  if (generationJobs.size >= MAX_GENERATION_JOBS) return { status: 429, body: { error: 'generation_capacity_reached', message: 'Please try again shortly.' } };
  const job = {
    id: `gen_${crypto.randomUUID().replace(/-/g, '')}`,
    email: auth.email,
    status: 'queued',
    phase: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    input: generationJobInput(input),
    profile: null,
    error: null
  };
  generationJobs.set(job.id, job);
  void runGenerationJob(job, input, apiKey, requestOrigin(req));
  return { status: 202, body: { job: publicGenerationJob(job) } };
}

async function handleGetGeneration(req, res) {
  const connectionResponse = await callAccountsIntegration(req, '/integrations/v1/upg/connection');
  const connection = await readAccountsJson(connectionResponse);
  if (!connectionResponse.ok) return res.status(connectionResponse.status).json({ error: integrationErrorMessage(connectionResponse, connection) });
  const job = generationJobs.get(req.params.id);
  if (!job || job.email !== connection.email) return res.status(404).json({ error: 'generation_not_found' });
  res.set('Cache-Control', 'no-store').json({ job: publicGenerationJob(job) });
}

function normalizeGenerationRequest(body) {
  const rawUrl = String(body?.url || '').trim();
  let url;
  try { url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`); } catch { return { error: 'invalid_url' }; }
  if (!rawUrl || !['http:', 'https:'].includes(url.protocol) || isDangerousHost(url.hostname)) return { error: 'invalid_url' };
  const profileType = body?.profileType === 'b2b' ? 'b2b' : 'b2c';
  const lens = ['sales', 'service', 'marketing', 'success', 'custom'].includes(body?.persona) ? body.persona : 'sales';
  const objective = String(body?.objective || defaultObjective(lens)).trim().slice(0, 80) || defaultObjective(lens);
  const customRole = String(body?.customRole || '').trim().slice(0, 120);
  const brief = String(body?.brief || '').trim().slice(0, 2000);
  if (lens === 'custom' && !customRole) return { error: 'custom_role_required' };
  return {
    url: url.toString(), profileType, lens, objective, customRole, brief,
    projectName: String(body?.projectName || '').trim().slice(0, 160),
    tier: ['fast', 'balanced', 'powerful'].includes(body?.tier) ? body.tier : 'balanced'
  };
}

function generationJobInput(input) {
  return { url: input.url, profileType: input.profileType, persona: input.lens, objective: input.objective, customRole: input.customRole || undefined, brief: input.brief || undefined };
}

function publicGenerationJob(job) {
  return {
    id: job.id, status: job.status, phase: job.phase, createdAt: job.createdAt, updatedAt: job.updatedAt,
    input: job.input, profile: job.profile, error: job.error
  };
}

function defaultObjective(lens) {
  return ({ sales: 'convert', service: 'resolve', marketing: 'engage', success: 'retain', custom: 'engage' })[lens] || 'convert';
}

function setGenerationPhase(job, phase) {
  job.status = 'running';
  job.phase = phase;
  job.updatedAt = new Date().toISOString();
}

async function runGenerationJob(job, input, apiKey, origin) {
  try {
    setGenerationPhase(job, 'fetching_customer_context');
    let source;
    try { source = await fetchGenerationSource(input.url); }
    catch (err) { source = { url: input.url, title: '', description: '', headings: '', bodyText: '', scrapeFallback: err.code || 'scrape_failed' }; }
    setGenerationPhase(job, 'generating_profile');
    const text = await generateProfileJson(source, input);
    const ai = parseGenerationJson(text);
    const generated = buildGeneratedProfile(ai, input, origin);
    setGenerationPhase(job, 'saving_profile');
    const saveResponse = await callAccountsWithApiKey(apiKey, '/integrations/v1/upg/profiles', { method: 'POST', body: generated });
    const save = await readAccountsJson(saveResponse);
    if (!saveResponse.ok) throw generationError(save?.error || `save_failed_${saveResponse.status}`);
    job.status = 'completed';
    job.phase = 'completed';
    job.profile = save.profile;
    job.updatedAt = new Date().toISOString();
  } catch (err) {
    job.status = 'failed';
    job.phase = 'failed';
    job.error = { code: err.code || 'generation_failed', message: safeGenerationError(err) };
    job.updatedAt = new Date().toISOString();
    console.error(`UPG generation ${job.id} failed:`, err.message);
  }
}

function generationError(code, message) { const err = new Error(message || code); err.code = code; return err; }
function safeGenerationError(err) {
  if (err.code === 'llm_not_configured') return 'AI generation is not configured for this UPG environment.';
  if (err.code === 'generation_timeout') return 'Generation took too long. Please try again.';
  if (err.code === 'invalid_ai_response') return 'The AI response could not be turned into a profile. Please try again.';
  if (err.code === 'insufficient_scope') return 'This API key needs profile-generation permission. Create a new key with generation enabled.';
  return 'UPG could not complete this generation. Please try again.';
}

async function fetchGenerationSource(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: controller.signal });
    if (!upstream.ok) throw generationError('scrape_failed');
    const contentType = upstream.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw generationError('scrape_failed');
    const html = await readLimitedResponse(upstream, MAX_SCRAPE_BYTES);
    return extractGenerationContext(html, upstream.url || url);
  } catch (err) {
    if (err.name === 'AbortError') throw generationError('generation_timeout');
    throw err;
  } finally { clearTimeout(timeout); }
}

async function readLimitedResponse(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { try { reader.cancel(); } catch (_) {} throw generationError('scrape_too_large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function extractGenerationContext(html, url) {
  const title = extractHtmlTag(html, 'title');
  const description = extractMetaContent(html, 'name', 'description') || extractMetaContent(html, 'property', 'og:description');
  const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)).map(match => cleanHtmlText(match[1])).filter(Boolean).slice(0, 20).join('\n');
  return { url, title, description, headings, bodyText: cleanHtmlText(html).slice(0, 8000) };
}

function extractHtmlTag(html, tag) { const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); return match ? cleanHtmlText(match[1]) : ''; }
function extractMetaContent(html, attribute, value) { const pattern = new RegExp(`<meta[^>]*${attribute}=["']${value}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta[^>]*content=["']([^"']*)["'][^>]*${attribute}=["']${value}["'][^>]*>`, 'i'); const match = html.match(pattern); return match ? cleanHtmlText(match[1] || match[2]) : ''; }
function cleanHtmlText(value) { return String(value || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim(); }

async function generateProfileJson(source, input) {
  if (!GEMINI_API_KEY) throw generationError('llm_not_configured');
  const system = 'You are a Salesforce Data Cloud demo profile architect. Return only valid JSON. Never claim modeled scores, purchase signals, or recommendations were sourced from the website. Keep all card copy readable as dark text on white cards.';
  const subjectSchema = input.profileType === 'b2b'
    ? 'account{name,headquarters,accountId,industry,type,owner,website,employees,address,tier,parentAccount},accountMetrics{revenue,revenueTrend,pipeline,usageScore,usageTrend,activeUsers,healthScore,healthTrend,supportCases,renewalDate,utilization}'
    : 'profile{name,city,customerId,email,phone,address,segment},loyalty{title,memberId,tier,points,redeemedPoints}';
  const prompt = `Create a complete, fictional but plausible ${input.profileType === 'b2b' ? 'B2B account' : 'B2C individual'} Unified Profile for the website below.\n\nProfile strategy:\n- Viewer persona: ${input.lens}\n- Objective: ${input.objective}\n- Custom role: ${input.customRole || 'n/a'}\n- Decision brief: ${input.brief || 'n/a'}\n\nWebsite context:\n- URL: ${source.url}\n- Title: ${source.title}\n- Description: ${source.description}\n- Headings: ${source.headings}\n- Text: ${source.bodyText}\n\nReturn JSON with these fields: brandName, industry (recruiting|retail|healthcare|financial|generic), appName, tabName, colors{primary,secondary}, ${subjectSchema}, insights{items:[{icon,label,value}]}, affinities{groups:[{name,items:[{label,a,b}]}]}, preferences{items:[{label,value}]}, events{items:[{name,date,confirmation}]}, membership{items:[{label,value}]}, recommendations{items:[{eyebrow,title,cta}]}, activity{items:[{icon,title,body,time}]}, extraCards:[{title,icon,items:[{label,value}]}], rightExtraCards:[{title,icon,items:[{label,value}]}]. Include 6 insights, two affinity groups, 4 preferences, 2 events, 2 membership rows, two recommendations, and 5 activity items. Keep labels concise.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const model = TIER_MODELS[input.tier] || DEFAULT_MODEL;
    const upstream = await fetch(`${GEMINI_API_BASE_URL}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens: 8000 } }), signal: controller.signal
    });
    if (!upstream.ok) throw generationError(upstream.status === 401 || upstream.status === 403 ? 'llm_auth_failed' : 'llm_failed');
    const data = await upstream.json();
    const text = data?.candidates?.[0]?.content?.parts?.filter(part => part.text).map(part => part.text).join('') || '';
    if (!text) throw generationError('invalid_ai_response');
    return text;
  } catch (err) {
    if (err.name === 'AbortError') throw generationError('generation_timeout');
    throw err;
  } finally { clearTimeout(timeout); }
}

function parseGenerationJson(text) {
  const candidate = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(candidate); }
  catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) { try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) {} }
    throw generationError('invalid_ai_response');
  }
}

function getGenerationRenderer() {
  if (generationRenderer) return generationRenderer;
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'defaults.js'), 'utf8'), context, { filename: 'defaults.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'generator.js'), 'utf8'), context, { filename: 'generator.js' });
  generationRenderer = {
    cloneProfileMode: vm.runInContext('cloneProfileMode', context),
    generateProfileHTML: vm.runInContext('generateProfileHTML', context)
  };
  return generationRenderer;
}

function buildGeneratedProfile(ai, input, origin) {
  const renderer = getGenerationRenderer();
  const industry = ['recruiting', 'retail', 'healthcare', 'financial', 'generic'].includes(ai?.industry) ? ai.industry : 'generic';
  const state = renderer.cloneProfileMode(input.profileType, industry);
  state._industry = industry;
  state.profileStrategy = { lens: input.lens, objective: input.objective, brief: input.brief, customRole: input.customRole };
  state.brandName = textValue(ai?.brandName, state.brandName);
  state.appName = input.profileType === 'b2b' ? 'Data Cloud' : textValue(ai?.appName, state.appName);
  state.tabName = textValue(ai?.tabName, state.tabName);
  state.colors = Object.assign({}, state.colors, pickColors(ai?.colors));
  state.colors.accent = '#FFFFFF'; state.colors.menu = '#FFFFFF'; state.colors.menuText = '#000000';
  for (const key of ['profile', 'loyalty', 'insights', 'affinities', 'preferences', 'events', 'membership', 'recommendations', 'activity']) {
    if (ai?.[key] && typeof ai[key] === 'object' && !Array.isArray(ai[key])) state[key] = Object.assign({}, state[key], ai[key]);
  }
  if (input.profileType === 'b2b') {
    if (ai?.account && typeof ai.account === 'object') state.account = Object.assign({}, state.account, ai.account);
    if (ai?.accountMetrics && typeof ai.accountMetrics === 'object') state.accountMetrics = Object.assign({}, state.accountMetrics, ai.accountMetrics);
    state.tabName = textValue(ai?.tabName, state.account.name || state.tabName);
  }
  state.extraCards = normalizeGeneratedCards(ai?.extraCards, 'middle');
  state.rightExtraCards = normalizeGeneratedCards(ai?.rightExtraCards, 'right');
  applyServerPersonaTitles(state);
  const profileType = input.profileType;
  const subject = profileType === 'b2b' ? (state.account?.name || state.tabName || 'Account') : (state.profile?.name || state.tabName || 'Unified Profile');
  const renderedHtml = renderer.generateProfileHTML(state).replace(/(src=["'])assets\/([^"']+)/g, (_, before, assetPath) => `${before}${origin}/assets/${assetPath}`);
  const canPersistRender = renderedHtml.length <= 350000 && !/src=["']data:/i.test(renderedHtml);
  state.integrationArtifact = {
    schemaVersion: 'upg.profile.v1', generatedAt: new Date().toISOString(), profileType, persona: input.lens,
    personaLabel: serverPersonaLabel(input.lens, input.customRole), subject,
    brand: { name: state.brandName || '', appName: state.appName || '', logo: state.logo || '', colors: Object.assign({}, state.colors || {}) },
    renderedHtml: canPersistRender ? renderedHtml : '', renderStatus: canPersistRender ? 'ready' : 'requires_hosted_render'
  };
  const name = input.projectName || `${state.brandName || 'Customer'} — ${subject}`.slice(0, 160);
  return { name, payload: state };
}

function textValue(value, fallback) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : fallback; }
function pickColors(colors) {
  const valid = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());
  const next = {};
  if (valid(colors?.primary)) next.primary = colors.primary.trim();
  if (valid(colors?.secondary)) next.secondary = colors.secondary.trim();
  return next;
}
function normalizeGeneratedCards(cards, placement) {
  if (!Array.isArray(cards)) return [];
  return cards.slice(0, 3).filter(card => card && typeof card === 'object').map((card, index) => ({
    title: textValue(card.title, 'Additional insight'), icon: textValue(card.icon, '✦').slice(0, 12),
    items: Array.isArray(card.items) ? card.items.slice(0, 5).map(item => ({ label: textValue(item?.label, 'Detail'), value: textValue(item?.value, '—') })) : [],
    moduleId: `ai-${placement}-${index + 1}`, placement, visibility: 'suggested'
  }));
}
function applyServerPersonaTitles(state) {
  const labels = {
    sales: ['Purchase & Engagement Signals', 'Buying Preferences', 'Recent Commercial Touchpoints', 'Products & Offers', 'Einstein Sales Recommendations', 'Sales & Engagement Activity'],
    service: ['Churn Risk Indicators', 'Service Preferences', 'Case & Service Timeline', 'Entitlements & Coverage', 'Einstein Service Recommendations', 'Service & Support Activity'],
    marketing: ['Content & Channel Affinities', 'Channel & Consent Preferences', 'Journey & Campaign Timeline', 'Program Enrollment', 'Next Best Content', 'Journey Engagement Activity'],
    success: ['Adoption & Health Signals', 'Success Preferences', 'Milestones & Touchpoints', 'Products & Adoption', 'Next Best Success Actions', 'Success & Adoption Activity'],
    custom: ['Behavior & Context Signals', 'Relevant Preferences', 'Recent Touchpoints', 'Programs & Relationships', 'Recommended Actions', 'Relevant Activity']
  }[state.profileStrategy.lens] || [];
  if (!labels.length) return;
  [state.affinities, state.preferences, state.events, state.membership, state.recommendations, state.activity].forEach((section, index) => { if (section) section.title = labels[index]; });
}
function serverPersonaLabel(lens, customRole) { return lens === 'custom' ? (customRole || 'Custom profile') : ({ sales: 'Sales', service: 'Service', marketing: 'Marketing', success: 'Customer Success' })[lens] || 'Sales'; }
function requestOrigin(req) { const protocol = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim(); return `${protocol}://${req.get('host')}`; }
function pruneGenerationJobs() { const cutoff = Date.now() - GENERATION_JOB_TTL_MS; for (const [id, job] of generationJobs) if (new Date(job.updatedAt).getTime() < cutoff) generationJobs.delete(id); }
function isDangerousHost(host) { if (!host) return true; const h = host.toLowerCase(); if (h === 'localhost' || h === 'localhost.localdomain') return true; if (h === 'metadata.google.internal') return true; if (h.endsWith('.internal') || h.endsWith('.local')) return true; if (h === '169.254.169.254') return true; if (/^(10|127)\./.test(h)) return true; if (/^192\.168\./.test(h)) return true; if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true; if (/^169\.254\./.test(h)) return true; if (h === '0.0.0.0') return true; if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd00:')) return true; return false; }
function checkRateLimit(ip) { const now = Date.now(); let bucket = rateBuckets.get(ip); if (!bucket || now >= bucket.resetAt) { bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }; rateBuckets.set(ip, bucket); } bucket.count++; if (rateBuckets.size > 5000) { for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k); } if (bucket.count > RATE_LIMIT_MAX) return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) }; return { ok: true }; }
