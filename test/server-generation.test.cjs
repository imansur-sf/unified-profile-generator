const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGenerationPipeline } = require('../lib/generation-pipeline');
const { buildState, selectSavedView, renderSavedProfile } = require('../lib/profile-runtime');

const clone = value => JSON.parse(JSON.stringify(value));
const strategies = ['sales', 'service', 'marketing'].map(lens => ({ lens, objective: `objective-${lens}`, brief: `brief-${lens}`, customRole: '' }));
const input = { url: 'https://customer.example/', profileType: 'b2c', tier: 'balanced', includeImages: true, views: strategies };
function fixture(lens = 'sales', type = 'b2c') {
  return {
    brandName: 'Example Customer', industry: 'generic', profile: { name: 'Fictional Person' }, account: { name: 'Fictional Buyer' },
    insights: { items: [{ label: `${lens} insight`, value: 'Modeled' }] },
    affinities: { groups: [{ name: lens, items: [{ label: lens, a: 65, b: 45 }] }] },
    preferences: { items: [{ label: lens, value: 'Modeled preference' }] }, events: { items: [{ name: `${lens} event` }] },
    membership: { items: [{ label: lens, value: 'Modeled product' }] },
    recommendations: { items: [0, 1].map(index => ({ title: `${lens} action ${index}`, cta: 'Review', image: '' })) },
    activity: { items: [{ title: `${lens} activity`, body: `${lens} context` }] },
    railFields: [{ label: `${lens} field`, value: lens, visible: true }],
    extraCards: [{ title: `${lens} module`, items: [{ label: lens, value: 'Useful context' }] }], rightExtraCards: []
  };
}
function adapters(calls = {}) {
  let textCount = 0;
  return {
    fetchSource: async url => { calls.source = (calls.source || 0) + 1; return { url, title: 'Source marker', description: '', headings: '', bodyText: 'Source description', navLinkCandidates: [], favicon: '' }; },
    generateText: async request => { (calls.text ||= []).push(request); return JSON.stringify(fixture(strategies[textCount++].lens)); },
    generateImage: async prompt => { (calls.images ||= []).push(prompt); return { imageData: `data:image/png;base64,${Buffer.from(prompt).toString('base64')}` }; }
  };
}

test('multi-view pipeline shares source, identity, validation and image prompt builders', async () => {
  const calls = {};
  const checkpoints = [];
  const output = await runGenerationPipeline({ input, onCheckpoint: async (value, phase) => checkpoints.push({ value, phase }) }, adapters(calls));
  const state = output.project.payload;
  assert.equal(calls.source, 1);
  assert.equal(calls.text.length, 3);
  assert.equal(calls.images.length, 7); // one shared portrait + two actions per persona
  assert.equal(state.profile.name, 'Fictional Person');
  assert.equal(state.profile.city, '');
  assert.equal(Object.keys(state.accountMetrics).length, 0);
  assert.equal(state.loyalty.memberId, '');
  for (const [index, strategy] of strategies.entries()) {
    assert.match(calls.text[index].prompt, new RegExp(strategy.brief));
    assert.match(calls.text[index].prompt, /Source marker/);
    const view = selectSavedView(state, strategy.lens);
    assert.equal(view.railFields[0].value, strategy.lens);
    assert.equal(view.recommendations.items[0].title, `${strategy.lens} action 0`);
    const decoded = Buffer.from(view.recommendations.items[0].image.split(',')[1], 'base64').toString();
    assert.match(decoded, new RegExp(strategy.brief));
    assert.equal(output.result.visuals[strategy.lens].state, 'ready');
  }
  assert.equal(state.personaVariants.sales.recommendations.items[0].image, '');
  assert.match(state.recommendations.items[0].image, /^data:/);
  assert.equal(state.integrationArtifact.renderStatus, 'renderable');
  assert.equal(state.integrationArtifact.renderedHtml, '');
  assert.equal(checkpoints.filter(item => /_(profile_photo|rec_\d)_ready$/.test(item.phase)).length, 7);
  assert.equal(checkpoints.at(-1).phase, 'ready_to_save');
  assert.equal(checkpoints.at(-1).value.state, undefined);
});

test('restart after one image resumes remaining paid slots without repeating source, text or completed image', async () => {
  let saved;
  const calls = {};
  await assert.rejects(runGenerationPipeline({ input: { ...input, views: [strategies[0]] }, onCheckpoint: async (value, phase) => {
    saved = value;
    if (phase === 'sales_profile_photo_ready') throw Error('simulated process stop');
  } }, adapters(calls)), /simulated process stop/);
  assert.equal(calls.images.length, 1);
  let resumedImages = 0;
  const output = await runGenerationPipeline({ input: { ...input, views: [strategies[0]] }, checkpoint: saved, onCheckpoint: async () => {} }, {
    fetchSource: async () => assert.fail('source already checkpointed'),
    generateText: async () => assert.fail('text already checkpointed'),
    generateImage: async prompt => { assert.doesNotMatch(prompt, /headshot/); resumedImages++; return { imageData: 'data:image/png;base64,aW1hZ2U=' }; }
  });
  assert.equal(resumedImages, 2);
  assert.equal(output.result.visuals.sales.count, 3);
});

test('ready-to-save checkpoint resumes without any provider or source call', async () => {
  let checkpoint;
  const output = await runGenerationPipeline({ input: { ...input, views: [strategies[0]], includeImages: false }, onCheckpoint: async value => { checkpoint = value; } }, adapters());
  const fail = async () => assert.fail('No provider call after completed checkpoint');
  const resumed = await runGenerationPipeline({ input, checkpoint, onCheckpoint: fail }, { fetchSource: fail, generateText: fail, generateImage: fail });
  assert.deepEqual(resumed, output);
  assert.equal(output.result.visuals.sales.state, 'not_requested');
});

test('image failures are explicit partial status and never substitute template imagery', async () => {
  const dependencies = adapters();
  let images = 0;
  dependencies.generateImage = async () => { if (++images > 1) throw Error('provider failed'); return { imageData: 'data:image/png;base64,aGVhZA==' }; };
  const output = await runGenerationPipeline({ input: { ...input, views: [strategies[0]] }, onCheckpoint: async () => {} }, dependencies);
  assert.equal(output.result.visuals.sales.state, 'partial');
  assert.equal(output.result.visuals.sales.failures.length, 2);
  assert.equal(output.project.payload.recommendations.items[0].image, '');
  assert.equal(output.project.payload.profile.photo, 'data:image/png;base64,aGVhZA==');
});

test('malformed AI never becomes a starter profile or image request', async () => {
  await assert.rejects(runGenerationPipeline({ input, onCheckpoint: async () => {} }, { ...adapters(), generateText: async () => '{}', generateImage: async () => assert.fail('invalid text must stop') }), error => error.code === 'invalid_ai_response');
});

test('saved persona export preserves inline images and exact tab; unavailable views fail closed', () => {
  const state = buildState(fixture(), { ...input, profileType: 'b2b' }, strategies[0]);
  state.profileType = 'b2b';
  state.accountViewTab = 'people';
  state.recommendations.items[0].image = 'data:image/png;base64,c2FsZXM=';
  const variant = clone(state.personaVariants.sales);
  variant.strategy = strategies[1];
  variant.accountViewTab = 'related';
  variant.recommendations.items[0].image = 'data:image/png;base64,c2VydmljZQ==';
  variant.railFields = [{ label: 'Service only', value: 'Yes' }];
  state.personaVariants.service = variant;
  const active = selectSavedView(state, 'sales');
  const service = selectSavedView(state, 'service');
  assert.equal(active.accountViewTab, 'people');
  assert.equal(service.accountViewTab, 'related');
  assert.equal(service.railFields[0].label, 'Service only');
  const html = renderSavedProfile(state, { persona: 'service', origin: 'https://upg.example' }).html;
  assert.match(html, /data:image\/png;base64,c2VydmljZQ==/);
  assert.doesNotMatch(html, /data:image\/png;base64,c2FsZXM=/);
  assert.throws(() => selectSavedView(state, 'marketing'), error => error.code === 'persona_not_found');
  assert.throws(() => selectSavedView(state, 'invalid'), error => error.code === 'invalid_persona');
  state.personaVariants.marketing = {};
  assert.throws(() => selectSavedView(state, 'marketing'), error => error.code === 'persona_not_renderable');
  delete variant.railFields;
  delete variant.accountViewTab;
  assert.deepEqual(selectSavedView(state, 'service').railFields, []);
  assert.equal(selectSavedView(state, 'service').accountViewTab, 'overview');
  assert.equal(state.accountViewTab, 'people'); // renderer does not mutate saved root
});

test('B2B creates persona action imagery without an individual portrait', async () => {
  const calls = {};
  const output = await runGenerationPipeline({ input: { ...input, profileType: 'b2b', views: [strategies[0]] }, onCheckpoint: async () => {} }, adapters(calls));
  assert.equal(calls.images.length, 2);
  assert.equal(output.project.payload.profile.photo, '');
  assert.equal(output.project.payload.account.name, 'Fictional Buyer');
  assert.equal(output.project.payload.account.employees, '');
});

test('oversized generated imagery is omitted with explicit budget failures and a saveable checkpoint', async () => {
  let checkpoint;
  const dependencies = adapters();
  dependencies.generateImage = async () => ({ imageData: 'data:image/png;base64,' + 'A'.repeat(19 * 1024 * 1024) });
  const output = await runGenerationPipeline({ input: { ...input, views: [strategies[0]] }, onCheckpoint: async value => { checkpoint = value; } }, dependencies);
  assert.equal(output.result.visuals.sales.state, 'failed');
  assert.ok(output.result.visuals.sales.failures.every(failure => failure.code === 'image_payload_budget'));
  assert.ok(Buffer.byteLength(JSON.stringify(checkpoint)) < 100000);
});

test('image call cap survives resume and skipped slots are partial, never ready', async () => {
  const many = fixture();
  many.recommendations.items = Array.from({ length: 20 }, (_, index) => ({ title: `Action ${index}`, cta: 'Review' }));
  let checkpoint;
  let calls = 0;
  const dependencies = { ...adapters(), generateText: async () => JSON.stringify(many), generateImage: async () => { calls++; return { imageData: 'data:image/png;base64,aW1hZ2U=' }; } };
  await assert.rejects(runGenerationPipeline({ input: { ...input, views: [strategies[0]] }, onCheckpoint: async (value, phase) => {
    checkpoint = value;
    if (phase === 'sales_rec_10_ready') throw Error('stop after twelfth image');
  } }, dependencies), /twelfth/);
  assert.equal(calls, 12);
  const output = await runGenerationPipeline({ input: { ...input, views: [strategies[0]] }, checkpoint, onCheckpoint: async () => {} }, { ...dependencies, generateImage: async () => assert.fail('cap must persist across resume') });
  assert.equal(output.result.visuals.sales.state, 'partial');
  assert.equal(output.result.visuals.sales.failures.length, 9);
});

test('unavailable source is explicit and the shared prompt receives URL-only context', async () => {
  const dependencies = adapters();
  dependencies.fetchSource = async () => { throw Object.assign(Error('blocked'), { code: 'blocked_host' }); };
  const output = await runGenerationPipeline({ input: { ...input, views: [strategies[0]], includeImages: false }, onCheckpoint: async () => {} }, dependencies);
  assert.equal(output.result.sourceFallback, 'blocked_host');
});
