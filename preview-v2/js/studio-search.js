// Local editor navigation only: no generation, profile mutations or requests.
(function () {
  'use strict';
  const sections = ['Customer', 'Identity', 'Insights', 'Signals', 'Modules', 'Recommendations', 'Export'];
  const sharedBrandFields = new Set(['brand-name', 'brand-industry', 'app-name', 'url-logo', 'url-user-avatar', 'color-primary', 'hex-primary', 'color-accent', 'hex-accent', 'color-secondary', 'hex-secondary', 'color-menu', 'hex-menu', 'color-menuText', 'hex-menuText', 'color-pageBg', 'hex-pageBg', 'left-col-w', 'middle-col-w', 'right-col-w', 'quickstart-url']);
  const clean = value => String(value || '').replace(/(?:data|blob):\S+/gi, '').replace(/\s+/g, ' ').trim();
  const fold = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const get = id => document.getElementById(id);
  let initialized = false, current = [], active = -1, refreshTimer, highlightTimer, highlighted, origin, shownQuery = '';
  let input, popover, results, empty, status, context;

  function scope() {
    const owner = typeof state === 'undefined' ? null : state;
    const strategy = typeof getProfileStrategy === 'function' ? getProfileStrategy() : {};
    return { owner, mode: owner?.profileType || (document.body.classList.contains('profile-mode-b2b') ? 'b2b' : 'b2c'), lens: strategy.lens || 'sales' };
  }
  function sameScope(left, right) {
    return left && left.owner === right.owner && left.mode === right.mode && left.lens === right.lens;
  }
  function allowed(node, selected) {
    if (!node.isConnected || node.disabled || node.closest('.quickstart-settings, #studio-search')) return false;
    if (node.matches('input[type="hidden"], input[type="password"], input[type="file"], input[type="button"], input[type="submit"]')) return false;
    if (node.closest(selected.mode === 'b2b' ? '.mode-b2c' : '.mode-b2b')) return false;
    for (let ancestor = node; ancestor && !ancestor.classList.contains('step-panel'); ancestor = ancestor.parentElement) {
      if (ancestor.hidden || ancestor.classList.contains('hidden')) return false;
    }
    return true;
  }
  function fieldValue(node) {
    if (node.tagName === 'SELECT') return clean(node.selectedOptions[0]?.textContent);
    if (node.matches('[type="checkbox"], [type="radio"]')) return node.checked ? 'Selected' : 'Not selected';
    const imageField = /(?:image|avatar|photo|icon|logo).*url|url.*(?:image|avatar|photo|icon|logo)|^url-(?:logo|avatar|photo|user-avatar|account-avatar)$/i.test([node.id, node.placeholder, node.getAttribute('aria-label')].join(' '));
    return imageField ? clean(node.value).replace(/https?:\S+/gi, '').trim() : clean(node.value);
  }
  function describe(node, panel) {
    const labels = [...(node.labels || [])].map(label => clean(label.textContent)).filter(Boolean);
    const label = labels.join(' ') || clean(node.placeholder) || clean(node.getAttribute('aria-label')) || clean(node.id.replace(/[-_]/g, ' ')) || 'Editable field';
    const card = node.closest('.row-card');
    const cardTitle = clean(card?.querySelector('input[placeholder="Card title"], input[placeholder="Title"]')?.value);
    const row = node.parentElement;
    const siblings = [...row.querySelectorAll(':scope > input, :scope > textarea')];
    const labelControl = siblings.find(item => item.placeholder === 'Label') || siblings.find(item => !/icon|emoji/i.test(item.placeholder || '') && item.type !== 'color');
    const rowLabel = siblings.length > 1 && labelControl && labelControl !== node ? fieldValue(labelControl) : '';
    const headings = [...panel.querySelectorAll('h3, h4')];
    const heading = clean(headings.filter(item => item.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)?.textContent);
    const visibility = card?.querySelector('select[aria-label$=" visibility"]')?.value;
    const badge = visibility === 'suggested' ? 'Suggested module' : visibility === 'hidden' ? 'Hidden module' : '';
    const step = Number(panel.dataset.step);
    const title = rowLabel ? `${rowLabel} · ${label}` : label;
    const shared = (step === 1 && !node.closest('#rail-fields-container')) || sharedBrandFields.has(node.id);
    const path = [sections[step], cardTitle || heading, shared ? 'Shared' : '', badge].filter(Boolean).join(' › ');
    const value = fieldValue(node);
    return { node, step, title, path, value, haystack: fold([title, path, value].join(' ')) };
  }
  function index(selected) {
    const entries = [];
    document.querySelectorAll('#wizard-col .step-panel[data-step]').forEach(panel => {
      panel.querySelectorAll('input, textarea, select').forEach(node => {
        if (allowed(node, selected)) entries.push(describe(node, panel));
      });
    });
    return entries;
  }
  function announce(message) { status.textContent = message; }
  function close() {
    popover.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function select(position) {
    active = position;
    [...results.children].forEach((node, i) => node.setAttribute('aria-selected', String(i === active)));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', results.children[active].id);
      results.children[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function snippet(value, query) {
    const normalized = fold(value), location = normalized.indexOf(query[0] || '');
    const start = Math.max(0, location - 35);
    return `${start ? '…' : ''}${value.slice(start, start + 150)}${value.length > start + 150 ? '…' : ''}`;
  }
  function show(preserveSelection = false) {
    const selectedScope = scope();
    const query = fold(input.value).split(/\s+/).filter(Boolean);
    const selectedNode = preserveSelection === true && !popover.hidden && sameScope(origin, selectedScope) && shownQuery === input.value ? current[active]?.node : null;
    origin = selectedScope;
    shownQuery = input.value;
    current = query.length ? index(origin).filter(item => query.every(word => item.haystack.includes(word))) : [];
    current.sort((a, b) => Number(fold(b.value).includes(query.join(' '))) - Number(fold(a.value).includes(query.join(' '))));
    const total = current.length;
    current = current.slice(0, 30);
    results.replaceChildren();
    current.forEach((item, i) => {
      const option = document.createElement('div');
      option.id = `studio-search-option-${i}`;
      option.className = 'studio-search-result';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      [['title', item.title], ['path', item.path], ['snippet', snippet(item.value, query)]].forEach(([kind, text]) => {
        if (!text) return;
        const part = document.createElement('span');
        part.className = `studio-search-result-${kind}`;
        part.textContent = text;
        option.appendChild(part);
      });
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => activate(item));
      results.appendChild(option);
    });
    const label = typeof getProfileStrategyLabel === 'function' ? getProfileStrategyLabel(typeof getProfileStrategy === 'function' ? getProfileStrategy() : { lens: origin.lens }) : origin.lens === 'success' ? 'Customer Success' : origin.lens.charAt(0).toUpperCase() + origin.lens.slice(1);
    context.textContent = `Searching ${label} and shared settings`;
    empty.hidden = Boolean(total);
    empty.textContent = query.length ? 'No editable field found. Try a shorter phrase, a field name, or another view.' : 'Search a field name or text from your profile, such as “logo” or “membership”.';
    popover.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    select(selectedNode ? current.findIndex(item => item.node === selectedNode) : -1);
    announce(query.length ? `${total} matching fields${total > 30 ? '. Showing the first 30; narrow your search for more.' : '.'}` : 'Search the current view and shared settings.');
  }
  function activate(item) {
    if (!sameScope(origin, scope()) || !allowed(item.node, scope())) {
      show();
      announce('The editor changed. Results refreshed; select a field again.');
      return;
    }
    const target = item.node;
    close();
    window.studioTogglePreviewFocus?.(false);
    if (typeof goToStep === 'function') goToStep(item.step, { focus: false, scroll: false });
    for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    }
    if (!target.isConnected) { announce('The editor changed. Search again to find this field.'); input.focus(); return; }
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (highlighted) highlighted.classList.remove('studio-search-target');
    highlighted = target;
    target.classList.add('studio-search-target');
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => { target.classList.remove('studio-search-target'); if (highlighted === target) highlighted = null; }, 1800);
    announce(`Opened ${item.title}. ${item.path}.`);
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (!popover.hidden) show(true); }, 80);
  }
  function initialize() {
    if (initialized || !get('studio-search-input')) return;
    initialized = true;
    input = get('studio-search-input'); popover = get('studio-search-popover');
    results = get('studio-search-results'); empty = get('studio-search-empty');
    status = get('studio-search-status'); context = get('studio-search-context');
    const shortcut = get('studio-search-shortcut');
    if (shortcut) shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (popover.hidden) show();
        if (current.length) select(event.key === 'ArrowDown' ? (active + 1) % current.length : (active < 0 ? current.length - 1 : (active + current.length - 1) % current.length));
      } else if (event.key === 'Enter' && !popover.hidden) {
        event.preventDefault();
        if (current.length) activate(current[active < 0 ? 0 : active]);
      } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === 'Tab') close();
    });
    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k' && !document.querySelector('[role="dialog"]:not(.hidden):not([hidden]), dialog[open]')) {
        event.preventDefault(); window.studioTogglePreviewFocus?.(false); input.focus(); input.select(); show();
      }
    });
    document.addEventListener('pointerdown', event => { if (!get('studio-search').contains(event.target)) close(); });
    document.addEventListener('focusin', event => { if (!get('studio-search').contains(event.target)) close(); });
    const wizard = get('wizard-col');
    ['input', 'change'].forEach(name => wizard.addEventListener(name, event => { if (!event.target.closest('#studio-search')) scheduleRefresh(); }));
    new MutationObserver(records => {
      if (records.some(record => !record.target.closest?.('#studio-search'))) scheduleRefresh();
    }).observe(wizard, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'disabled'], characterData: true });
    window.refreshStudioSearch = scheduleRefresh;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
