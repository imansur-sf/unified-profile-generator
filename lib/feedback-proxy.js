// UPG's feedback boundary always selects its own inbox. Accounts verifies the
// bearer session and applies the selected tool to every database operation.
function createFeedbackProxy({ upstream, fetchImpl = (...args) => fetch(...args) }) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const url = new URL(req.originalUrl, 'http://upg.local');
    const tools = url.searchParams.getAll('tool');
    if (!/^\/feedback(?:\/(?:session|inbox(?:\/[a-f0-9-]+(?:\/attachments\/[a-f0-9-]+)?)?))?\/?$/i.test(url.pathname)) {
      return res.status(404).json({ error: 'feedback_not_found' });
    }
    if (tools.length > 1 || (tools.length && tools[0] !== 'upg') || (req.body?.tool !== undefined && req.body.tool !== 'upg')) {
      return res.status(400).json({ error: 'invalid_feedback_tool' });
    }
    url.searchParams.set('tool', 'upg');
    const headers = {};
    for (const name of ['accept', 'authorization', 'content-type', 'idempotency-key']) {
      const value = req.get(name);
      if (value) headers[name] = value;
    }
    const request = { method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(20000) };
    if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
      request.body = JSON.stringify(req.method === 'POST' ? { ...req.body, tool: 'upg' } : req.body);
    }
    try {
      const response = await fetchImpl(upstream.replace(/\/$/, '') + url.pathname + url.search, request);
      // A Private Space/SSO redirect is a connection failure, not a stored report.
      if (response.status >= 300 && response.status < 400) return res.status(502).json({ error: 'feedback_service_unavailable' });
      for (const name of ['content-type', 'content-disposition', 'x-content-type-options']) {
        const value = response.headers.get(name);
        if (value) res.set(name, value);
      }
      res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
    } catch (_) {
      res.status(502).json({ error: 'feedback_service_unavailable' });
    }
  };
}
module.exports = { createFeedbackProxy };
