'use strict';

const { getRuntime, buildState, addView, snapshotView, selectSavedView, integrationArtifact } = require('./profile-runtime');
const clone = value => JSON.parse(JSON.stringify(value));
const MAX_CHECKPOINT_BYTES = 18 * 1024 * 1024;
const MAX_IMAGES_PER_VIEW = 12;

async function runGenerationPipeline({ input, checkpoint = {}, onCheckpoint, signal }, { fetchSource, generateText, generateImage, fetchLogo }) {
  const saved = clone(checkpoint || {});
  if (saved.version !== undefined && saved.version !== 1) throw Object.assign(new Error('unsupported_checkpoint'), { code: 'unsupported_checkpoint' });
  saved.version = 1;
  const persist = async phase => {
    signal?.throwIfAborted();
    await onCheckpoint(clone(saved), phase);
  };
  const { prompts, images } = getRuntime();
  if (saved.project) return { project: saved.project, result: saved.result };
  if (!saved.source) {
    signal?.throwIfAborted();
    try { saved.source = await fetchSource(input.url); }
    catch (error) { saved.source = { url: input.url, title: '', description: '', headings: '', navLinkCandidates: [], bodyText: '', scrapeFallback: error.code || 'scrape_failed' }; }
    await persist('customer_context_ready');
  }
  saved.textViews ||= [];
  saved.imageViews ||= [];
  saved.imageProgress ||= {};
  for (const strategy of input.views) {
    const lens = strategy.lens;
    if (!saved.textViews.includes(lens)) {
      signal?.throwIfAborted();
      const identity = saved.state && (input.profileType === 'b2b'
        ? { brandName: saved.state.brandName, account: saved.state.account, accountMetrics: saved.state.accountMetrics }
        : { brandName: saved.state.brandName, profile: saved.state.profile, loyalty: saved.state.loyalty });
      const prompt = saved.state
        ? prompts.buildPersonaOverlayPrompt(saved.source, identity, { profileType: input.profileType, strategy })
        : prompts.buildUserPrompt(saved.source, { profileType: input.profileType, strategy });
      const text = await generateText({ prompt, system: prompts.getSystemPrompt(input.profileType), tier: input.tier, signal });
      let ai;
      try { ai = prompts.parseAIResponseText(text); }
      catch (_) { throw Object.assign(new Error('invalid_ai_response'), { code: 'invalid_ai_response' }); }
      if (!saved.state) saved.state = buildState(ai, input, strategy);
      else addView(saved.state, ai, strategy);
      saved.state.profileSet.statuses[lens] = 'ready';
      saved.textViews.push(lens);
      await persist(`${lens}_text_ready`);
    }
    if (!saved.imageViews.includes(lens)) {
      signal?.throwIfAborted();
      const view = selectSavedView(saved.state, lens);
      const options = { brandName: saved.state.brandName, industry: saved.state._industry, profileType: input.profileType, recommendations: view.recommendations.items, strategy };
      const imagePrompts = !input.includeImages ? [] : lens === input.views[0].lens
        ? images.buildImagePrompts({ ...view, industry: saved.state._industry }, input.profileType, strategy)
        : images.buildRecommendationImagePrompts(options);
      const progress = saved.imageProgress[lens] ||= { completedSlots: [], generated: 0, failures: [], attempted: 0 };
      progress.attempted ??= progress.completedSlots.length;
      const saveView = () => {
        saved.state.personaVariants[lens] = snapshotView(view);
        if (saved.state.profileStrategy.lens === lens) {
          saved.state.recommendations = clone(view.recommendations);
          // The active root is authoritative; avoid duplicating inline images.
          saved.state.personaVariants[lens].recommendations.items.forEach(item => { item.image = ''; });
        }
      };
      for (const item of imagePrompts) {
        if (progress.completedSlots.includes(item.slot)) continue;
        signal?.throwIfAborted();
        if (progress.attempted >= MAX_IMAGES_PER_VIEW) {
          progress.completedSlots.push(item.slot);
          progress.failures.push({ slot: item.slot, code: 'image_batch_limit' });
          continue;
        }
        try {
          // Reserve room for the remaining bounded text responses and their
          // persona snapshots before spending the remaining budget on imagery.
          const imageBudget = MAX_CHECKPOINT_BYTES - (input.views.length - saved.textViews.length) * 2 * 1024 * 1024;
          if (Buffer.byteLength(JSON.stringify(saved)) >= imageBudget) throw Object.assign(new Error('image_payload_budget'), { code: 'image_payload_budget' });
          progress.attempted++;
          const result = await generateImage(item.prompt, signal);
          if (!result?.imageData) throw new Error('empty_image');
          if (Buffer.byteLength(JSON.stringify(saved)) + Buffer.byteLength(result.imageData) > imageBudget) throw Object.assign(new Error('image_payload_budget'), { code: 'image_payload_budget' });
          if (item.slot === 'profile_photo') saved.state.profile.photo = result.imageData;
          else {
            const index = Number(item.slot.replace('rec_', ''));
            const recommendation = view.recommendations.items[index];
            if (recommendation) Object.assign(recommendation, { image: result.imageData, imageSource: 'generated', imageForTitle: recommendation.title });
          }
          progress.generated++;
        } catch (error) {
          signal?.throwIfAborted();
          progress.failures.push({ slot: item.slot, code: error.code || 'image_generation_failed' });
        }
        progress.completedSlots.push(item.slot);
        saveView();
        await persist(`${lens}_${item.slot}_ready`);
      }
      saveView();
      const { generated, failures } = progress;
      saved.state.profileSet.visuals[lens] = {
        state: !input.includeImages ? 'not_requested' : failures.length ? generated ? 'partial' : 'failed' : 'ready',
        count: generated, failures, message: failures.length ? 'Some images could not be generated. Open this profile in UPG to retry visuals.' : ''
      };
      saved.imageViews.push(lens);
      await persist(`${lens}_images_ready`);
    }
  }
  if (!saved.logoChecked) {
    const candidates = [...new Set([...(saved.source.logoCandidates || []), saved.source.favicon].filter(value => typeof value === 'string' && value))].slice(0, 6);
    saved.state._aiContext.logoCandidates = candidates;
    if (fetchLogo) for (const candidate of candidates) {
      signal?.throwIfAborted();
      try {
        const image = await fetchLogo(candidate);
        // Preserve the renderer's raster-only data contract, even if an older
        // backend returns an unsupported vector/icon payload.
        if (!/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(image || '')) continue;
        saved.state.logo = image;
        break;
      } catch (_) { /* Try the next candidate; branding never invalidates content. */ }
    }
    saved.logoChecked = true;
    await persist('branding_ready');
  }
  saved.state.integrationArtifact = integrationArtifact(saved.state);
  const subject = input.profileType === 'b2b' ? saved.state.account.name : saved.state.profile.name;
  saved.project = { name: input.projectName || `${saved.state.brandName} — ${subject}`.slice(0, 160), payload: saved.state, sourceUrl: input.url };
  saved.result = { personas: input.views.map(view => view.lens), visuals: saved.state.profileSet.visuals, sourceFallback: saved.source.scrapeFallback || null };
  // Avoid serializing a second complete image-bearing copy into the checkpoint.
  delete saved.state;
  await persist('ready_to_save');
  return { project: saved.project, result: saved.result };
}

module.exports = { runGenerationPipeline };
