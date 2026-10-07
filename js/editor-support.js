// Editor-only behavior. None of this is included in exported customer profiles.
const dialogStack = [];
function activateDialogFocus(id, close, initialFocusId) {
  const dialog = document.getElementById(id);
  if (!dialog || dialogStack.some(item => item.id === id)) return;
  const entry = { id, dialog, close, prior: document.activeElement, selfInert: dialog.inert, inert: [] };
  // A sibling modal opened over another dialog was inerted by its parent.
  dialog.inert = false;
  Array.from(document.body.children).forEach(element => {
    if (element === dialog || element.contains(dialog)) return;
    entry.inert.push([element, element.inert]); element.inert = true;
  });
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1;
  entry.keydown = event => {
    if (dialogStack.at(-1) !== entry) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], iframe, [tabindex="0"]')]
      .filter(el => !el.disabled && !el.closest('[hidden], .hidden') && el.getClientRects().length);
    const first = controls[0] || dialog, last = controls.at(-1) || dialog;
    if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  dialogStack.push(entry); document.addEventListener('keydown', entry.keydown);
  (document.getElementById(initialFocusId) || dialog.querySelector('button, input, textarea') || dialog).focus();
}
function releaseDialogFocus(id) {
  const index = dialogStack.findIndex(item => item.id === id);
  if (index < 0) return;
  const [entry] = dialogStack.splice(index, 1);
  document.removeEventListener('keydown', entry.keydown);
  entry.inert.forEach(([element, value]) => { element.inert = value; });
  entry.dialog.inert = entry.selfInert;
  if (entry.prior?.isConnected) entry.prior.focus();
}

// Labels are stable and contextual, including dynamically added row editors.
function labelEditorControls() {
  document.querySelectorAll('.step-panel input, .step-panel textarea, .step-panel select').forEach((input, index) => {
    if (input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.labels?.length) return;
    const row = input.closest('.row-card');
    const panel = input.closest('.step-panel');
    const context = row?.querySelector('strong')?.textContent || panel?.querySelector('h2')?.textContent || 'Profile';
    input.setAttribute('aria-label', `${context}: ${input.placeholder || input.title || input.id || `field ${index + 1}`}`);
  });
  document.querySelectorAll('.step-panel button').forEach(button => {
    if (button.textContent.trim() !== '×' || button.getAttribute('aria-label')) return;
    const row = button.closest('.row-card') || button.parentElement;
    const name = row?.querySelector('input')?.value || 'row';
    button.setAttribute('aria-label', `Remove ${name}`);
  });
}

function renderProfileProgress() {
  const profileSet = ensureProfileSet();
  const strategy = getProfileStrategy();
  const label = getProfileStrategyLabel(strategy);
  const textLabels = { queued: 'Waiting', generating: 'Writing', ready: 'Ready', edited: 'Edits kept', 'template-ready': 'Needs retry', failed: 'Needs retry' };
  const visualLabels = { queued: 'waiting', generating: 'creating', ready: 'ready', pending: 'needs update', partial: 'partly ready', failed: 'needs retry' };
  setText('selected-view-name', `Editing ${label}`);
  setText('selected-view-status', `${textLabels[profileSet.statuses[strategy.lens]] || 'Editable sample'} · Images ${visualLabels[profileSet.visuals[strategy.lens]?.state] || 'editable'}`);
  const personalize = document.getElementById('btn-personalize-view');
  if (personalize) { personalize.textContent = `Update ${label} view with AI`; personalize.disabled = ['queued', 'generating'].includes(profileSet.statuses[strategy.lens]); }
  const container = document.getElementById('profile-set-progress');
  if (!container) return;
  container.innerHTML = profileSet.selectedLenses.filter(lens => PERSONA_PRESETS[lens]).map(lens => {
    const textState = profileSet.statuses[lens];
    const visual = profileSet.visuals[lens] || {};
    const textReady = ['ready', 'edited'].includes(textState);
    const retry = textReady && ['failed', 'partial', 'pending'].includes(visual.state);
    return `<div class="flex flex-wrap items-center gap-2 py-1 text-xs"><button type="button" class="underline" onclick="setViewerLens('${lens}')">${escHTML(PERSONA_PRESETS[lens].label)}</button><span>${textLabels[textState] || 'Sample'} · Images ${visualLabels[visual.state] || 'editable'}</span>${retry ? `<button type="button" class="underline" onclick="retryPersonaVisuals('${lens}')">Retry images only</button>` : ''}${['template-ready', 'failed'].includes(textState) ? `<button type="button" class="underline" onclick="retryPersonaText('${lens}')">Retry this view</button>` : ''}</div>`;
  }).join('');
}
async function retryPersonaText(lens) { setViewerLens(lens); return onPersonalizeCurrentPersona(); }
async function retryPersonaVisuals(lens) {
  const view = personaView(state, lens);
  if (!view || ['queued', 'generating'].includes(ensureProfileSet().statuses[lens])) return;
  return generatePersonaRecommendationImagesForTarget(lens, view, { announce: true });
}

function renderRailFields() {
  const container = document.getElementById('rail-fields-container');
  if (!container) return;
  state.railFields ||= [];
  container.innerHTML = state.railFields.map((field, index) => `<div class="row-card grid grid-cols-12 gap-2 items-center">
    <input aria-label="Profile field ${index + 1} label" class="col-span-4 border rounded p-2" value="${escAttr(field.label)}" oninput="updateRailField(${index},'label',this.value)">
    <input aria-label="${escAttr(field.label || 'Profile field')} value" class="col-span-5 border rounded p-2" value="${escAttr(field.value)}" oninput="updateRailField(${index},'value',this.value)">
    <label class="col-span-2 text-xs"><input type="checkbox" ${field.visible !== false ? 'checked' : ''} onchange="updateRailField(${index},'visible',this.checked)"> Show</label>
    <button type="button" class="icon-btn danger" aria-label="Remove ${escAttr(field.label || 'profile field')}" onclick="removeRailField(${index})">×</button></div>`).join('');
}
function addRailField() {
  state.railFields ||= []; state.railFields.push({ id: `field-${Date.now()}-${Math.random().toString(36).slice(2)}`, label: 'New field', value: '', visible: true });
  renderRailFields(); refreshPreview();
}
function updateRailField(index, key, value) {
  if (!['label', 'value', 'visible'].includes(key) || !state.railFields?.[index]) return;
  state.railFields[index][key] = value; refreshPreview();
}
function removeRailField(index) { state.railFields.splice(index, 1); renderRailFields(); refreshPreview(); }

// One recovery record per browser tab (survives reload), never credentials.
// IndexedDB permits image-bearing drafts without blocking typing on localStorage.
let draftReady = false, draftTimer = null, draftPending = null, draftWrite = Promise.resolve();
let draftTabKey = '', draftDatabase = null, draftLastJSON = '';
function draftProfileSnapshot() {
  const keys = ['schemaVersion', 'brandName', 'appName', 'logo', 'userAvatar', 'colors', 'layout', 'navLinks', 'tabName', 'profile', 'loyalty', 'account', 'accountMetrics', 'profileType', 'profileStrategy', 'profileSet', 'personaVariants', '_industry', '_aiContext', ...PERSONA_VIEW_FIELDS];
  return Object.fromEntries(keys.filter(key => state[key] !== undefined).map(key => [key, cloneViewData(state[key])]));
}
async function draftDB() {
  if (draftDatabase) return draftDatabase;
  if (!globalThis.indexedDB) throw new Error('Browser recovery storage is unavailable');
  draftTabKey = sessionStorage.getItem('upg-draft-tab') || (globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random()}`);
  sessionStorage.setItem('upg-draft-tab', draftTabKey);
  draftDatabase = await new Promise((resolve, reject) => {
    const request = indexedDB.open('upg-recovery-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Recovery storage is busy in another tab'));
  });
  return draftDatabase;
}
async function draftStorage(action, value) {
  const db = await draftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', action === 'get' ? 'readonly' : 'readwrite');
    const request = tx.objectStore('drafts')[action](...(action === 'put' ? [value, draftTabKey] : [draftTabKey]));
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
function scheduleDraftRecovery() {
  if (!draftReady || draftPending) return;
  clearTimeout(draftTimer); draftTimer = setTimeout(() => persistDraftRecovery(), 900);
}
async function persistDraftRecovery() {
  clearTimeout(draftTimer);
  if (!draftReady || draftPending) return false;
  snapshotPersonaView();
  const record = { version: 1, profile: draftProfileSnapshot(), step: currentStep, sourceUrl: document.getElementById('quickstart-url')?.value || '',
    owner: currentProjectOwner || window.SaasyAuth?.getEmail?.() || '', project: { id: currentProjectId, name: currentProjectName, revision: currentProjectRevision } };
  const json = JSON.stringify(record);
  // Serialize writes so slower older saves can never replace a newer draft.
  const write = draftWrite.catch(() => {}).then(async () => {
    // Compare against the last *completed* queued write, not the value that
    // happened to be stored when this request was queued (A → B → A).
    if (json === draftLastJSON) return true;
    await draftStorage('put', record); draftLastJSON = json; setText('draft-status', 'Draft backed up in this browser tab · not saved online'); return true;
  });
  draftWrite = write;
  try { return await write; } catch (_) { setText('draft-status', 'Local backup unavailable. Save online or download HTML before reloading.'); return false; }
}
async function initializeDraftRecovery() {
  try {
    const record = await draftStorage('get');
    if (record?.version === 1 && record.profile) {
      UPGContract.validateSavedProfile(record.profile); draftPending = record;
      const status = document.getElementById('draft-status');
      if (status) status.innerHTML = 'A draft from this browser tab is available. <button type="button" class="underline" onclick="restoreDraftRecovery()">Restore draft</button> · <button type="button" class="underline" onclick="discardDraftRecovery()">Discard backup</button>';
    }
    draftReady = true;
  } catch (_) { setText('draft-status', 'Local recovery unavailable. Save online or download HTML to keep your work.'); }
}
function restoreDraftRecovery() {
  if (!draftPending) return;
  const email = window.SaasyAuth?.getEmail?.() || '';
  if (draftPending.owner && draftPending.owner !== email) { alert('Sign in with the account that created this draft before restoring it.'); return; }
  if (!confirm('Replace the current editor with the recovered draft?')) return;
  const record = draftPending;
  UPGContract.validateSavedProfile(record.profile);
  Object.values(record.profile.personaVariants || {}).forEach(variant => UPGContract.validateSavedProfile(Object.assign({}, record.profile, variant)));
  cancelDraftRequests(); state = cloneViewData(record.profile);
  currentProjectId = record.project?.id || null; currentProjectName = record.project?.name || null;
  currentProjectRevision = record.project?.revision || null; currentProjectOwner = record.owner || null;
  for (const lens of Object.keys(ensureProfileSet().statuses)) {
    if (['queued', 'generating'].includes(state.profileSet.statuses[lens])) state.profileSet.statuses[lens] = 'failed';
    if (state.profileSet.visuals[lens]?.state === 'generating') state.profileSet.visuals[lens].state = 'partial';
  }
  draftPending = null; document.getElementById('quickstart-url').value = record.sourceUrl || '';
  fillStaticFields(); syncProfileSetConfigUI(); renderAll(); goToStep(record.step || 0); refreshPreview();
  setText('draft-status', 'Draft restored. Save online when ready.');
  if (typeof recoverEmbeddedBrandLogo === 'function') recoverEmbeddedBrandLogo();
}
async function discardDraftRecovery() {
  if (!confirm('Discard only this tab’s recovery backup? Your editor and online projects stay unchanged.')) return;
  await draftWrite.catch(() => {}); await draftStorage('delete'); draftPending = null; draftLastJSON = '';
  setText('draft-status', 'Previous backup discarded. New edits will be backed up in this tab.');
}
