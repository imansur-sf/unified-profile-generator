'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contract = require('../js/profile-contract');

const ROOT = path.resolve(__dirname, '..');
const VIEW_FIELDS = ['insights', 'affinities', 'preferences', 'events', 'membership', 'recommendations', 'activity', 'extraCards', 'rightExtraCards', 'b2cSections', 'b2bSections', 'accountViewTab', 'railFields'];
const LENSES = ['sales', 'service', 'marketing', 'success', 'custom'];
const clone = value => JSON.parse(JSON.stringify(value));
let runtime;

function getRuntime() {
  if (runtime) return runtime;
  // Load only trusted application code. Browser adapters are never called here;
  // text/image prompt builders and the renderer are shared with the editor.
  const context = vm.createContext({ window: {}, URL, UPGContract: contract, console: { log() {}, warn() {}, error() {} } });
  for (const file of ['defaults.js', 'generator.js', 'brand-logo.js', 'pagehost.js', 'localai.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', file), 'utf8'), context, { filename: file });
  }
  runtime = {
    cloneProfileMode: vm.runInContext('cloneProfileMode', context),
    generateProfileHTML: vm.runInContext('generateProfileHTML', context),
    prompts: context.window.UPG_Shared,
    images: context.window.LocalAI
  };
  return runtime;
}

function snapshotView(state) {
  const view = { strategy: clone(state.profileStrategy) };
  for (const field of VIEW_FIELDS) if (state[field] !== undefined) view[field] = clone(state[field]);
  return view;
}

function emptyRecord(record) {
  return Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [key, typeof value === 'boolean' ? false : '']));
}

function cards(values, lens, column) {
  return (values || []).map((card, index) => ({
    ...clone(card), moduleId: `ai-${lens}-${column}-${index + 1}`, origin: 'ai',
    placement: column, visibility: column === 'middle' && index === 0 ? 'visible' : 'suggested'
  }));
}

function applyView(state, ai, strategy) {
  for (const key of ['insights', 'affinities', 'preferences', 'events', 'membership', 'recommendations', 'activity']) {
    state[key] = Object.assign({}, state[key], clone(ai[key]));
  }
  state.recommendations.items = state.recommendations.items.map(item => ({ ...item, image: '', imageSource: 'pending', imageForTitle: item.title }));
  state.extraCards = cards(ai.extraCards, strategy.lens, 'middle');
  state.rightExtraCards = cards(ai.rightExtraCards, strategy.lens, 'right');
  state.railFields = clone(ai.railFields || []);
  state.accountViewTab = 'overview';
  state.profileStrategy = clone(strategy);
  return state;
}

function buildState(ai, input, strategy) {
  contract.validateAIProfile(ai, { profileType: input.profileType });
  ai = clone(ai);
  const industry = ['recruiting', 'retail', 'healthcare', 'financial', 'generic'].includes(ai.industry) ? ai.industry : 'generic';
  const state = clone(getRuntime().cloneProfileMode(input.profileType, industry));
  // Templates supply editor structure only; missing modeled facts stay unknown.
  for (const key of ['profile', 'loyalty', 'account', 'accountMetrics']) state[key] = { ...emptyRecord(state[key]), ...(ai[key] ? clone(ai[key]) : {}) };
  state.profile.photo = '';
  state.logo = '';
  state.userAvatar = '';
  delete state._starterProfile;
  state.schemaVersion = 2;
  state.profileType = input.profileType;
  state._industry = industry;
  state.brandName = ai.brandName;
  state.appName = ai.appName || (input.profileType === 'b2b' ? 'Data Cloud' : 'Customer 360');
  state.tabName = ai.tabName || (input.profileType === 'b2b' ? state.account.name : state.profile.name);
  if (Array.isArray(ai.navLinks)) state.navLinks = ai.navLinks.filter(value => typeof value === 'string');
  for (const key of ['primary', 'secondary']) if (/^#[0-9a-f]{6}$/i.test(ai.colors?.[key] || '')) state.colors[key] = ai.colors[key];
  Object.assign(state.colors, { accent: '#FFFFFF', menu: '#FFFFFF', menuText: '#000000' });
  state._aiContext = { sourceUrl: input.url, provider: 'shared-backend', analyzedAt: new Date().toISOString() };
  state.profileSet = { selectedLenses: input.views.map(view => view.lens), briefs: Object.fromEntries(input.views.map(view => [view.lens, view.brief])), statuses: {}, visuals: {}, customRole: input.views.find(view => view.lens === 'custom')?.customRole || '' };
  state.personaVariants = {};
  applyView(state, ai, strategy);
  state.personaVariants[strategy.lens] = snapshotView(state);
  return state;
}

function addView(state, ai, strategy) {
  contract.validateAIProfile(ai, { profileType: state.profileType, overlay: true });
  ai = clone(ai);
  const working = applyView(clone(state), ai, strategy);
  state.personaVariants[strategy.lens] = snapshotView(working);
}

function selectSavedView(payload, persona) {
  const snapshot = clone(payload);
  contract.validateSavedProfile(snapshot);
  const active = snapshot.profileStrategy?.lens || 'sales';
  const lens = persona || active;
  if (!LENSES.includes(lens)) throw Object.assign(new Error('invalid_persona'), { code: 'invalid_persona', status: 400 });
  if (lens !== active) {
    const variant = snapshot.personaVariants?.[lens];
    if (!variant) throw Object.assign(new Error('persona_not_found'), { code: 'persona_not_found', status: 404 });
    for (const field of ['insights', 'affinities', 'preferences', 'events', 'membership', 'recommendations', 'activity']) {
      if (!variant[field] || typeof variant[field] !== 'object') throw Object.assign(new Error('persona_not_renderable'), { code: 'persona_not_renderable', status: 422 });
    }
    snapshot.railFields = [];
    snapshot.accountViewTab = 'overview';
    for (const field of VIEW_FIELDS) if (variant[field] !== undefined) snapshot[field] = clone(variant[field]);
    snapshot.profileStrategy = { ...variant.strategy, lens };
  }
  delete snapshot.integrationArtifact;
  contract.validateSavedProfile(snapshot);
  return snapshot;
}

function embedBundledAssets(html, origin) {
  const assetsRoot = path.join(ROOT, 'assets');
  const cached = new Map();
  return html.replace(/(src=["'])(assets\/[^"']+)/g, (match, prefix, relative) => {
    if (!cached.has(relative)) {
      const candidate = path.resolve(ROOT, relative);
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }[path.extname(candidate).toLowerCase()];
      if (!candidate.startsWith(assetsRoot + path.sep) || !mime) return `${prefix}${new URL(relative, origin).href}`;
      try {
        const data = fs.readFileSync(candidate);
        cached.set(relative, data.length <= 1024 * 1024 ? `data:${mime};base64,${data.toString('base64')}` : new URL(relative, origin).href);
      } catch (_) { cached.set(relative, new URL(relative, origin).href); }
    }
    return prefix + cached.get(relative);
  });
}

function renderSavedProfile(payload, { persona, origin }) {
  const snapshot = selectSavedView(payload, persona);
  const html = embedBundledAssets(getRuntime().generateProfileHTML(snapshot), origin);
  return { html, persona: snapshot.profileStrategy?.lens || 'sales', subject: snapshot.profileType === 'b2b' ? snapshot.account?.name : snapshot.profile?.name };
}

function integrationArtifact(state) {
  return {
    schemaVersion: 'upg.profile.v1', generatedAt: new Date().toISOString(), profileType: state.profileType,
    persona: state.profileStrategy.lens, availablePersonas: Object.keys(state.personaVariants),
    subject: state.profileType === 'b2b' ? state.account.name : state.profile.name,
    brand: { name: state.brandName, appName: state.appName, colors: state.colors },
    renderedHtml: '', renderStatus: 'renderable'
  };
}

module.exports = { getRuntime, VIEW_FIELDS, LENSES, snapshotView, buildState, addView, selectSavedView, renderSavedProfile, integrationArtifact };
