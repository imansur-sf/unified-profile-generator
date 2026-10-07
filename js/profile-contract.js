// Shared validation for browser, REST and MCP generation. Never repair a
// malformed response by silently presenting a different sample customer.
(function (root, factory) {
  const contract = factory();
  if (typeof module === 'object' && module.exports) module.exports = contract;
  else root.UPGContract = contract;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const fields = {
    insights: ['label', 'value'], preferences: ['label', 'value'],
    events: ['name'], membership: ['label', 'value'],
    recommendations: ['title', 'cta'], activity: ['title', 'body']
  };
  function invalid(message) {
    const error = new Error(`The generated profile is incomplete: ${message}. Retry this view; your existing work has been kept.`);
    error.code = 'invalid_ai_response';
    throw error;
  }
  function validateAIProfile(data, options = {}) {
    if (!object(data)) invalid('expected a profile object');
    if (!options.overlay) {
      if (!text(data.brandName)) invalid('company name is missing');
      const identity = options.profileType === 'b2b' ? data.account : data.profile;
      if (!object(identity) || !text(identity.name)) invalid('customer identity is missing');
    }
    for (const [section, required] of Object.entries(fields)) {
      const items = data[section]?.items;
      if (!Array.isArray(items) || !items.length || items.length > 100) invalid(`${section} needs valid content`);
      if (items.some(item => !object(item) || required.some(key => !text(item[key])))) invalid(`${section} contains incomplete rows`);
    }
    const groups = data.affinities?.groups;
    if (!Array.isArray(groups) || !groups.length || groups.length > 30) invalid('signal groups are missing');
    for (const group of groups) {
      if (!object(group) || !text(group.name) || !Array.isArray(group.items) || !group.items.length) invalid('signal group is incomplete');
      for (const item of group.items) {
        if (!object(item) || !text(item.label) || ['a', 'b'].some(key => typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key] < 0 || item[key] > 100)) invalid('signal scores must be numbers between 0 and 100');
      }
    }
    for (const key of ['extraCards', 'rightExtraCards']) {
      if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some(card => !object(card) || !text(card.title) || !Array.isArray(card.items) || card.items.some(item => !object(item) || !text(item.label) || typeof item.value !== 'string')))) invalid('additional module has invalid fields');
    }
    if (data.railFields !== undefined && (!Array.isArray(data.railFields) || data.railFields.length > 30 || data.railFields.some(field => !object(field) || !text(field.label) || typeof field.value !== 'string'))) invalid('profile-card fields must have a label and value');
    return data;
  }
  function validateSavedProfile(data) {
    if (!object(data) || !object(data.colors) || !object(data.profile) || !object(data.loyalty)) throw new Error('This file is not a valid Unified Profile Generator project.');
    if (data.profileType === 'b2b' && !object(data.account)) throw new Error('This saved project is missing its account.');
    for (const section of ['profile', 'loyalty', 'colors']) {
      if (Object.values(data[section]).some(value => value != null && !['string', 'number', 'boolean'].includes(typeof value))) throw new Error(`This saved project has invalid ${section} fields.`);
    }
    if (data.profile.photo != null && typeof data.profile.photo !== 'string') throw new Error('This saved project has an invalid photo.');
    if (data.navLinks != null && (!Array.isArray(data.navLinks) || data.navLinks.some(value => typeof value !== 'string'))) throw new Error('This saved project has invalid navigation.');
    for (const section of Object.keys(fields)) {
      if (!object(data[section]) || !Array.isArray(data[section].items) || data[section].items.some(item => !object(item))) throw new Error(`This saved project has invalid ${section} data.`);
    }
    if (!object(data.affinities) || !object(data.affinities.seriesA) || !object(data.affinities.seriesB) || !Array.isArray(data.affinities.groups) || data.affinities.groups.some(group => !object(group) || !Array.isArray(group.items) || group.items.some(item => !object(item)))) throw new Error('This saved project has invalid signal data.');
    for (const key of ['extraCards', 'rightExtraCards']) {
      if (data[key] != null && (!Array.isArray(data[key]) || data[key].some(card => !object(card) || !Array.isArray(card.items) || card.items.some(item => !object(item))))) throw new Error('This saved project has invalid additional modules.');
    }
    if (data.personaVariants != null && (!object(data.personaVariants) || Object.values(data.personaVariants).some(view => !object(view)))) throw new Error('This saved project has invalid persona views.');
    if (data.railFields != null && (!Array.isArray(data.railFields) || data.railFields.some(field => !object(field) || typeof field.label !== 'string' || typeof field.value !== 'string'))) throw new Error('This saved project has invalid profile-card fields.');
    return data;
  }
  function textIdentity(data) {
    const clean = (value, depth = 0) => {
      if (depth > 5) return undefined;
      if (typeof value === 'string') return /^data:/i.test(value) ? undefined : value.slice(0, 700);
      if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
      if (Array.isArray(value)) return value.slice(0, 30).map(item => clean(item, depth + 1));
      if (object(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !['photo', 'image', 'logo', 'userAvatar', '__proto__', 'constructor', 'prototype'].includes(key)).map(([key, item]) => [key, clean(item, depth + 1)]));
      return undefined;
    };
    return clean(data);
  }
  function companyKey(raw) {
    if (!raw) return '';
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      // Keep tenant/path identity; normalize only harmless variations.
      return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.port ? ':' + url.port : ''}${url.pathname.replace(/\/+$/, '')}`;
    } catch (_) { return ''; }
  }
  function canonicalJSON(value) {
    const sorted = item => Array.isArray(item) ? item.map(sorted) : object(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item;
    return JSON.stringify(sorted(value));
  }
  return { validateAIProfile, validateSavedProfile, textIdentity, companyKey, canonicalJSON };
});
