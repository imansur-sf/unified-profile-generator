const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGenerationWorker } = require('../lib/generation-worker');

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fakeStore() {
  const jobs = new Map();
  const projects = [];
  const calls = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const error = (code, status = 409, job) => Object.assign(Error(code), { code, status, job });
  const publicJob = job => ({ id: job.id, status: job.status, phase: job.phase, projectId: job.projectId });
  function add(id) { jobs.set(id, { id, status: 'queued', phase: 'queued', input: { marker: id }, checkpoint: {}, version: '1' }); }
  async function request(key, path, { body = {} } = {}) {
    calls.push({ key, path, body: clone(body) });
    if (key !== 'test-owner-key') throw error('invalid_api_key', 401);
    const [id, operation] = path.split('/');
    const job = jobs.get(id);
    if (!job) throw error('job_not_found', 404);
    if (operation === 'claim') {
      if (job.status === 'completed') throw error('job_completed', 409, publicJob(job));
      if (job.status === 'running') throw error('job_busy');
      job.status = 'running'; job.leaseId = body.leaseId; job.version = String(Number(job.version) + 1);
      return { job: publicJob(job), input: clone(job.input), checkpoint: clone(job.checkpoint), version: job.version, lease: { id: job.leaseId } };
    }
    if (job.status !== 'running' || job.leaseId !== body.leaseId) throw error('lease_lost');
    if (operation === 'heartbeat') return { lease: { id: job.leaseId } };
    if (body.expectedVersion !== job.version) throw error('version_conflict');
    if (operation === 'checkpoint') { job.checkpoint = clone(body.checkpoint); job.phase = body.phase; }
    if (operation === 'complete') { projects.push(clone(body.project)); job.status = 'completed'; job.phase = 'completed'; job.projectId = String(projects.length); }
    if (operation === 'fail') { job.status = 'failed'; job.error = body.error; }
    job.version = String(Number(job.version) + 1);
    return { job: publicJob(job), version: job.version };
  }
  return { add, jobs, projects, calls, request };
}
const output = { project: { name: 'Test project', payload: { test: true } }, result: { personas: ['sales'] } };

test('durable string versions and checkpoints are passed to atomic completion; caller key stays outside payload', async () => {
  const store = fakeStore(); store.add('one');
  const worker = createGenerationWorker({ request: store.request, pipeline: async ({ input, onCheckpoint }) => {
    assert.equal(input.marker, 'one');
    await onCheckpoint({ text: 'saved' }, 'text_ready');
    await onCheckpoint({ text: 'saved', image: 'data:image/png;base64,aW1hZ2U=' }, 'image_ready');
    return output;
  } });
  assert.equal((await worker.start('one', 'test-owner-key')).status, 202);
  await worker.idle();
  assert.equal(worker.activeCount, 0);
  assert.equal(store.projects.length, 1);
  assert.equal(store.jobs.get('one').status, 'completed');
  assert.equal(store.calls.at(-1).body.expectedVersion, '4');
  assert.doesNotMatch(JSON.stringify(store.calls.map(call => call.body)), /test-owner-key/);
});

test('concurrent claims reserve local capacity before awaiting accounts', async () => {
  const gate = deferred();
  const work = deferred();
  let claims = 0;
  const worker = createGenerationWorker({ maxActive: 1, request: async (key, path) => {
    if (path.endsWith('/claim')) { claims++; await gate.promise; return { job: { id: 'one' }, input: {}, version: '1' }; }
    return {};
  }, pipeline: async () => { await work.promise; return output; } });
  const first = worker.start('one', 'key');
  assert.equal(worker.activeCount, 1);
  assert.equal((await worker.start('two', 'key')).status, 429);
  assert.equal((await worker.start('one', 'key')).status, 409);
  gate.resolve();
  await first;
  assert.equal(claims, 1);
  work.resolve(); await worker.idle();
});

test('another worker sees active lease and cannot launch duplicate paid work', async () => {
  const store = fakeStore(); store.add('one');
  const gate = deferred();
  let providerCalls = 0;
  const pipeline = async () => { providerCalls++; await gate.promise; return output; };
  const a = createGenerationWorker({ request: store.request, pipeline });
  const b = createGenerationWorker({ request: store.request, pipeline });
  await a.start('one', 'test-owner-key');
  const result = await b.start('one', 'test-owner-key');
  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'job_busy');
  assert.equal(providerCalls, 1);
  gate.resolve(); await a.idle();
  const completed = await b.start('one', 'test-owner-key');
  assert.equal(completed.body.error, 'job_completed');
  assert.equal(store.projects.length, 1);
});

test('explicit resume on new worker uses durable checkpoint and fences old worker from saving', async () => {
  const store = fakeStore(); store.add('one');
  const stopped = deferred();
  const checkpointed = deferred();
  const a = createGenerationWorker({ request: store.request, heartbeatMs: 60000, pipeline: async ({ onCheckpoint }) => {
    await onCheckpoint({ image: 'paid-image-kept' }, 'image_ready'); checkpointed.resolve();
    await stopped.promise;
    await onCheckpoint({ stale: true }, 'stale');
    return output;
  } });
  await a.start('one', 'test-owner-key'); await checkpointed.promise;
  store.jobs.get('one').status = 'interrupted'; // represents lease expiration in durable accounts DB
  const b = createGenerationWorker({ request: store.request, pipeline: async ({ checkpoint }) => {
    assert.equal(checkpoint.image, 'paid-image-kept'); return output;
  } });
  assert.equal((await b.start('one', 'test-owner-key')).status, 202);
  await b.idle();
  stopped.resolve(); await a.idle();
  const claims = store.calls.filter(call => call.path.endsWith('/claim'));
  assert.notEqual(claims[0].body.leaseId, claims[1].body.leaseId);
  assert.equal(store.projects.length, 1);
  assert.equal(store.jobs.get('one').status, 'completed');
  assert.equal(store.jobs.get('one').checkpoint.image, 'paid-image-kept');
});

test('failed provider call records safe resumable failure and releases local capacity', async () => {
  const store = fakeStore(); store.add('one');
  const worker = createGenerationWorker({ request: store.request, pipeline: async () => { throw Object.assign(Error('sensitive provider body'), { code: 'llm_failed' }); } });
  await worker.start('one', 'test-owner-key'); await worker.idle();
  assert.equal(store.jobs.get('one').status, 'failed');
  assert.equal(store.jobs.get('one').error.code, 'llm_failed');
  assert.doesNotMatch(store.jobs.get('one').error.message, /sensitive/);
  assert.equal(worker.activeCount, 0);
});

test('lost heartbeat aborts provider work and cannot commit a result', async () => {
  const store = fakeStore(); store.add('one');
  const request = async (...args) => {
    if (args[1].endsWith('/heartbeat')) throw Object.assign(Error('lease lost'), { code: 'lease_lost' });
    return store.request(...args);
  };
  const worker = createGenerationWorker({ request, heartbeatMs: 5, pipeline: async ({ signal }) => {
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return output;
  } });
  const keepAlive = setTimeout(() => {}, 1000);
  try { await worker.start('one', 'test-owner-key'); await worker.idle(); }
  finally { clearTimeout(keepAlive); }
  assert.equal(store.projects.length, 0);
  assert.equal(worker.activeCount, 0);
});
