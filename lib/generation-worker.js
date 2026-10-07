'use strict';

const crypto = require('node:crypto');

function createGenerationWorker({ request, pipeline, maxActive = 4, heartbeatMs = 30000, onError = () => {} }) {
  const active = new Map();
  const claiming = new Set();
  async function start(jobId, apiKey) {
    if (active.has(jobId) || claiming.has(jobId)) return { status: 409, body: { error: 'job_busy' } };
    if (active.size + claiming.size >= maxActive) return { status: 429, body: { error: 'generation_capacity_reached', resumable: true } };
    claiming.add(jobId);
    const leaseId = crypto.randomUUID();
    let claim;
    try { claim = await request(apiKey, `${jobId}/claim`, { method: 'POST', body: { leaseId } }); }
    catch (error) { return { status: error.status || 502, body: { error: error.code || 'integration_unavailable', ...(error.job ? { job: error.job } : {}) } }; }
    finally { claiming.delete(jobId); }
    const controller = new AbortController();
    let version = claim.version;
    let heartbeatPending = false;
    const interval = setInterval(async () => {
      if (heartbeatPending) return;
      heartbeatPending = true;
      try { await request(apiKey, `${jobId}/heartbeat`, { method: 'POST', body: { leaseId } }); }
      catch (error) { controller.abort(error); }
      finally { heartbeatPending = false; }
    }, heartbeatMs);
    interval.unref?.();
    const running = (async () => {
      try {
        const output = await pipeline({ input: claim.input, checkpoint: claim.checkpoint || {}, signal: controller.signal,
          onCheckpoint: async (checkpoint, phase) => {
            controller.signal.throwIfAborted();
            const result = await request(apiKey, `${jobId}/checkpoint`, { method: 'PUT', body: { leaseId, expectedVersion: version, checkpoint, phase } });
            version = result.version;
          }
        });
        controller.signal.throwIfAborted();
        await request(apiKey, `${jobId}/complete`, { method: 'POST', body: { leaseId, expectedVersion: version, project: output.project, result: output.result } });
      } catch (error) {
        onError(error.code || error.name || 'generation_failed');
        if (!controller.signal.aborted) {
          try {
            await request(apiKey, `${jobId}/fail`, { method: 'POST', body: { leaseId, expectedVersion: version, error: { code: error.code || 'generation_failed', message: 'Generation stopped. Resume to continue from the last saved stage.' } } });
          } catch (_) { /* The lease expires into a durable interrupted state. */ }
        }
      } finally {
        clearInterval(interval);
        controller.abort();
        active.delete(jobId);
      }
    })();
    active.set(jobId, running);
    return { status: 202, body: { job: claim.job } };
  }
  return { start, idle: () => Promise.all([...active.values()]), get activeCount() { return active.size + claiming.size; } };
}

module.exports = { createGenerationWorker };
