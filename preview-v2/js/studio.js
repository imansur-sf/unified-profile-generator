// Preview-only workspace chrome. The shared renderer and editor handlers remain
// the source of truth; this layer never changes profile data or saves projects.
(function () {
  'use strict';
  const get = id => document.getElementById(id);
  let previewFocused = false;
  let initialGenerationSeen = false;
  let resizeFrame = 0;

  function setLabel(id, value) {
    const element = get(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function fitStudioPreview() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (typeof fitPreviewScale === 'function') fitPreviewScale();
    });
  }

  function reducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  window.renderStudioUI = function () {
    if (typeof getProfileStrategy !== 'function' || typeof state === 'undefined') return;
    const strategy = getProfileStrategy();
    const label = getProfileStrategyLabel(strategy);
    setLabel('studio-preview-title', `${label} preview`);
    setLabel('studio-personalize-label', `Personalize ${label}`);
    setLabel('studio-personalize-scope', `Only the ${label} view will change. Brand and customer identity are shared across your profile set.`);
    setLabel('studio-project-name', state.brandName ? `${state.brandName} · ${state.profileType === 'b2b' ? 'Account' : 'Individual'} profiles` : 'Your customer workspace');
    const selected = [...document.querySelectorAll('.profile-set-choices input:checked')];
    setLabel('studio-view-set-summary', `${selected.length} selected`);
    const create = get('quickstart-btn');
    const creating = typeof isProfileSetGenerationRunning === 'function' ? isProfileSetGenerationRunning() : create?.disabled;
    if (create && !creating) {
      create.disabled = !selected.length;
      setLabel('quickstart-btn', selected.length ? `Create ${selected.length} ${selected.length === 1 ? 'view' : 'views'} →` : 'Choose at least one view');
    }
    const viewSet = get('studio-view-set');
    const statuses = state.profileSet?.statuses || {};
    const progress = get('profile-set-progress');
    // Sample-only rows repeat the persona choices without conveying progress.
    // Real jobs and image retries always expose their status and recovery actions.
    const activeOrFailed = Object.values(statuses).some(value => ['queued', 'generating', 'template-ready', 'failed'].includes(value))
      || Object.values(state.profileSet?.visuals || {}).some(visual => ['queued', 'generating', 'pending', 'partial', 'failed', 'stopped'].includes(visual.state));
    if (progress) progress.hidden = !activeOrFailed;
    // Collapse the creation choices once the first real set finishes. Respect
    // the user's later disclosure choices; never snap shut on every update.
    if (!initialGenerationSeen && Object.values(statuses).some(value => value === 'ready')) {
      initialGenerationSeen = true;
      if (viewSet && !viewSet.contains(document.activeElement)) viewSet.open = false;
    }
    // Step navigation should always reveal its inspector if focus mode was on.
    const navigation = document.activeElement?.closest?.('#step-indicators');
    if (navigation && previewFocused) window.studioTogglePreviewFocus(false);
    window.refreshStudioSearch?.();
  };

  window.studioTogglePreviewFocus = function (force) {
    previewFocused = typeof force === 'boolean' ? force : !previewFocused;
    document.body.classList.toggle('studio-preview-focused', previewFocused);
    const control = get('studio-focus-preview');
    if (control) {
      control.setAttribute('aria-pressed', String(previewFocused));
      control.textContent = previewFocused ? 'Show editor' : 'Focus preview';
    }
    fitStudioPreview();
  };

  window.studioPersonalizeView = function () {
    window.studioTogglePreviewFocus(false);
    goToStep(0);
    requestAnimationFrame(() => {
      get('studio-personalize-panel')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      get('strategy-brief')?.focus({ preventScroll: true });
    });
  };

  window.studioExport = function (action) {
    const menu = get('studio-export');
    if (menu) menu.open = false;
    if (action === 'download') downloadHTML();
    else if (action === 'copy') copyHTML();
    else if (action === 'cloudy') exportForCloudy();
    else if (action === 'help') {
      window.studioTogglePreviewFocus(false);
      goToStep(6);
    }
  };

  function initializeStudio() {
    // Header actions work from every editing section. Reuse their existing
    // live regions in a global feedback area, not inside the hidden export step.
    const feedback = get('studio-action-feedback');
    ['save-project-success', 'copy-success', 'cloudy-hint'].forEach(id => {
      const status = get(id);
      if (feedback && status) feedback.appendChild(status);
    });
    document.querySelectorAll('.profile-set-choices input').forEach(input => input.addEventListener('change', window.renderStudioUI));
    // Keep the existing seven-step flows, but give export actions enough room
    // in the narrower inspector instead of squeezing three long labels.
    document.querySelectorAll('[data-step="6"] .flex').forEach(row => {
      if ([...row.children].filter(child => child.tagName === 'BUTTON').length > 1) row.classList.add('studio-export-actions');
    });
    document.querySelectorAll('#step-indicators .step-dot').forEach(button => {
      button.addEventListener('click', () => window.studioTogglePreviewFocus(false));
    });
    const exportMenu = get('studio-export');
    document.addEventListener('click', event => {
      if (exportMenu?.open && !exportMenu.contains(event.target)) exportMenu.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && exportMenu?.open) {
        exportMenu.open = false;
        exportMenu.querySelector('summary')?.focus();
        event.preventDefault();
      } else if (event.key === 'Escape' && previewFocused && !document.querySelector('[role="dialog"]:not(.hidden)')) {
        window.studioTogglePreviewFocus(false);
        get('studio-focus-preview')?.focus();
      }
    });
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(fitStudioPreview);
      const stage = get('preview-stage');
      if (stage) observer.observe(stage);
    }
    // A focused desktop layout must not hide the editor after switching to a
    // narrow window, where the focus-mode control is intentionally omitted.
    const compact = window.matchMedia?.('(max-width: 999px)');
    compact?.addEventListener?.('change', event => {
      if (event.matches && previewFocused) window.studioTogglePreviewFocus(false);
    });
    window.renderStudioUI();
    fitStudioPreview();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeStudio);
  else initializeStudio();
})();
