// ============================================================
// app.js — Wizard flow, state, live preview, export
// ============================================================

const TOTAL_STEPS = 7;
let currentStep = 0;
let state = cloneIndustry('recruiting');
state.brandName = 'NCSA College Recruiting';
state.logo = '';
state.userAvatar = '';

// Debounce the preview iframe refresh — every keystroke otherwise re-parses a big HTML doc.
let previewTimer = null;
function refreshPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const iframe = document.getElementById('preview-iframe');
    if (!iframe) return;
    const html = generateProfileHTML(state);
    iframe.srcdoc = html;
  }, 120);
}

// ─── STATE ↔ DOM binding ────────────────────────────────────

function fillStaticFields() {
  document.getElementById('brand-name').value = state.brandName || '';
  document.getElementById('brand-industry').value = state._industry || 'recruiting';
  document.getElementById('app-name').value = state.appName || 'Data Cloud';
  document.getElementById('url-logo').value = state.logo && !state.logo.startsWith('data:') ? state.logo : '';
  setImagePreviewFromURL('preview-logo', state.logo);

  document.getElementById('url-user-avatar').value = state.userAvatar && !state.userAvatar.startsWith('data:') ? state.userAvatar : '';
  setImagePreviewFromURL('preview-user-avatar', state.userAvatar);

  document.getElementById('color-primary').value = state.colors.primary;
  document.getElementById('hex-primary').value = state.colors.primary;
  document.getElementById('color-accent').value = state.colors.accent;
  document.getElementById('hex-accent').value = state.colors.accent;
  document.getElementById('color-secondary').value = state.colors.secondary;
  document.getElementById('hex-secondary').value = state.colors.secondary;
  document.getElementById('color-menu').value = state.colors.menu;
  document.getElementById('hex-menu').value = state.colors.menu;
  document.getElementById('color-menuText').value = state.colors.menuText;
  document.getElementById('hex-menuText').value = state.colors.menuText;
  document.getElementById('color-pageBg').value = state.colors.pageBg || '#EAF5FE';
  document.getElementById('hex-pageBg').value = state.colors.pageBg || '#EAF5FE';

  if (!state.layout) state.layout = { leftColWidth: 290, middleColWidth: 320 };
  document.getElementById('left-col-w').value = state.layout.leftColWidth;
  document.getElementById('left-col-w-val').textContent = state.layout.leftColWidth + 'px';
  document.getElementById('middle-col-w').value = state.layout.middleColWidth;
  document.getElementById('middle-col-w-val').textContent = state.layout.middleColWidth + 'px';

  document.getElementById('profile-name').value = state.profile.name;
  document.getElementById('profile-city').value = state.profile.city;
  document.getElementById('profile-customerId').value = state.profile.customerId;
  document.getElementById('profile-email').value = state.profile.email;
  document.getElementById('profile-phone').value = state.profile.phone;
  document.getElementById('secondary-email-include').checked = !!state.profile.secondaryEmailInclude;
  document.getElementById('secondary-email-label').value = state.profile.secondaryEmailLabel || 'Secondary Email';
  document.getElementById('secondary-email-value').value = state.profile.secondaryEmail || '';
  document.getElementById('profile-address').value = state.profile.address;
  document.getElementById('profile-segment').value = state.profile.segment;
  document.getElementById('url-photo').value = state.profile.photo && !state.profile.photo.startsWith('data:') ? state.profile.photo : '';
  setImagePreviewFromURL('preview-photo', state.profile.photo);

  document.getElementById('loyalty-title').value = state.loyalty.title;
  document.getElementById('loyalty-memberId').value = state.loyalty.memberId;
  document.getElementById('loyalty-tier').value = state.loyalty.tier;
  document.getElementById('loyalty-points').value = state.loyalty.points;
  document.getElementById('loyalty-redeemedPoints').value = state.loyalty.redeemedPoints;

  document.getElementById('insights-title').value = state.insights.title;
  document.getElementById('affinities-title').value = state.affinities.title;
  document.getElementById('seriesA-label').value = state.affinities.seriesA.label;
  document.getElementById('seriesA-color').value = state.affinities.seriesA.color;
  document.getElementById('seriesA-color-hex').value = state.affinities.seriesA.color;
  document.getElementById('seriesB-label').value = state.affinities.seriesB.label;
  document.getElementById('seriesB-color').value = state.affinities.seriesB.color;
  document.getElementById('seriesB-color-hex').value = state.affinities.seriesB.color;

  document.getElementById('preferences-title').value = state.preferences.title;
  document.getElementById('preferences-icon').value = state.preferences.icon || '';
  document.getElementById('events-title').value = state.events.title;
  document.getElementById('events-icon').value = state.events.icon || '';
  document.getElementById('membership-title').value = state.membership.title;
  document.getElementById('membership-icon').value = state.membership.icon || '';
  document.getElementById('recs-title').value = state.recommendations.title;
  document.getElementById('activity-title').value = state.activity.title;
  document.getElementById('tab-name').value = state.tabName;
}

function readStaticFields() {
  state.brandName = document.getElementById('brand-name').value;
  state.appName = document.getElementById('app-name').value;
  state.colors.primary = document.getElementById('hex-primary').value;
  state.colors.accent = document.getElementById('hex-accent').value;
  state.colors.secondary = document.getElementById('hex-secondary').value;
  state.colors.menu = document.getElementById('hex-menu').value;
  state.colors.menuText = document.getElementById('hex-menuText').value;
  state.colors.pageBg = document.getElementById('hex-pageBg').value;

  state.profile.name = document.getElementById('profile-name').value;
  state.profile.city = document.getElementById('profile-city').value;
  state.profile.customerId = document.getElementById('profile-customerId').value;
  state.profile.email = document.getElementById('profile-email').value;
  state.profile.phone = document.getElementById('profile-phone').value;
  state.profile.secondaryEmailInclude = document.getElementById('secondary-email-include').checked;
  state.profile.secondaryEmailLabel = document.getElementById('secondary-email-label').value;
  state.profile.secondaryEmail = document.getElementById('secondary-email-value').value;
  state.profile.address = document.getElementById('profile-address').value;
  state.profile.segment = document.getElementById('profile-segment').value;

  state.loyalty.title = document.getElementById('loyalty-title').value;
  state.loyalty.memberId = document.getElementById('loyalty-memberId').value;
  state.loyalty.tier = document.getElementById('loyalty-tier').value;
  state.loyalty.points = document.getElementById('loyalty-points').value;
  state.loyalty.redeemedPoints = document.getElementById('loyalty-redeemedPoints').value;

  state.insights.title = document.getElementById('insights-title').value;
  state.affinities.title = document.getElementById('affinities-title').value;
  state.affinities.seriesA.label = document.getElementById('seriesA-label').value;
  state.affinities.seriesA.color = document.getElementById('seriesA-color').value;
  state.affinities.seriesB.label = document.getElementById('seriesB-label').value;
  state.affinities.seriesB.color = document.getElementById('seriesB-color').value;

  state.preferences.title = document.getElementById('preferences-title').value;
  state.preferences.icon = document.getElementById('preferences-icon').value;
  state.events.title = document.getElementById('events-title').value;
  state.events.icon = document.getElementById('events-icon').value;
  state.membership.title = document.getElementById('membership-title').value;
  state.membership.icon = document.getElementById('membership-icon').value;
  state.recommendations.title = document.getElementById('recs-title').value;
  state.activity.title = document.getElementById('activity-title').value;
  state.tabName = document.getElementById('tab-name').value;
}

// Called by every input onchange. Read → re-render dynamic lists that
// depend on state? No — dynamic lists own their own state via row edits.
function onFieldChange() {
  readStaticFields();
  refreshPreview();
}

function onHexChange(key) {
  const v = document.getElementById('hex-' + key).value;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    document.getElementById('color-' + key).value = v;
    onFieldChange();
  }
}

// Slider-driven column widths — update state, echo px, refresh preview.
function onLayoutChange(field, value) {
  if (!state.layout) state.layout = { leftColWidth: 290, middleColWidth: 320 };
  const n = Math.max(220, Math.min(500, +value));
  state.layout[field] = n;
  const echo = document.getElementById(field === 'leftColWidth' ? 'left-col-w-val' : 'middle-col-w-val');
  if (echo) echo.textContent = n + 'px';
  refreshPreview();
}
function onColorChange() {
  ['primary', 'accent', 'secondary', 'menu', 'menuText', 'pageBg'].forEach(k => {
    document.getElementById('hex-' + k).value = document.getElementById('color-' + k).value;
  });
  onFieldChange();
}
function onSeriesHexChange(which) {
  const v = document.getElementById(`series${which}-color-hex`).value;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    document.getElementById(`series${which}-color`).value = v;
    onFieldChange();
  }
}

function onIndustryChange() {
  if (!confirm('Switching industry will replace all field values with the new industry\'s defaults. Continue?')) {
    document.getElementById('brand-industry').value = state._industry || 'recruiting';
    return;
  }
  const key = document.getElementById('brand-industry').value;
  state = cloneIndustry(key);
  state._industry = key;
  state.brandName = INDUSTRY_DEFAULTS[key].label;
  state.logo = '';
  state.userAvatar = '';
  fillStaticFields();
  renderInsights();
  renderAffinityGroups();
  renderPreferences();
  renderEvents();
  renderMembership();
  renderRecs();
  renderActivity();
  renderNavLinks();
  refreshPreview();
}

// ─── DYNAMIC LIST RENDERERS ─────────────────────────────────

function renderInsights() {
  const c = document.getElementById('insights-container');
  c.innerHTML = state.insights.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.icon)}" class="col-span-1 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none text-center" oninput="state.insights.items[${i}].icon=this.value; refreshPreview()" title="Icon/emoji">
        <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.insights.items[${i}].label=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.value)}" class="col-span-6 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Value" oninput="state.insights.items[${i}].value=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeInsight(${i})">×</button>
      </div>
    </div>`).join('');
}
function addInsight() { state.insights.items.push({ icon: '📊', label: 'New Metric', value: '—' }); renderInsights(); refreshPreview(); }
function removeInsight(i) { state.insights.items.splice(i, 1); renderInsights(); refreshPreview(); }

function renderAffinityGroups() {
  const c = document.getElementById('affinity-groups-container');
  c.innerHTML = state.affinities.groups.map((g, gi) => `
    <div class="row-card">
      <div class="flex items-center gap-2 mb-3">
        <input type="text" value="${escAttr(g.name)}" class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-600 outline-none" placeholder="Group name" oninput="state.affinities.groups[${gi}].name=this.value; refreshPreview()">
        <button class="icon-btn danger" onclick="removeAffinityGroup(${gi})">Remove group</button>
      </div>
      <div class="space-y-2">
        ${g.items.map((it, ii) => `
          <div class="grid grid-cols-12 gap-2 items-center">
            <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.affinities.groups[${gi}].items[${ii}].label=this.value; refreshPreview()">
            <div class="col-span-3 flex items-center gap-1">
              <span class="text-[10px] font-600 text-gray-500">A</span>
              <input type="range" min="0" max="100" value="${it.a}" class="flex-1" oninput="state.affinities.groups[${gi}].items[${ii}].a=+this.value; this.nextElementSibling.textContent=this.value+'%'; refreshPreview()">
              <span class="text-[10px] w-8 text-right text-gray-500">${it.a}%</span>
            </div>
            <div class="col-span-3 flex items-center gap-1">
              <span class="text-[10px] font-600 text-gray-500">B</span>
              <input type="range" min="0" max="100" value="${it.b}" class="flex-1" oninput="state.affinities.groups[${gi}].items[${ii}].b=+this.value; this.nextElementSibling.textContent=this.value+'%'; refreshPreview()">
              <span class="text-[10px] w-8 text-right text-gray-500">${it.b}%</span>
            </div>
            <button class="col-span-2 icon-btn danger" onclick="removeAffinityItem(${gi}, ${ii})">Remove</button>
          </div>`).join('')}
      </div>
      <button onclick="addAffinityItem(${gi})" class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-600 rounded-lg hover:border-blue-400 hover:text-blue-600 w-full">+ Add Row</button>
    </div>`).join('');
}
function addAffinityGroup() { state.affinities.groups.push({ name: 'New Group', items: [{ label: 'Item', a: 50, b: 50 }] }); renderAffinityGroups(); refreshPreview(); }
function removeAffinityGroup(i) { state.affinities.groups.splice(i, 1); renderAffinityGroups(); refreshPreview(); }
function addAffinityItem(gi) { state.affinities.groups[gi].items.push({ label: 'New', a: 50, b: 50 }); renderAffinityGroups(); refreshPreview(); }
function removeAffinityItem(gi, ii) { state.affinities.groups[gi].items.splice(ii, 1); renderAffinityGroups(); refreshPreview(); }

function renderPreferences() {
  const c = document.getElementById('preferences-container');
  c.innerHTML = state.preferences.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.preferences.items[${i}].label=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.value)}" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Value" oninput="state.preferences.items[${i}].value=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removePreference(${i})">×</button>
      </div>
    </div>`).join('');
}
function addPreference() { state.preferences.items.push({ label: 'New', value: '' }); renderPreferences(); refreshPreview(); }
function removePreference(i) { state.preferences.items.splice(i, 1); renderPreferences(); refreshPreview(); }

function renderEvents() {
  const c = document.getElementById('events-container');
  c.innerHTML = state.events.items.map((ev, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(ev.name)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Event name" oninput="state.events.items[${i}].name=this.value; refreshPreview()">
        <input type="text" value="${escAttr(ev.date)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Date" oninput="state.events.items[${i}].date=this.value; refreshPreview()">
        <input type="text" value="${escAttr(ev.confirmation)}" class="col-span-3 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Confirmation #" oninput="state.events.items[${i}].confirmation=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeEvent(${i})">×</button>
      </div>
    </div>`).join('');
}
function addEvent() { state.events.items.push({ name: 'New Event', date: '', confirmation: '' }); renderEvents(); refreshPreview(); }
function removeEvent(i) { state.events.items.splice(i, 1); renderEvents(); refreshPreview(); }

function renderMembership() {
  const c = document.getElementById('membership-container');
  c.innerHTML = state.membership.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.membership.items[${i}].label=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.value)}" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Value" oninput="state.membership.items[${i}].value=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeMembership(${i})">×</button>
      </div>
    </div>`).join('');
}
function addMembership() { state.membership.items.push({ label: 'New', value: '' }); renderMembership(); refreshPreview(); }
function removeMembership(i) { state.membership.items.splice(i, 1); renderMembership(); refreshPreview(); }

// Extra cards — user-added cards in the middle column to fill vertical
// space. Each card owns a title, icon (emoji or image URL/data URL),
// and any number of label/value rows.
function renderExtraCards() {
  const c = document.getElementById('extra-cards-container');
  if (!Array.isArray(state.extraCards)) state.extraCards = [];
  c.innerHTML = state.extraCards.map((card, ci) => `
    <div class="row-card">
      <div class="flex items-center gap-2 mb-2">
        <input type="text" value="${escAttr(card.title)}" placeholder="Card title" class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-600 outline-none" oninput="state.extraCards[${ci}].title=this.value; refreshPreview()">
        <button class="icon-btn danger" onclick="removeExtraCard(${ci})">Remove card</button>
      </div>
      <div class="grid grid-cols-12 gap-2 items-center mb-2">
        <input type="text" value="${escAttr(card.icon || '')}" placeholder="Icon (emoji or image URL)" class="col-span-9 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none font-mono" oninput="state.extraCards[${ci}].icon=this.value; refreshPreview()">
        <div id="drop-extra-icon-${ci}" class="col-span-3 drop-zone-sf p-2 text-center cursor-pointer text-[10px]">📷 Upload</div>
      </div>
      <div class="space-y-2">
        ${(card.items || []).map((it, ri) => `
          <div class="grid grid-cols-12 gap-2 items-center">
            <input type="text" value="${escAttr(it.label)}" placeholder="Label" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.extraCards[${ci}].items[${ri}].label=this.value; refreshPreview()">
            <input type="text" value="${escAttr(it.value)}" placeholder="Value" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.extraCards[${ci}].items[${ri}].value=this.value; refreshPreview()">
            <button class="col-span-1 icon-btn danger" onclick="removeExtraCardRow(${ci}, ${ri})">×</button>
          </div>`).join('')}
      </div>
      <button onclick="addExtraCardRow(${ci})" class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-600 rounded-lg hover:border-blue-400 hover:text-blue-600 w-full">+ Add Row</button>
    </div>`).join('');

  // Wire icon drop zones for each extra card
  state.extraCards.forEach((_, ci) => {
    attachDropZone(`drop-extra-icon-${ci}`, null, (dataUrl) => {
      state.extraCards[ci].icon = dataUrl;
      renderExtraCards();
      refreshPreview();
    });
  });
}
function addExtraCard() {
  if (!Array.isArray(state.extraCards)) state.extraCards = [];
  state.extraCards.push({
    title: 'New Section',
    icon: '📋',
    items: [
      { label: 'Field 1', value: '' },
      { label: 'Field 2', value: '' }
    ]
  });
  renderExtraCards();
  refreshPreview();
}
function removeExtraCard(i) { state.extraCards.splice(i, 1); renderExtraCards(); refreshPreview(); }
function addExtraCardRow(ci) { state.extraCards[ci].items.push({ label: '', value: '' }); renderExtraCards(); refreshPreview(); }
function removeExtraCardRow(ci, ri) { state.extraCards[ci].items.splice(ri, 1); renderExtraCards(); refreshPreview(); }

// Right-column custom cards — render under Membership Details in the
// right-bottom-left column, opposite Engagement Activity. Same shape
// as middle-column extraCards to keep the editor familiar.
function renderRightExtraCards() {
  const c = document.getElementById('right-extra-cards-container');
  if (!c) return;
  if (!Array.isArray(state.rightExtraCards)) state.rightExtraCards = [];
  c.innerHTML = state.rightExtraCards.map((card, ci) => `
    <div class="row-card">
      <div class="flex items-center gap-2 mb-2">
        <input type="text" value="${escAttr(card.title)}" placeholder="Card title" class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-600 outline-none" oninput="state.rightExtraCards[${ci}].title=this.value; refreshPreview()">
        <button class="icon-btn danger" onclick="removeRightExtraCard(${ci})">Remove card</button>
      </div>
      <div class="grid grid-cols-12 gap-2 items-center mb-2">
        <input type="text" value="${escAttr(card.icon || '')}" placeholder="Icon (emoji or image URL)" class="col-span-9 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none font-mono" oninput="state.rightExtraCards[${ci}].icon=this.value; refreshPreview()">
        <div id="drop-right-extra-icon-${ci}" class="col-span-3 drop-zone-sf p-2 text-center cursor-pointer text-[10px]">📷 Upload</div>
      </div>
      <div class="space-y-2">
        ${(card.items || []).map((it, ri) => `
          <div class="grid grid-cols-12 gap-2 items-center">
            <input type="text" value="${escAttr(it.label)}" placeholder="Label" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.rightExtraCards[${ci}].items[${ri}].label=this.value; refreshPreview()">
            <input type="text" value="${escAttr(it.value)}" placeholder="Value" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.rightExtraCards[${ci}].items[${ri}].value=this.value; refreshPreview()">
            <button class="col-span-1 icon-btn danger" onclick="removeRightExtraCardRow(${ci}, ${ri})">×</button>
          </div>`).join('')}
      </div>
      <button onclick="addRightExtraCardRow(${ci})" class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-600 rounded-lg hover:border-blue-400 hover:text-blue-600 w-full">+ Add Row</button>
    </div>`).join('');

  state.rightExtraCards.forEach((_, ci) => {
    attachDropZone(`drop-right-extra-icon-${ci}`, null, (dataUrl) => {
      state.rightExtraCards[ci].icon = dataUrl;
      renderRightExtraCards();
      refreshPreview();
    });
  });
}
function addRightExtraCard() {
  if (!Array.isArray(state.rightExtraCards)) state.rightExtraCards = [];
  state.rightExtraCards.push({
    title: 'New Section',
    icon: '📋',
    items: [
      { label: 'Field 1', value: '' },
      { label: 'Field 2', value: '' }
    ]
  });
  renderRightExtraCards();
  refreshPreview();
}
function removeRightExtraCard(i) { state.rightExtraCards.splice(i, 1); renderRightExtraCards(); refreshPreview(); }
function addRightExtraCardRow(ci) { state.rightExtraCards[ci].items.push({ label: '', value: '' }); renderRightExtraCards(); refreshPreview(); }
function removeRightExtraCardRow(ci, ri) { state.rightExtraCards[ci].items.splice(ri, 1); renderRightExtraCards(); refreshPreview(); }

function renderRecs() {
  const c = document.getElementById('recs-container');
  c.innerHTML = state.recommendations.items.map((rec, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-start">
        <div class="col-span-11 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <input type="text" value="${escAttr(rec.eyebrow)}" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Eyebrow (e.g. Next Best Action:)" oninput="state.recommendations.items[${i}].eyebrow=this.value; refreshPreview()">
            <input type="text" value="${escAttr(rec.cta)}" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Button text" oninput="state.recommendations.items[${i}].cta=this.value; refreshPreview()">
          </div>
          <input type="text" value="${escAttr(rec.title)}" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Title" oninput="state.recommendations.items[${i}].title=this.value; refreshPreview()">
          <input type="text" value="${escAttr(rec.image)}" class="w-full px-2 py-1.5 border border-gray-300 rounded text-xs outline-none font-mono" placeholder="Image URL" oninput="state.recommendations.items[${i}].image=this.value; refreshPreview()">
          <div id="rec-drop-${i}" class="drop-zone-sf p-3 text-center cursor-pointer">
            ${rec.image ? `<img src="${escAttr(rec.image)}" class="w-full h-20 object-cover rounded mb-2">` : ''}
            <p class="text-[11px] text-gray-500">📷 Drop image or click to upload</p>
          </div>
        </div>
        <button class="col-span-1 icon-btn danger" onclick="removeRec(${i})">×</button>
      </div>
    </div>`).join('');
  // Wire drop zones after render
  state.recommendations.items.forEach((_, i) => {
    attachDropZone(`rec-drop-${i}`, null, (dataUrl) => {
      state.recommendations.items[i].image = dataUrl;
      renderRecs();
      refreshPreview();
    });
  });
}
function addRec() { state.recommendations.items.push({ eyebrow: 'Recommended:', title: 'New Recommendation', cta: 'Suggest', image: '' }); renderRecs(); refreshPreview(); }
function removeRec(i) { state.recommendations.items.splice(i, 1); renderRecs(); refreshPreview(); }

function renderActivity() {
  const c = document.getElementById('activity-container');
  c.innerHTML = state.activity.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.icon)}" class="col-span-1 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none text-center" oninput="state.activity.items[${i}].icon=this.value; refreshPreview()" title="Icon/emoji">
        <input type="text" value="${escAttr(it.title)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Title" oninput="state.activity.items[${i}].title=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.body)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Body (HTML allowed)" oninput="state.activity.items[${i}].body=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.time)}" class="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Time" oninput="state.activity.items[${i}].time=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeActivity(${i})">×</button>
      </div>
    </div>`).join('');
}
function addActivity() { state.activity.items.push({ icon: '🎯', title: 'New Event', body: '', time: 'just now' }); renderActivity(); refreshPreview(); }
function removeActivity(i) { state.activity.items.splice(i, 1); renderActivity(); refreshPreview(); }

function renderNavLinks() {
  const c = document.getElementById('nav-links-container');
  c.innerHTML = state.navLinks.map((l, i) => `
    <span class="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-xs font-600">
      ${escHTML(l)}
      <button class="text-gray-400 hover:text-red-500" onclick="removeNavLink(${i})">×</button>
    </span>`).join('');
}
function addNavLink() {
  const inp = document.getElementById('new-nav-link');
  const v = inp.value.trim();
  if (!v) return;
  state.navLinks.push(v);
  inp.value = '';
  renderNavLinks();
  refreshPreview();
}
function removeNavLink(i) { state.navLinks.splice(i, 1); renderNavLinks(); refreshPreview(); }

// ─── ESCAPE HELPERS (for wizard-side rendering) ─────────────
function escAttr(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function escHTML(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ─── STEP NAVIGATION ────────────────────────────────────────
function goToStep(n) {
  currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, n));
  document.querySelectorAll('.step-panel').forEach(p => {
    p.classList.toggle('active', +p.dataset.step === currentStep);
  });
  document.querySelectorAll('#step-indicators .step-dot').forEach(d => {
    const i = +d.dataset.step;
    d.classList.toggle('active', i === currentStep);
    d.classList.toggle('completed', i < currentStep);
  });
  document.getElementById('btn-prev').classList.toggle('hidden', currentStep === 0);
  document.getElementById('btn-next').textContent = currentStep === TOTAL_STEPS - 1 ? 'Done' : 'Next →';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function nextStep() { if (currentStep < TOTAL_STEPS - 1) goToStep(currentStep + 1); }
function prevStep() { if (currentStep > 0) goToStep(currentStep - 1); }

// ─── URL & IMAGE INPUTS ─────────────────────────────────────
function onLogoUrlChange() {
  const v = document.getElementById('url-logo').value.trim();
  state.logo = v;
  setImagePreviewFromURL('preview-logo', v);
  refreshPreview();
}
function onUserAvatarUrlChange() {
  const v = document.getElementById('url-user-avatar').value.trim();
  state.userAvatar = v;
  setImagePreviewFromURL('preview-user-avatar', v);
  refreshPreview();
}
function onPhotoUrlChange() {
  const v = document.getElementById('url-photo').value.trim();
  state.profile.photo = v;
  setImagePreviewFromURL('preview-photo', v);
  refreshPreview();
}

// ─── START OVER + EXPORT ───────────────────────────────────
function startOver() {
  if (!confirm('Reset everything back to industry defaults?')) return;
  const key = document.getElementById('brand-industry').value || 'recruiting';
  state = cloneIndustry(key);
  state._industry = key;
  state.brandName = INDUSTRY_DEFAULTS[key].label;
  state.logo = '';
  state.userAvatar = '';
  fillStaticFields();
  renderAll();
  goToStep(0);
  refreshPreview();
}

function downloadHTML() {
  const html = generateProfileHTML(state);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = (state.profile.name || 'profile').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.download = `unified-profile-${name}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyHTML() {
  const html = generateProfileHTML(state);
  navigator.clipboard.writeText(html).then(() => {
    const s = document.getElementById('copy-success');
    s.classList.remove('hidden');
    setTimeout(() => s.classList.add('hidden'), 2200);
  });
}

// ─── AI-driven ingest — apply parsed profile from URL analysis ─
function applyAIProfile(ai) {
  // Preserve current industry unless AI came back with something else.
  const industry = ai.industry && INDUSTRY_DEFAULTS[ai.industry] ? ai.industry : (state._industry || 'recruiting');
  const base = cloneIndustry(industry);
  base._industry = industry;

  base.brandName = ai.brandName || base.brandName || state.brandName;
  base.appName = ai.appName || base.appName;
  base.tabName = ai.tabName || (ai.profile && ai.profile.name) || base.tabName;

  if (ai.colors) {
    if (ai.colors.primary)   base.colors.primary = ai.colors.primary;
    if (ai.colors.accent)    base.colors.accent = ai.colors.accent;
    if (ai.colors.secondary) base.colors.secondary = ai.colors.secondary;
    if (ai.colors.menu)      base.colors.menu = ai.colors.menu;
    if (ai.colors.menuText)  base.colors.menuText = ai.colors.menuText;
  }

  ['profile', 'loyalty', 'insights', 'affinities', 'preferences', 'events', 'membership', 'recommendations', 'activity'].forEach(k => {
    if (ai[k]) base[k] = Object.assign({}, base[k], ai[k]);
  });
  if (Array.isArray(ai.navLinks) && ai.navLinks.length) base.navLinks = ai.navLinks;
  if (Array.isArray(ai.extraCards)) base.extraCards = ai.extraCards;
  if (Array.isArray(ai.rightExtraCards)) base.rightExtraCards = ai.rightExtraCards;

  // Prefer favicon as logo if AI didn't give us anything.
  if (ai._meta && ai._meta.favicon && !base.logo) base.logo = ai._meta.favicon;

  state = base;
  document.getElementById('brand-industry').value = industry;
  fillStaticFields();
  renderAll();
  refreshPreview();
}

function renderAll() {
  renderInsights();
  renderAffinityGroups();
  renderPreferences();
  renderEvents();
  renderMembership();
  renderExtraCards();
  renderRightExtraCards();
  renderRecs();
  renderActivity();
  renderNavLinks();
}

// ─── QUICK START (AI URL analysis) ──────────────────────────
function friendlyError(err) {
  // Compose a message from the code plus any upstream detail the Worker
  // passed through. This is far more useful than the bare `default_failed`
  // string the user sees when the shared backend has an issue.
  const code = err.code || '';
  const upstream = err.upstream ? ` upstream: ${err.upstream}` : '';
  const upstreamStatus = err.upstreamStatus ? ` (status ${err.upstreamStatus})` : '';
  const upstreamBody = err.upstreamBody ? ` — ${err.upstreamBody}` : '';

  const suggest = ' Try again in a moment, or open Advanced and paste your own Anthropic key (sk-ant-…) to bypass the shared backend.';

  const map = {
    missing_api_key: 'Add your API key in Advanced (sk-ant-… or sk-…), or clear it to use the shared default.',
    default_not_configured: `The shared backend isn't set up with an LLM key yet. Paste your own key in Advanced.`,
    default_rate_limited: `The shared backend is rate-limited (too many recent requests).${suggest}`,
    default_timeout: `The shared backend didn't respond within 45s.${suggest}`,
    default_unavailable: `Shared backend unavailable${upstream}${upstreamStatus}${upstreamBody}.${suggest}`,
    default_failed: `Shared backend call failed (HTTP ${err.status || '?'})${upstream}${upstreamStatus}${upstreamBody}.${suggest}`,
    default_network: `Can't reach the shared backend at ${err.endpoint || 'the default URL'}. Check your network, or paste your own key in Advanced.`,
    default_empty_response: `Shared backend returned no content.${suggest}`,
    anthropic_bad_key: 'Anthropic rejected the API key. Check it in the Anthropic Console.',
    anthropic_forbidden: `Your Anthropic key doesn't allow browser-access header calls to this model.`,
    anthropic_rate_limited: 'Anthropic rate-limited the request. Wait a moment and retry.',
    anthropic_overloaded: 'Anthropic is overloaded. Retry in a moment.',
    anthropic_empty_response: 'Anthropic returned no content. Retry or switch tiers.',
    sfgateway_bad_key: 'SF Gateway rejected the key.',
    sfgateway_forbidden: 'SF Gateway forbade the request.',
    sfgateway_rate_limited: 'SF Gateway rate-limited the request.',
    invalid_url: `That URL doesn't look right — include the domain (e.g. ncsasports.org).`
  };
  return map[code] || err.message || String(err);
}

// When the shared backend fails, auto-open Advanced so the user can drop
// in their own key without hunting for it.
function nudgeToAdvancedIfDefaultFailed(code) {
  if (!code || !code.startsWith('default_')) return;
  const panel = document.getElementById('quickstart-settings');
  if (panel && !panel.classList.contains('open')) panel.classList.add('open');
}

async function onQuickStartAnalyze() {
  const url = document.getElementById('quickstart-url').value.trim();
  if (!url) return;
  const btn = document.getElementById('quickstart-btn');
  const status = document.getElementById('quickstart-status');
  const errBox = document.getElementById('quickstart-error');
  errBox.style.display = 'none';
  errBox.textContent = '';
  btn.disabled = true;
  status.innerHTML = '<div class="spinner"></div> Starting…';

  const setStatus = (label) => { status.innerHTML = `<div class="spinner"></div> ${label}`; };

  try {
    if (!window.LocalAI) throw new Error('LocalAI module not loaded');
    const ai = await window.LocalAI.analyzeCustomerURL(url, {
      onStatus: (phase) => {
        if (phase === 'fetching') setStatus('Fetching customer page…');
        else if (phase === 'fallback_url_only') setStatus('Site blocked scrape — analyzing from URL only…');
        else if (phase === 'analyzing') setStatus('Analyzing with Claude…');
      }
    });
    applyAIProfile(ai);
    status.textContent = `✓ Applied ${INDUSTRY_DEFAULTS[state._industry].label} profile from ${new URL(url.startsWith('http') ? url : 'https://' + url).hostname}`;
  } catch (e) {
    errBox.style.display = 'block';
    errBox.textContent = friendlyError(e);
    nudgeToAdvancedIfDefaultFailed(e.code);
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

function toggleQuickStartSettings() {
  document.getElementById('quickstart-settings').classList.toggle('open');
}

function refreshProviderBadge() {
  if (!window.LocalAI) return;
  const badge = document.getElementById('quickstart-mode-badge');
  const note = document.getElementById('quickstart-note');
  if (!badge || !note) return;
  const p = window.LocalAI.currentProvider();
  badge.classList.remove('byok');
  if (p === 'default') {
    badge.textContent = 'Default backend';
    note.innerHTML = 'Works out of the box — routes through a shared backend that holds the LLM API key. Open <b>Advanced</b> to use your own key or Worker.';
  } else if (p === 'anthropic') {
    badge.textContent = 'Your Anthropic key';
    badge.classList.add('byok');
    note.innerHTML = 'Using your own Anthropic key from Advanced. Clear it to switch back to the default backend.';
  } else if (p === 'sfgateway') {
    badge.textContent = 'Your SF LLM Gateway key';
    badge.classList.add('byok');
    note.innerHTML = 'Using your own SF LLM Gateway key. Clear it to switch back to the default backend.';
  }
}

function onLocalAIKeyChange() {
  const v = document.getElementById('quickstart-api-key').value;
  if (window.LocalAI) window.LocalAI.setKey(v);
  refreshProviderBadge();
}
function clearLocalAIKey() {
  document.getElementById('quickstart-api-key').value = '';
  if (window.LocalAI) window.LocalAI.setKey('');
  refreshProviderBadge();
}
function onScraperEndpointChange() {
  const v = document.getElementById('quickstart-scraper-url').value;
  if (window.LocalAI) window.LocalAI.setScraperEndpoint(v);
}

// ─── INIT ───────────────────────────────────────────────────
function bootstrap() {
  state._industry = 'recruiting';
  fillStaticFields();
  renderAll();

  attachDropZone('drop-logo', 'preview-logo', (dataUrl) => {
    state.logo = dataUrl;
    document.getElementById('url-logo').value = '';
    refreshPreview();
  });
  attachDropZone('drop-user-avatar', 'preview-user-avatar', (dataUrl) => {
    state.userAvatar = dataUrl;
    document.getElementById('url-user-avatar').value = '';
    refreshPreview();
  });
  attachDropZone('drop-photo', 'preview-photo', (dataUrl) => {
    state.profile.photo = dataUrl;
    document.getElementById('url-photo').value = '';
    refreshPreview();
  });

  // Section icon uploaders — write the data URL into the text input so the
  // user can still see (and clear) what's set.
  ['preferences', 'events', 'membership'].forEach(key => {
    attachDropZone(`drop-${key}-icon`, null, (dataUrl) => {
      state[key].icon = dataUrl;
      document.getElementById(`${key}-icon`).value = dataUrl;
      refreshPreview();
    });
  });

  // Load persisted API key / scraper endpoint if any
  if (window.LocalAI) {
    const k = window.LocalAI.getKey();
    if (k) document.getElementById('quickstart-api-key').value = k;
    if (window.LocalAI.hasCustomScraperEndpoint()) {
      document.getElementById('quickstart-scraper-url').value = window.LocalAI.getScraperEndpoint();
    }
    refreshProviderBadge();
  }

  refreshPreview();
}

// Script may load before or after DOMContentLoaded (index.html injects
// script tags dynamically). Bootstrap in either case.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
