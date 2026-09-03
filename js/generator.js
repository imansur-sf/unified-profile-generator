// ============================================================
// generator.js — Renders the Unified Profile HTML
// ============================================================
// Produces one big string of HTML for the preview iframe and the
// standalone export. Everything is inlined (styles + data URLs) so
// the exported file has no external dependencies.
// ============================================================

function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Values that contain user-authored inline HTML (e.g. <b>, <span style="…">)
function raw(s) {
  return s === undefined || s === null ? '' : String(s);
}

function viewerLensLabel(strategy) {
  const lens = typeof strategy === 'string' ? strategy : strategy?.lens;
  if (lens === 'custom') return String(strategy?.customRole || '').trim().slice(0, 64) || 'Custom profile';
  return ({ sales: 'Sales', service: 'Service', marketing: 'Marketing', success: 'Customer Success' })[lens] || 'Sales';
}

// A section-icon slot. If `icon` looks like a URL or data URL, render the image.
// If it's a short emoji string, render inside the colored square.
// If it's empty, fall back to `emojiFallback` inside the colored square.
function renderSectionIcon(icon, emojiFallback, bgColor) {
  const bg = bgColor || '#066AFE';
  if (icon && /^(https?:|data:image\/)/i.test(icon)) {
    return `<span class="section-icon section-icon-image"><img src="${esc(icon)}" alt=""></span>`;
  }
  const glyph = icon && icon.trim() ? icon : emojiFallback;
  return `<span class="section-icon" style="background:${esc(bg)};">${raw(glyph)}</span>`;
}

function generateProfileHTML(state) {
  const s = state;
  if (s.profileType === 'b2b') return generateTabbedAccountProfileHTML(s);
  const primary = s.colors.primary || '#001E5B';
  const accent = s.colors.accent || '#066AFE';
  const secondary = s.colors.secondary || '#EAF5FE';
  const menuBg = s.colors.menu || '#FFFFFF';
  const menuText = s.colors.menuText || '#3E3E3C';
  const pageBg = s.colors.pageBg || '#EAF5FE';
  const leftW = Math.max(220, Math.min(500, Number(s.layout?.leftColWidth) || 290));
  const middleMin = Math.max(220, Math.min(500, Number(s.layout?.middleColWidth) || 320));
  const visible = Object.assign({ affinities: true, preferences: true, events: true, membership: true, recommendations: true, activity: true }, s.b2cSections || {});
  const strategy = Object.assign({ lens: 'sales', objective: 'convert' }, s.profileStrategy || {});

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(s.profile.name)} — Unified Profile</title>
<style>
:root {
  --primary: ${primary};
  --accent: ${accent};
  --secondary: ${secondary};
  --menu-bg: ${menuBg};
  --menu-text: ${menuText};
  --border: #DDDBDA;
  --text: #080707;
  --text-muted: #706E6B;
  --card-bg: #FFFFFF;
  --page-bg: ${pageBg};
}
* { box-sizing: border-box; }
html, body { width: 1300px; height: 860px; overflow: hidden; }
body {
  margin: 0;
  font-family: 'Salesforce Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background: var(--page-bg);
  font-size: 13px;
  line-height: 1.4;
}

/* ── Global Salesforce top bar ─────────────────────────────── */
.sf-topbar {
  background: linear-gradient(180deg, #FAFAFB 0%, #F3F3F3 100%);
  border-bottom: 1px solid var(--border);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.sf-brand { display: flex; align-items: center; gap: 10px; }
.sf-brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  overflow: hidden;
  flex-shrink: 0;
}
.sf-brand-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.sf-search {
  flex: 1;
  max-width: 700px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #C9C7C5;
  border-radius: 4px;
  padding: 5px 12px;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sf-search svg { flex-shrink: 0; }
.sf-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #706E6B;
}
.sf-icon-btn {
  width: 32px; height: 32px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  background: #F3F2F2; border: 1px solid #DDDBDA;
  cursor: pointer;
  color: #706E6B;
  transition: background 0.15s ease;
}
.sf-icon-btn:hover { background: #FAFAF9; }
.sf-icon-btn svg { width: 14px; height: 14px; }
.sf-icon-btn.favorites { border-radius: 4px 0 0 4px; border-right: none; padding-right: 2px; padding-left: 6px; }
.sf-icon-btn.favorites-dd {
  border-radius: 0 4px 4px 0;
  width: 20px;
  padding: 0;
}
.sf-icon-btn.favorites-dd svg { width: 8px; height: 8px; }
.sf-avatar-wrap {
  position: relative;
  margin-left: 6px;
  cursor: pointer;
}
.sf-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: #E5E5E5; overflow: hidden;
  border: 1px solid #DDDBDA;
  display: flex; align-items: center; justify-content: center;
  color: #706E6B; font-size: 14px; font-weight: 600;
}
.sf-avatar img { width: 100%; height: 100%; object-fit: cover; }
.sf-avatar-presence {
  position: absolute;
  right: -1px; bottom: -1px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #2E844A;
  border: 2px solid #F3F3F3;
}

/* ── App-specific nav bar (Data Cloud) ─────────────────────── */
.app-nav {
  background: var(--menu-bg);
  color: var(--menu-text);
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 22px;
  border-bottom: 3px solid var(--accent);
  min-height: 40px;
  overflow-x: auto;
}
.app-nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 15px;
  color: var(--menu-text);
  padding-right: 14px;
  border-right: 1px solid var(--border);
  height: 28px;
  padding-top: 6px;
}
.app-nav-brand .waffle {
  display: inline-grid;
  grid-template-columns: repeat(3, 4px);
  gap: 2px;
}
.app-nav-brand .waffle span { width: 4px; height: 4px; background: var(--menu-text); border-radius: 1px; opacity: 0.7; }
.app-nav-link {
  color: var(--menu-text);
  font-size: 13px;
  padding: 12px 4px;
  text-decoration: none;
  white-space: nowrap;
  position: relative;
  opacity: 0.85;
}
.app-nav-link.active { opacity: 1; font-weight: 600; }
.app-nav-link.active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -3px;
  height: 3px; background: var(--accent);
}
/* Record-name tab — sits inline with the nav links, not floated right */
.app-nav-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid var(--border);
  border-bottom: none;
  padding: 8px 12px 10px;
  border-radius: 4px 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: -3px;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}
.app-nav-tab::before {
  content: '👤';
  font-size: 12px;
  color: var(--text-muted);
}
.app-nav-tab .tab-close {
  color: #C9C7C5;
  font-size: 12px;
  font-weight: 400;
  padding: 0 2px;
  cursor: pointer;
}
.app-nav-lens { display: inline-flex; align-items: center; margin-left: -12px; padding: 4px 8px; border-radius: 999px; background: #F3F8FC; color: #31506E; font-size: 10px; font-weight: 700; white-space: nowrap; }

/* ── Main grid ─────────────────────────────────────────────── */
.up-shell {
  border: 2px solid var(--accent);
  border-top: none;
  background: var(--page-bg);
  padding: 12px;
  display: grid;
  grid-template-columns: ${leftW}px minmax(${middleMin}px, ${middleMin + 40}px) 1fr;
  gap: 12px;
  height: calc(860px - 89px);
  align-items: stretch;
  overflow: hidden;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

/* ── Profile card ─────────────────────────────────────────── */
.profile-card { display: flex; flex-direction: column; gap: 14px; }
.profile-head { display: flex; gap: 12px; align-items: center; }
.profile-photo {
  width: 62px; height: 62px; border-radius: 50%;
  background: linear-gradient(135deg, #ddd 0%, #999 100%);
  overflow: hidden; flex-shrink: 0;
  border: 2px solid #fff; box-shadow: 0 0 0 1px var(--border);
}
.profile-photo img { width: 100%; height: 100%; object-fit: cover; }
.profile-name { font-size: 20px; font-weight: 600; color: var(--text); line-height: 1.1; }
.profile-city { font-size: 13px; color: var(--text-muted); margin-top: 3px; }
.profile-fields { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.profile-field {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-width: 0;
}
.profile-field-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--primary);
}
.profile-field-label {
  color: var(--text-muted);
  min-width: 92px;
  flex-shrink: 0;
}
.profile-field-value {
  color: var(--text);
  font-weight: 500;
  white-space: pre-line;
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.profile-segment {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  display: flex;
  gap: 10px;
  font-size: 11.5px;
  color: var(--text);
}
.profile-segment-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  color: var(--primary);
}
.profile-segment-value { font-weight: 600; line-height: 1.4; }

/* ── Insight blocks (loyalty, athlete insights) ────────────── */
.insights-title {
  font-size: 16px; font-weight: 600;
  color: var(--text); margin-bottom: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.insights-grid { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.insight-row { display: flex; gap: 10px; align-items: center; }
.insight-icon {
  width: 22px; height: 22px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
}
.insight-label { color: var(--text-muted); min-width: 132px; font-size: 11.5px; }
.insight-value { color: var(--text); font-weight: 600; }

.powered-by {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 10px; color: var(--text-muted);
  display: flex; align-items: center; gap: 6px;
}
.powered-by-icons { display: flex; gap: 4px; font-size: 12px; }

/* ── Affinities ────────────────────────────────────────────── */
.affinities-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.affinities-title { font-size: 15px; font-weight: 600; }
.affinities-legend { display: flex; gap: 12px; font-size: 11px; }
.affinities-legend-item { display: flex; align-items: center; gap: 6px; }
.affinities-legend-dot { width: 10px; height: 10px; border-radius: 50%; }

.affinity-group { margin-bottom: 14px; }
.affinity-group-title { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.affinity-row { display: grid; grid-template-columns: 90px 1fr; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 11.5px; }
.affinity-row-label { color: var(--text); text-align: right; padding-right: 4px; }
.affinity-bars { display: flex; flex-direction: column; gap: 2px; }
.affinity-bar { height: 8px; border-radius: 1px; }

/* ── Preferences / Events / Membership ─────────────────────── */
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.section-icon-title { display: flex; align-items: center; gap: 8px; }
.section-icon {
  width: 22px; height: 22px; border-radius: 3px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 13px;
  overflow: hidden;
  flex-shrink: 0;
}
.section-icon.section-icon-image { background: transparent; }
.section-icon.section-icon-image img { width: 100%; height: 100%; object-fit: contain; }
.section-title { font-size: 14px; font-weight: 700; }
.section-menu { color: var(--text-muted); font-size: 14px; padding: 2px 6px; cursor: pointer; }

.pref-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; font-size: 12px; }
.pref-item { }
.pref-label { color: var(--text); font-weight: 600; margin-bottom: 2px; }
.pref-value { color: var(--text-muted); }

.events-table { width: 100%; font-size: 12px; border-collapse: collapse; }
.events-table th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 4px 0; border-bottom: 1px solid var(--border); }
.events-table td { padding: 6px 0; }
.events-table .ev-name a { color: #006DCC; text-decoration: underline; font-weight: 500; }
.events-table .ev-confirm { color: var(--text-muted); font-size: 11px; display: block; margin-top: 1px; }

.member-grid { display: grid; grid-template-columns: 100px 1fr; gap: 8px 20px; font-size: 12px; }
.member-label { color: var(--text-muted); }
.member-value { color: var(--text); font-weight: 500; }

/* ── Einstein Recommendations ──────────────────────────────── */
.recs-wrap { position: relative; }
.recs-carousel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.rec-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* Fixed image height keeps the card at a screenshot-friendly size no matter
   how wide the right column expands. 160px is calibrated to the NCSA
   reference — total card ends up ~280–300px tall. */
.rec-image {
  width: 100%;
  height: 128px;
  background: #eee;
  overflow: hidden;
  flex-shrink: 0;
}
.rec-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rec-body {
  padding: 10px 10px 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.rec-eyebrow { color: var(--text-muted); font-size: 12px; font-weight: 600; }
.rec-title {
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  min-height: 34px;
}
.rec-cta {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 2px;
}
.rec-view-all {
  text-align: center;
  color: #006DCC;
  font-size: 12px;
  font-weight: 500;
  margin-top: 10px;
  padding-bottom: 4px;
  text-decoration: underline;
}
.recs-arrow {
  position: absolute;
  top: 40%;
  width: 26px; height: 26px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,0.10);
  font-weight: 700;
}
.recs-arrow.right { right: -14px; }
.recs-arrow.left  { left:  -14px; }

/* ── Engagement Activity timeline ──────────────────────────── */
.activity-list { display: flex; flex-direction: column; gap: 14px; position: relative; overflow-y: auto; scrollbar-width: none; padding-right: 2px; }
.activity-list::-webkit-scrollbar { display: none; }
.activity-list::before {
  content: '';
  position: absolute;
  left: 15px; top: 8px; bottom: 8px;
  width: 2px;
  background: #E5E5E5;
  z-index: 0;
}
.activity-item { display: grid; grid-template-columns: 32px 1fr; gap: 10px; align-items: flex-start; position: relative; z-index: 1; }
.activity-icon {
  width: 32px; height: 32px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px;
  background: #FFF; border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.activity-icon.color-1 { background: #FF9F43; color: #fff; border-color: transparent; }
.activity-icon.color-2 { background: #EAF4FF; color: var(--accent); }
.activity-icon.color-3 { background: #FFEAF3; color: #F02D64; }
.activity-icon.color-4 { background: #EFF9EF; color: #2A8A4A; }
.activity-title { font-size: 13px; font-weight: 600; color: var(--text); }
.activity-body { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
.activity-time { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

.right-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: hidden; }
.middle-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: hidden; }

/* Right column: Einstein Recs on top, then Events+Membership on left + Activity on right */
.right-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: stretch; flex: 1; min-height: 0; overflow: hidden; }
.right-bottom-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: hidden; }
.right-bottom > .card:last-child { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.right-bottom > .card:last-child .activity-list { flex: 1; min-height: 0; }

@media (max-width: 1100px) {
  .up-shell { grid-template-columns: ${leftW}px 1fr; }
  .right-col { grid-column: 1 / -1; }
}
@media (max-width: 520px) {
  .up-shell { grid-template-columns: 1fr; }
  .recs-carousel { grid-template-columns: 1fr; }
  .right-bottom { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<div class="sf-topbar">
  <div class="sf-brand">
    <div class="sf-brand-logo">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.brandName || 'B')[0])}</div>
  </div>
  <div class="sf-search">
    <svg width="14" height="14" viewBox="0 0 52 52" fill="currentColor"><path d="M49.7 42.7L37.4 30.4c1.7-2.9 2.6-6.4 2.6-9.9C40 9.7 31.3 1 20.5 1S1 9.7 1 20.5 9.7 40 20.5 40c3.6 0 7-1 9.9-2.6l12.3 12.3c.6.6 1.6.6 2.1 0l4.8-4.8c.7-.6.7-1.5.1-2.2zM7 20.5C7 13 13 7 20.5 7S34 13 34 20.5 28 34 20.5 34 7 28 7 20.5z"/></svg>
    Search Salesforce
  </div>
  <div class="sf-icons">
    <!-- Favorites: star + dropdown chevron -->
    <div class="sf-icon-btn favorites" title="Favorites">
      <svg viewBox="0 0 52 52" fill="currentColor"><path d="M50.8 19.9l-16.1-1.6c-.3 0-.6-.3-.7-.5L27.7 3c-.6-1.4-2.6-1.4-3.2 0l-6.4 14.9c-.1.3-.4.5-.7.5L1.4 19.9c-1.6.1-2.2 2.1-1 3.2l12 11.2c.2.2.3.5.3.8l-3.7 15.6c-.4 1.4 1.1 2.5 2.4 1.8l14.1-8.5c.3-.2.6-.2.9 0l14.1 8.5c1.3.8 2.8-.4 2.4-1.8L39 35.2c-.1-.3 0-.6.3-.8l12-11.2c1.5-1.2.9-3.2-.5-3.3z"/></svg>
    </div>
    <div class="sf-icon-btn favorites-dd" title="Favorites list">
      <svg viewBox="0 0 52 52" fill="currentColor"><path d="M46 15.4L26.6 34.8c-.4.4-.9.4-1.3 0L5.9 15.4c-.4-.4-.4-1 0-1.4l2-2c.4-.4.9-.4 1.3 0l16.1 16.1c.4.4.9.4 1.3 0L42.7 12c.4-.4.9-.4 1.3 0l2 2c.4.4.4 1 0 1.4z"/></svg>
    </div>
    <div class="sf-icon-btn" title="Add">
      <svg viewBox="0 0 52 52" fill="currentColor"><path d="M45 24H28V7c0-.6-.4-1-1-1h-2c-.6 0-1 .4-1 1v17H7c-.6 0-1 .4-1 1v2c0 .6.4 1 1 1h17v17c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V28h17c.6 0 1-.4 1-1v-2c0-.6-.4-1-1-1z"/></svg>
    </div>
    <div class="sf-icon-btn" title="Help">
      <svg viewBox="0 0 52 52" fill="currentColor"><path d="M26 2C12.7 2 2 12.7 2 26s10.7 24 24 24 24-10.7 24-24S39.3 2 26 2zm3 39c0 .6-.4 1-1 1h-4c-.6 0-1-.4-1-1v-4c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v4zm4.7-16.1c-1.5 1.9-3.5 3.2-4.7 4.8v.9c0 .6-.4 1-1 1h-4c-.6 0-1-.4-1-1v-2.7c0-2.5 1.4-4.6 3-6.1 1.6-1.5 3-2.4 3-4.4 0-1.8-1.5-3.4-3.4-3.4-1.3 0-2.6.7-3.2 2-.6 1.3-.5 3.1-.5 3.8 0 .6-.4 1-1 1h-4c-.6 0-1-.4-1-1 0-3.4.9-6 2.7-7.9 1.8-1.9 4.4-3.1 7.2-3.1 5.5 0 10 4.3 10 9.6 0 2.4-.9 4.4-1.9 5.5z"/></svg>
    </div>
    <div class="sf-icon-btn" title="Setup">
      <svg viewBox="0 0 52 52" fill="currentColor"><path d="M49.1 27.5c-.7-.6-1.1-1.4-1.1-2.3s.4-1.8 1.1-2.3l2.1-1.8c.4-.4.6-1 .3-1.5l-3.2-6c-.3-.5-.9-.7-1.4-.5l-2.6.9c-.9.3-1.9.2-2.6-.3-.7-.5-1.4-.9-2.1-1.2-.9-.4-1.5-1.1-1.7-2.1L37.4 8c-.1-.5-.6-.9-1.1-.9h-6.7c-.5 0-1 .4-1.1.9l-.5 2.4c-.2 1-.9 1.7-1.7 2.1-.8.3-1.5.7-2.1 1.2-.8.5-1.7.6-2.6.3l-2.6-.9c-.5-.2-1.1 0-1.4.5l-3.4 6c-.3.5-.2 1.1.3 1.5l2.1 1.8c.7.6 1.1 1.4 1.1 2.3s-.4 1.8-1.1 2.3l-2.1 1.8c-.4.4-.6 1-.3 1.5l3.4 6c.3.5.9.7 1.4.5l2.6-.9c.9-.3 1.9-.2 2.6.3.7.5 1.4.9 2.1 1.2.9.4 1.5 1.1 1.7 2.1l.5 2.4c.1.5.6.9 1.1.9h6.7c.5 0 1-.4 1.1-.9l.5-2.4c.2-1 .9-1.7 1.7-2.1.8-.3 1.5-.7 2.1-1.2.8-.5 1.7-.6 2.6-.3l2.6.9c.5.2 1.1 0 1.4-.5l3.2-6c.3-.5.2-1.1-.3-1.5l-2.1-1.8zM33 32c-3.9 0-7-3.1-7-7s3.1-7 7-7 7 3.1 7 7-3.1 7-7 7z"/><path d="M20 41c-.5-.1-.9-.2-1.4-.5-.5-.3-1.1-.4-1.7-.4-.4 0-.7.1-1.1.2l-2.6.9c-2.3.8-4.9-.2-6.1-2.3l-3.4-6c-1.2-2.1-.6-4.8 1.2-6.4l2.1-1.8v-.2l-2-1.7c-1.9-1.6-2.5-4.3-1.2-6.4l3.4-6c1.2-2.1 3.7-3.1 6.1-2.3l2.6.9c.4.1.7.2 1.1.2.6 0 1.1-.1 1.6-.4.4-.3.8-.4 1.4-.5.2-.4.4-.8.4-1.4V6.6C19.4 4 21.6 2 24.3 2h3.5c.8 0 1.5.1 2.2.4-.6-.4-1.4-.4-2.2-.4h-6.7c-2.4 0-4.5 1.7-4.9 4l-.4 1.6c-.5.2-1 .5-1.4.7l-1.7-.6c-2.3-.8-4.8.2-6 2.3l-3.4 6c-1.2 2.1-.7 4.8 1.2 6.3l1.4 1.2v.2L4.5 25c-1.8 1.6-2.4 4.3-1.2 6.3l3.4 6c1.2 2 3.7 3 6 2.3l1.7-.6c.4.3.9.5 1.4.7l.4 1.6c.5 2.3 2.5 4 4.9 4h6.6c.8 0 1.6-.2 2.3-.5-.7.2-1.4.4-2.2.4h-3.5C21.6 46 20.1 43.6 20 41z"/></svg>
    </div>
    <div class="sf-icon-btn" title="Notifications">
      <svg viewBox="0 0 52 52" fill="currentColor"><path d="M43.8 32L40 26.6V19c0-7.3-5.6-13.3-12.7-13.9V2.9c0-.6-.4-1-1-1h-.6c-.6 0-1 .4-1 1v2.2C17.6 5.7 12 11.7 12 19v7.6L8.2 32c-1 1.3-.1 3.2 1.6 3.2H19c0 3.9 3.1 7 7 7s7-3.1 7-7h9.2c1.7 0 2.6-1.9 1.6-3.2zM26 39c-2.2 0-4-1.8-4-4h8c0 2.2-1.8 4-4 4z"/></svg>
    </div>
    <div class="sf-avatar-wrap" title="User menu">
      <div class="sf-avatar">${s.userAvatar ? `<img src="${esc(s.userAvatar)}" alt="">` : esc((s.userName || 'U')[0])}</div>
      <span class="sf-avatar-presence"></span>
    </div>
  </div>
</div>

<div class="app-nav">
  <div class="app-nav-brand">
    <span class="waffle"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>
    <span>${esc(s.appName || 'Data Cloud')}</span>
  </div>
  ${s.navLinks.map((l, i) => `<a class="app-nav-link${i === 0 ? ' active' : ''}" href="#">${esc(l)}</a>`).join('')}
  <div class="app-nav-tab">
    ${esc(s.tabName || s.profile.name)}
    <span class="tab-close">×</span>
  </div>
  <span class="app-nav-lens">${esc(viewerLensLabel(strategy))} view · ${esc(strategy.objective)}</span>
</div>

<div class="up-shell">

  <!-- LEFT COLUMN — profile + loyalty + insights -->
  <div class="card profile-card">
    <div class="profile-head">
      <div class="profile-photo">
        ${s.profile.photo ? `<img src="${esc(s.profile.photo)}" alt="">` : ''}
      </div>
      <div>
        <div class="profile-name">${esc(s.profile.name)}</div>
        <div class="profile-city">${esc(s.profile.city)}</div>
      </div>
    </div>

    <div class="profile-fields">
      <div class="profile-field"><span class="profile-field-icon">🪪</span><span class="profile-field-label">Customer ID</span><span class="profile-field-value">${esc(s.profile.customerId)}</span></div>
      <div class="profile-field"><span class="profile-field-icon">✉️</span><span class="profile-field-label">Email Address</span><span class="profile-field-value">${esc(s.profile.email)}</span></div>
      ${s.profile.secondaryEmailInclude && s.profile.secondaryEmail ? `<div class="profile-field"><span class="profile-field-icon">👤</span><span class="profile-field-label">${esc(s.profile.secondaryEmailLabel || "Secondary Email")}</span><span class="profile-field-value">${esc(s.profile.secondaryEmail)}</span></div>` : ''}
      <div class="profile-field"><span class="profile-field-icon">📱</span><span class="profile-field-label">Phone Number</span><span class="profile-field-value">${esc(s.profile.phone)}</span></div>
      <div class="profile-field"><span class="profile-field-icon">📍</span><span class="profile-field-label">Address</span><span class="profile-field-value">${esc(s.profile.address)}</span></div>
    </div>

    <div class="profile-segment">
      <span class="profile-segment-icon">🎯</span>
      <span class="profile-segment-value">${esc(s.profile.segment)}</span>
    </div>

    <!-- Loyalty Insights -->
    <div class="insights-title">${esc(s.loyalty.title)}</div>
    <div class="insights-grid">
      <div class="insight-row"><span class="insight-icon">🎫</span><span class="insight-label">Member ID</span><span class="insight-value">${esc(s.loyalty.memberId)}</span></div>
      <div class="insight-row"><span class="insight-icon">🏆</span><span class="insight-label">Loyalty Tier</span><span class="insight-value">${esc(s.loyalty.tier)}</span></div>
      <div class="insight-row"><span class="insight-icon">💎</span><span class="insight-label">Loyalty Points</span><span class="insight-value">${esc(s.loyalty.points)}</span></div>
      <div class="insight-row"><span class="insight-icon">🎁</span><span class="insight-label">Redeemed Points</span><span class="insight-value">${esc(s.loyalty.redeemedPoints)}</span></div>
    </div>

    <!-- Athlete / Customer Insights -->
    <div class="insights-title">${esc(s.insights.title)}</div>
    <div class="insights-grid">
      ${s.insights.items.map(it => `
        <div class="insight-row">
          <span class="insight-icon">${raw(it.icon)}</span>
          <span class="insight-label">${esc(it.label)}</span>
          <span class="insight-value">${esc(it.value)}</span>
        </div>`).join('')}
    </div>

    <div class="powered-by">
      Powered By
      <span class="powered-by-icons">⚡ ✨ 🛒 🔍 ❤️ ❄️ 🧠</span>
    </div>
  </div>

  <!-- MIDDLE COLUMN — affinities + preferences + events + membership -->
  <div class="middle-col">
    ${visible.affinities ? `<div class="card">
      <div class="affinities-head">
        <div class="affinities-title">${esc(s.affinities.title)}</div>
        <div class="affinities-legend">
          <div class="affinities-legend-item"><span class="affinities-legend-dot" style="background:${esc(s.affinities.seriesA.color)}"></span>${esc(s.affinities.seriesA.label)}</div>
          <div class="affinities-legend-item"><span class="affinities-legend-dot" style="background:${esc(s.affinities.seriesB.color)}"></span>${esc(s.affinities.seriesB.label)}</div>
        </div>
      </div>
      ${s.affinities.groups.map(g => `
        <div class="affinity-group">
          <div class="affinity-group-title">${esc(g.name)}</div>
          ${g.items.map(it => `
            <div class="affinity-row">
              <div class="affinity-row-label">${esc(it.label)}</div>
              <div class="affinity-bars">
                <div class="affinity-bar" style="width:${Math.max(0,Math.min(100,it.a))}%; background:${esc(s.affinities.seriesA.color)};"></div>
                <div class="affinity-bar" style="width:${Math.max(0,Math.min(100,it.b))}%; background:${esc(s.affinities.seriesB.color)};"></div>
              </div>
            </div>`).join('')}
        </div>`).join('')}
      <div class="rec-view-all" style="margin-top:10px;">View All</div>
    </div>` : ''}

    ${visible.preferences ? `<div class="card">
      <div class="section-head">
        <div class="section-icon-title">
          ${renderSectionIcon(s.preferences.icon, '📈', '#066AFE')}
          <span class="section-title">${esc(s.preferences.title)}</span>
        </div>
      </div>
      <div class="pref-grid">
        ${s.preferences.items.map(it => `
          <div class="pref-item">
            <div class="pref-label">${esc(it.label)}</div>
            <div class="pref-value">${esc(it.value)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${(s.extraCards || []).map(card => `
      <div class="card">
        <div class="section-head">
          <div class="section-icon-title">
            ${renderSectionIcon(card.icon, '📋', '#066AFE')}
            <span class="section-title">${esc(card.title || 'Custom Section')}</span>
          </div>
        </div>
        <div class="pref-grid">
          ${(card.items || []).map(it => `
            <div class="pref-item">
              <div class="pref-label">${esc(it.label)}</div>
              <div class="pref-value">${esc(it.value)}</div>
            </div>`).join('')}
        </div>
      </div>`).join('')}
  </div>

  <!-- RIGHT COLUMN — Einstein Recs (top) + Events/Membership + Activity (bottom split) -->
  <div class="right-col">
    ${visible.recommendations ? `<div class="card">
      <div class="section-head">
        <div class="section-icon-title">
          <span class="section-icon" style="background:#0176D3;">☁</span>
          <span class="section-title">${esc(s.recommendations.title)}</span>
        </div>
      </div>
      <div class="recs-wrap">
        <div class="recs-carousel">
          ${s.recommendations.items.slice(0,2).map(rec => `
            <div class="rec-card">
              <div class="rec-image">${rec.image ? `<img src="${esc(rec.image)}" alt="">` : ''}</div>
              <div class="rec-body">
                <div class="rec-eyebrow">${esc(rec.eyebrow)}</div>
                <div class="rec-title">${esc(rec.title)}</div>
                <button class="rec-cta">${esc(rec.cta)}</button>
              </div>
            </div>`).join('')}
        </div>
        <div class="recs-arrow right">›</div>
      </div>
      <div class="rec-view-all">View All</div>
    </div>` : ''}

    <div class="right-bottom">
      <div class="right-bottom-col">
        ${visible.events ? `<div class="card">
          <div class="section-head">
            <div class="section-icon-title">
              ${renderSectionIcon(s.events.icon, '📅', '#066AFE')}
              <span class="section-title">${esc(s.events.title)}</span>
            </div>
            <span class="section-menu">▾</span>
          </div>
          <table class="events-table">
            <thead>
              <tr><th>Event</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${s.events.items.map(ev => `
                <tr>
                  <td class="ev-name"><a href="#">${esc(ev.name)}</a>${ev.confirmation ? `<span class="ev-confirm">Confirmation ${esc(ev.confirmation)}</span>` : ''}</td>
                  <td>${esc(ev.date)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

        ${visible.membership ? `<div class="card">
          <div class="section-head">
            <div class="section-icon-title">
              ${renderSectionIcon(s.membership.icon, '🎫', '#066AFE')}
              <span class="section-title">${esc(s.membership.title)}</span>
            </div>
            <span class="section-menu">▾</span>
          </div>
          <div class="member-grid">
            ${s.membership.items.map(it => `
              <div class="member-label">${esc(it.label)}</div>
              <div class="member-value">${esc(it.value)}</div>`).join('')}
          </div>
        </div>` : ''}

        ${(s.rightExtraCards || []).map(card => `
          <div class="card">
            <div class="section-head">
              <div class="section-icon-title">
                ${renderSectionIcon(card.icon, '📋', '#066AFE')}
                <span class="section-title">${esc(card.title || 'Custom Section')}</span>
              </div>
            </div>
            <div class="member-grid">
              ${(card.items || []).map(it => `
                <div class="member-label">${esc(it.label)}</div>
                <div class="member-value">${esc(it.value)}</div>`).join('')}
            </div>
          </div>`).join('')}
      </div>

      ${visible.activity ? `<div class="card">
        <div class="section-head">
          <div class="section-icon-title">
            <span class="section-icon" style="background:#4E4E4E;">≡</span>
            <span class="section-title">${esc(s.activity.title)}</span>
          </div>
          <span class="section-menu">▾</span>
        </div>
        <div class="activity-list">
          ${s.activity.items.map((it, i) => `
            <div class="activity-item">
              <div class="activity-icon color-${(i % 4) + 1}">${raw(it.icon)}</div>
              <div>
                <div class="activity-title">${esc(it.title)}</div>
                <div class="activity-body">${raw(it.body)}</div>
                <div class="activity-time">${esc(it.time)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>

</div>

</body>
</html>`;
}

// B2B account template. It intentionally has a different information
// hierarchy from the person-level profile above: account identity and value
// stay persistent, while commercial, adoption, relationship, and action
// signals become the primary working surface.
function generateAccountProfileHTML(state) {
  const s = state;
  const primary = s.colors?.primary || '#001E5B';
  const accent = s.colors?.accent || '#066AFE';
  const secondary = s.colors?.secondary || '#EAF5FE';
  const menuBg = s.colors?.menu || '#FFFFFF';
  const menuText = s.colors?.menuText || '#3E3E3C';
  const pageBg = s.colors?.pageBg || '#F4F8FC';
  const a = Object.assign({ name: 'Account', headquarters: '', accountId: '', industry: '', type: '', owner: '', website: '', employees: '', address: '', tier: '', parentAccount: '', logo: '' }, s.account || {});
  const m = Object.assign({ revenue: '—', revenueTrend: '', pipeline: '—', usageScore: '—', usageTrend: '', activeUsers: '', healthScore: '—', healthTrend: '', supportCases: '', renewalDate: '—', utilization: '' }, s.accountMetrics || {});
  const navLinks = Array.isArray(s.navLinks) ? s.navLinks : [];
  const insights = Array.isArray(s.insights?.items) ? s.insights.items : [];
  const affinities = s.affinities || { title: 'Account Interests & Signals', seriesA: {}, seriesB: {}, groups: [] };
  const affinityGroups = Array.isArray(affinities.groups) ? affinities.groups : [];
  const details = Array.isArray(s.preferences?.items) ? s.preferences.items : [];
  const stakeholders = Array.isArray(s.events?.items) ? s.events.items : [];
  const products = Array.isArray(s.membership?.items) ? s.membership.items : [];
  const recommendations = Array.isArray(s.recommendations?.items) ? s.recommendations.items.slice(0, 2) : [];
  const activity = Array.isArray(s.activity?.items) ? s.activity.items.slice(0, 5) : [];
  const extraCards = Array.isArray(s.extraCards) ? s.extraCards.slice(0, 1) : [];
  const initials = a.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'A';
  const numberWidth = (value, fallback) => {
    const number = Number.parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
    return `${Math.max(8, Math.min(100, Number.isFinite(number) ? number : fallback))}%`;
  };
  const accountMark = a.logo ? `<img src="${esc(a.logo)}" alt="">` : initials;
  const affinityPanel = affinities.includeAggregate === false ? '' : `
    <section class="b2b-card b2b-signals-card">
      <div class="b2b-section-head">
        <div><span class="b2b-overline">Aggregate intelligence</span><h2>${esc(affinities.title || 'Account Interests & Signals')}</h2></div>
        <div class="b2b-legend"><span><i style="background:${esc(affinities.seriesA?.color || primary)}"></i>${esc(affinities.seriesA?.label || 'People signals')}</span><span><i style="background:${esc(affinities.seriesB?.color || accent)}"></i>${esc(affinities.seriesB?.label || 'Account engagement')}</span></div>
      </div>
      <div class="b2b-signal-grid">
        ${affinityGroups.slice(0, 2).map(group => `
          <div class="b2b-signal-group"><h3>${esc(group.name)}</h3>
          ${(group.items || []).slice(0, 4).map(item => `
            <div class="b2b-signal-row"><span>${esc(item.label)}</span><div class="b2b-signal-bars"><b style="width:${Math.max(0, Math.min(100, Number(item.a) || 0))}%;background:${esc(affinities.seriesA?.color || primary)}"></b><em style="width:${Math.max(0, Math.min(100, Number(item.b) || 0))}%;background:${esc(affinities.seriesB?.color || accent)}"></em></div></div>`).join('')}
          </div>`).join('')}
      </div>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(a.name)} — Account Unified Profile</title>
<style>
:root{--primary:${primary};--accent:${accent};--secondary:${secondary};--menu:${menuBg};--menu-text:${menuText};--page:${pageBg};--ink:#13213a;--muted:#60708a;--line:#dbe5f0;--card:#fff;}
*{box-sizing:border-box}body{margin:0;min-width:1160px;background:var(--page);color:var(--ink);font-family:'Salesforce Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.35}.b2b-topbar{height:48px;padding:0 22px;display:flex;align-items:center;gap:16px;background:linear-gradient(180deg,#fff,#f5f7fa);border-bottom:1px solid var(--line)}.b2b-brand{display:flex;align-items:center;gap:9px;font-weight:700;color:var(--primary)}.b2b-brand-mark{width:28px;height:28px;border-radius:5px;background:var(--primary);color:#fff;display:grid;place-items:center;overflow:hidden;font-size:12px}.b2b-brand-mark img{width:100%;height:100%;object-fit:contain}.b2b-search{margin:auto;max-width:500px;flex:1;background:#fff;border:1px solid #cdd8e5;border-radius:5px;color:#8b98aa;padding:7px 12px}.b2b-actions{color:#6b7890;font-size:18px;letter-spacing:8px}.b2b-nav{height:45px;padding:0 22px;display:flex;align-items:stretch;gap:24px;background:var(--menu);border-bottom:3px solid var(--accent);overflow:hidden}.b2b-nav-app{display:flex;align-items:center;gap:8px;padding-right:18px;border-right:1px solid var(--line);font-size:15px;font-weight:700;color:var(--menu-text)}.b2b-waffle{font-size:17px;color:var(--accent)}.b2b-nav a{display:flex;align-items:center;text-decoration:none;color:var(--menu-text);white-space:nowrap;font-size:12px}.b2b-nav a:first-of-type{font-weight:700;color:var(--primary);border-bottom:3px solid var(--accent)}.b2b-nav-tab{margin-left:auto;display:flex;align-items:center;padding:0 14px;background:#fff;border:1px solid var(--line);border-bottom:none;border-radius:5px 5px 0 0;font-weight:600;white-space:nowrap}.b2b-shell{padding:14px;display:grid;grid-template-columns:278px minmax(540px,1fr) 276px;gap:14px;align-items:start}.b2b-card{background:var(--card);border:1px solid var(--line);border-radius:7px;box-shadow:0 1px 2px rgba(16,35,68,.04)}.b2b-account-rail{background:linear-gradient(160deg,var(--primary),#111c3b);color:#fff;border:none;padding:20px 18px;min-height:692px}.b2b-account-head{display:flex;align-items:center;gap:12px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.2)}.b2b-account-mark{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:var(--accent);border:2px solid rgba(255,255,255,.4);font-weight:700;font-size:18px;overflow:hidden}.b2b-account-mark img{width:100%;height:100%;object-fit:contain;background:#fff}.b2b-account-name{font-size:20px;font-weight:700;line-height:1.1}.b2b-account-location{margin-top:4px;color:rgba(255,255,255,.75);font-size:13px}.b2b-rail-fields{margin:18px 0 14px}.b2b-rail-field{display:grid;grid-template-columns:18px 86px 1fr;gap:6px;align-items:start;margin:10px 0;font-size:11.5px}.b2b-rail-icon{color:#b9d8ff}.b2b-rail-label{color:rgba(255,255,255,.68)}.b2b-rail-value{font-weight:600;overflow-wrap:anywhere}.b2b-rail-rule{height:1px;background:rgba(255,255,255,.19);margin:15px 0}.b2b-rail-stat{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.16)}.b2b-rail-stat:last-of-type{border-bottom:0}.b2b-rail-stat span{display:block;color:rgba(255,255,255,.69);font-size:11px}.b2b-rail-stat strong{display:block;margin-top:3px;font-size:15px}.b2b-health-meter{display:flex;align-items:center;gap:9px;margin-top:16px;padding:10px;background:rgba(255,255,255,.08);border-radius:6px}.b2b-meter{width:39px;height:39px;border-radius:50%;border:5px solid rgba(255,255,255,.22);border-top-color:#56e0b2;border-right-color:#56e0b2}.b2b-health-meter b{font-size:12px}.b2b-health-meter small{display:block;color:rgba(255,255,255,.7);margin-top:2px}.b2b-powered{position:relative;margin-top:24px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.72);font-size:10px}.b2b-core{display:flex;flex-direction:column;gap:12px}.b2b-tabs{padding:0 16px;display:flex;gap:27px;height:47px;align-items:flex-end}.b2b-tabs span{padding:0 1px 11px;font-size:13px;color:#63718a;font-weight:600}.b2b-tabs span.active{color:var(--primary);border-bottom:3px solid var(--accent)}.b2b-overview{padding:13px}.b2b-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.b2b-section-head h2{margin:2px 0 0;font-size:16px;letter-spacing:-.01em}.b2b-overline{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent);font-weight:800}.b2b-metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.b2b-metric{min-height:188px;padding:13px;border:1px solid #d9e7ff;background:linear-gradient(180deg,#fff,#f7fbff)}.b2b-metric h3{margin:0;color:#263a58;font-size:14px}.b2b-metric-primary{display:flex;align-items:flex-end;gap:7px;margin-top:12px}.b2b-metric-primary strong{font-size:25px;line-height:1}.b2b-trend{padding:3px 7px;border-radius:99px;background:#e9f8ee;color:#247342;font-size:10px;font-weight:700}.b2b-spark{height:34px;margin:14px 0 12px;background:linear-gradient(172deg,transparent 43%,rgba(6,106,254,.16) 44%,rgba(6,106,254,.16) 75%,transparent 76%);border-bottom:2px solid var(--accent);clip-path:polygon(0 68%,12% 38%,24% 45%,36% 65%,48% 39%,60% 56%,72% 29%,84% 47%,100% 62%,100% 100%,0 100%)}.b2b-metric-row{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #dce7f5;padding-top:8px;margin-top:8px;color:var(--muted);font-size:10.5px}.b2b-metric-row b{color:var(--ink);font-size:11px}.b2b-progress{height:7px;background:#dfe9f4;border-radius:99px;overflow:hidden;margin-top:10px}.b2b-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#6d8eff);border-radius:inherit}.b2b-details{padding:14px 16px}.b2b-details h2{font-size:15px;margin:0 0 12px}.b2b-detail-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:36px}.b2b-detail{padding:8px 0;border-bottom:1px solid var(--line)}.b2b-detail label{display:block;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.b2b-detail div{margin-top:4px;font-size:12px;font-weight:600}.b2b-signals-card{padding:14px 16px}.b2b-legend{display:flex;gap:10px;color:var(--muted);font-size:10px}.b2b-legend span{display:flex;align-items:center;gap:4px}.b2b-legend i{width:8px;height:8px;border-radius:50%;display:inline-block}.b2b-signal-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.b2b-signal-group h3{font-size:11px;margin:0 0 7px}.b2b-signal-row{display:grid;grid-template-columns:92px 1fr;gap:7px;align-items:center;margin:7px 0;font-size:10.5px}.b2b-signal-row>span{text-align:right;color:#384a64}.b2b-signal-bars{height:14px;display:flex;flex-direction:column;justify-content:center;gap:2px}.b2b-signal-bars b,.b2b-signal-bars em{display:block;height:5px;border-radius:2px}.b2b-side{display:flex;flex-direction:column;gap:12px}.b2b-side-card{padding:14px 15px}.b2b-side-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:15px;font-weight:700}.b2b-side-icon{display:grid;place-items:center;width:23px;height:23px;color:#fff;background:var(--primary);border-radius:4px;font-size:12px}.b2b-alert{padding:10px 0;border-top:1px solid var(--line)}.b2b-alert:first-of-type{border-top:0;padding-top:0}.b2b-alert b{display:block;font-size:12px}.b2b-alert span{display:block;color:var(--muted);font-size:11px;margin-top:3px}.b2b-alert .risk{color:#c23934}.b2b-action{border-top:1px solid var(--line);padding:12px 0}.b2b-action:first-of-type{border-top:0;padding-top:0}.b2b-action-eyebrow{color:var(--accent);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.b2b-action-title{font-weight:700;margin:4px 0 9px;font-size:12px;line-height:1.3}.b2b-action button{border:1px solid var(--accent);color:var(--accent);background:#fff;border-radius:4px;padding:5px 12px;font-weight:700;font-size:11px}.b2b-insight{display:grid;grid-template-columns:22px 1fr auto;gap:7px;align-items:center;padding:8px 0;border-top:1px solid var(--line);font-size:11px}.b2b-insight:first-of-type{border-top:0;padding-top:0}.b2b-insight-icon{color:var(--accent);font-weight:800}.b2b-insight-value{font-weight:700;text-align:right;max-width:94px}.b2b-table{width:100%;border-collapse:collapse;font-size:11px}.b2b-table th{text-align:left;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em;padding:0 0 7px}.b2b-table td{padding:7px 0;border-top:1px solid var(--line);vertical-align:top}.b2b-table td:first-child{font-weight:700;color:#235da5}.b2b-table td small{display:block;color:var(--muted);margin-top:2px}.b2b-activity{padding:0;overflow:hidden}.b2b-activity .b2b-side-head{padding:14px 15px;margin:0;border-bottom:1px solid var(--line)}.b2b-activity-item{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #eef3f8}.b2b-activity-item:first-of-type{border-top:0}.b2b-activity-bullet{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:var(--secondary);color:var(--accent);font-size:11px;flex:0 0 auto}.b2b-activity-item b{display:block;font-size:11px}.b2b-activity-item p{margin:2px 0 0;color:var(--muted);font-size:10px}.b2b-activity-item time{display:block;color:#8794a7;font-size:9px;margin-top:2px}.b2b-empty{color:var(--muted);font-size:11px;padding:8px 0}
</style>
</head>
<body>
  <header class="b2b-topbar"><div class="b2b-brand"><span class="b2b-brand-mark">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.brandName || 'D')[0])}</span><span>${esc(s.brandName || 'Data Cloud')}</span></div><div class="b2b-search">⌕&nbsp;&nbsp;Search this account, contacts, opportunities…</div><div class="b2b-actions">☆ ＋ ? ⚙ ●</div></header>
  <nav class="b2b-nav"><div class="b2b-nav-app"><span class="b2b-waffle">⠿</span>${esc(s.appName || 'Data Cloud')}</div>${navLinks.map(link => `<a href="#">${esc(link)}</a>`).join('')}<div class="b2b-nav-tab">▣&nbsp; ${esc(s.tabName || a.name)}</div></nav>
  <main class="b2b-shell">
    <aside class="b2b-card b2b-account-rail">
      <div class="b2b-account-head"><div class="b2b-account-mark">${accountMark}</div><div><div class="b2b-account-name">${esc(a.name)}</div><div class="b2b-account-location">${esc(a.headquarters)}</div></div></div>
      <div class="b2b-rail-fields">
        <div class="b2b-rail-field"><span class="b2b-rail-icon">▣</span><span class="b2b-rail-label">Account ID</span><span class="b2b-rail-value">${esc(a.accountId)}</span></div>
        <div class="b2b-rail-field"><span class="b2b-rail-icon">▥</span><span class="b2b-rail-label">Industry</span><span class="b2b-rail-value">${esc(a.industry)}</span></div>
        <div class="b2b-rail-field"><span class="b2b-rail-icon">▰</span><span class="b2b-rail-label">Type</span><span class="b2b-rail-value">${esc(a.type)}</span></div>
        <div class="b2b-rail-field"><span class="b2b-rail-icon">⌖</span><span class="b2b-rail-label">Employees</span><span class="b2b-rail-value">${esc(a.employees)}</span></div>
      </div>
      <div class="b2b-rail-rule"></div>
      <div class="b2b-rail-stat"><span>Current Commercial Value</span><strong>${esc(m.revenue)}</strong></div>
      <div class="b2b-rail-stat"><span>Open Pipeline</span><strong>${esc(m.pipeline)}</strong></div>
      <div class="b2b-rail-stat"><span>Renewal Date</span><strong>${esc(m.renewalDate)}</strong></div>
      <div class="b2b-rail-stat"><span>Account Tier</span><strong>${esc(a.tier)}</strong></div>
      <div class="b2b-health-meter"><div class="b2b-meter"></div><div><b>${esc(m.healthScore)} Account Health</b><small>${esc(m.healthTrend || 'Calculated from adoption, engagement & support')}</small></div></div>
      <div class="b2b-powered">Powered by&nbsp;&nbsp; ✦ ◉ ◌ ◈ ⌁ 🧠</div>
    </aside>

    <section class="b2b-core">
      <div class="b2b-card b2b-tabs"><span class="active">Overview</span><span>People</span><span>Sales</span><span>Success</span><span>Related</span></div>
      <section class="b2b-card b2b-overview">
        <div class="b2b-section-head"><div><span class="b2b-overline">Account 360</span><h2>Commercial, usage & customer experience</h2></div><span class="b2b-overline">Modeled demo data</span></div>
        <div class="b2b-metric-grid">
          <article class="b2b-metric"><h3>Commercial</h3><div class="b2b-metric-primary"><strong>${esc(m.revenue)}</strong><span class="b2b-trend">${esc(m.revenueTrend)}</span></div><div class="b2b-spark"></div><div class="b2b-metric-row"><span>Open pipeline</span><b>${esc(m.pipeline)}</b></div><div class="b2b-metric-row"><span>Renewal</span><b>${esc(m.renewalDate)}</b></div></article>
          <article class="b2b-metric"><h3>Product Usage</h3><div class="b2b-metric-primary"><strong>${esc(m.usageScore)}</strong><span class="b2b-trend">${esc(m.usageTrend)}</span></div><div class="b2b-spark"></div><div class="b2b-metric-row"><span>Adoption</span><b>${esc(m.activeUsers)}</b></div><div class="b2b-progress"><i style="width:${numberWidth(m.usageScore, 65)}"></i></div><div class="b2b-metric-row"><span>Utilization</span><b>${esc(m.utilization || m.usageScore)}</b></div></article>
          <article class="b2b-metric"><h3>Customer Experience</h3><div class="b2b-metric-primary"><strong>${esc(m.healthScore)}</strong><span class="b2b-trend">${esc(m.healthTrend)}</span></div><div class="b2b-spark"></div><div class="b2b-metric-row"><span>Support</span><b>${esc(m.supportCases)}</b></div><div class="b2b-progress"><i style="width:${numberWidth(m.healthScore, 72)}"></i></div><div class="b2b-metric-row"><span>Relationship</span><b>${esc(insights.find(item => /stakeholder/i.test(item.label))?.value || 'Mapped')}</b></div></article>
        </div>
      </section>
      <section class="b2b-card b2b-details"><h2>Account details</h2><div class="b2b-detail-grid">
        <div class="b2b-detail"><label>Account owner</label><div>${esc(a.owner)}</div></div><div class="b2b-detail"><label>Website</label><div>${esc(a.website)}</div></div>
        <div class="b2b-detail"><label>Account type</label><div>${esc(a.type)}</div></div><div class="b2b-detail"><label>Parent account</label><div>${esc(a.parentAccount)}</div></div>
        ${details.slice(0, 4).map(item => `<div class="b2b-detail"><label>${esc(item.label)}</label><div>${esc(item.value)}</div></div>`).join('')}
      </div></section>
      ${affinityPanel}
    </section>

    <aside class="b2b-side">
      <section class="b2b-card b2b-side-card"><div class="b2b-side-head"><span class="b2b-side-icon">▤</span>Notification Center</div><div class="b2b-alert"><b class="risk">Renewal planning window</b><span>Renewal ${esc(m.renewalDate)} · review coverage and adoption now.</span></div><div class="b2b-alert"><b>Account engagement ${esc(m.usageTrend || 'trending')}</b><span>${esc(m.activeUsers || 'Usage signal')} with monitored stakeholder activity.</span></div></section>
      <section class="b2b-card b2b-side-card"><div class="b2b-side-head"><span class="b2b-side-icon">✦</span>${esc(s.recommendations?.title || 'Next Best Actions')}</div>${recommendations.length ? recommendations.map(rec => `<div class="b2b-action"><div class="b2b-action-eyebrow">${esc(rec.eyebrow)}</div><div class="b2b-action-title">${esc(rec.title)}</div><button>${esc(rec.cta || 'Activate')}</button></div>`).join('') : '<div class="b2b-empty">No actions configured.</div>'}</section>
      <section class="b2b-card b2b-side-card"><div class="b2b-side-head"><span class="b2b-side-icon">◎</span>${esc(s.insights?.title || 'Calculated Insights')}</div>${insights.slice(0, 6).map(item => `<div class="b2b-insight"><span class="b2b-insight-icon">${raw(item.icon || '•')}</span><span>${esc(item.label)}</span><span class="b2b-insight-value">${esc(item.value)}</span></div>`).join('')}</section>
      <section class="b2b-card b2b-side-card"><div class="b2b-side-head"><span class="b2b-side-icon">♙</span>${esc(s.events?.title || 'Key Stakeholders')}</div><table class="b2b-table"><thead><tr><th>Person</th><th>Role</th></tr></thead><tbody>${stakeholders.slice(0, 4).map(item => `<tr><td>${esc(item.name)}<small>${esc(item.confirmation)}</small></td><td>${esc(item.date)}</td></tr>`).join('')}</tbody></table></section>
      <section class="b2b-card b2b-side-card"><div class="b2b-side-head"><span class="b2b-side-icon">▣</span>${esc(s.membership?.title || 'Products & Contracts')}</div><table class="b2b-table"><tbody>${products.slice(0, 4).map(item => `<tr><td>${esc(item.label)}</td><td>${esc(item.value)}</td></tr>`).join('')}</tbody></table></section>
      ${extraCards.map(card => `<section class="b2b-card b2b-side-card"><div class="b2b-side-head"><span class="b2b-side-icon">${raw(card.icon || '▤')}</span>${esc(card.title)}</div><table class="b2b-table"><tbody>${(card.items || []).slice(0, 4).map(item => `<tr><td>${esc(item.label)}</td><td>${esc(item.value)}</td></tr>`).join('')}</tbody></table></section>`).join('')}
      <section class="b2b-card b2b-activity"><div class="b2b-side-head"><span class="b2b-side-icon">≡</span>${esc(s.activity?.title || 'Account Activity')}</div>${activity.map(item => `<div class="b2b-activity-item"><span class="b2b-activity-bullet">${raw(item.icon || '•')}</span><div><b>${esc(item.title)}</b><p>${raw(item.body)}</p><time>${esc(item.time)}</time></div></div>`).join('')}</section>
    </aside>
  </main>
</body>
</html>`;
}

// The account experience is a single fixed-canvas workspace. Rather than
// stacking every B2B section vertically, each view gets a focused, clickable
// tab so the exported profile remains presentation-ready at 1300 × 860.
function generateTabbedAccountProfileHTML(state) {
  const s = state;
  const primary = s.colors?.primary || '#001E5B';
  const accent = s.colors?.accent || '#066AFE';
  const uiAccent = accent;
  const secondary = s.colors?.secondary || '#EAF5FE';
  const menuBg = s.colors?.menu || '#FFFFFF';
  const menuText = s.colors?.menuText || '#3E3E3C';
  const pageBg = s.colors?.pageBg || '#F4F8FC';
  const a = Object.assign({ name: 'Account', headquarters: '', accountId: '', industry: '', type: '', owner: '', website: '', employees: '', address: '', tier: '', parentAccount: '', logo: '' }, s.account || {});
  const m = Object.assign({ revenue: '—', revenueTrend: '', pipeline: '—', usageScore: '—', usageTrend: '', activeUsers: '', healthScore: '—', healthTrend: '', supportCases: '', renewalDate: '—', utilization: '' }, s.accountMetrics || {});
  const visible = Object.assign({ overviewMetrics: true, overviewDetails: true, overviewSignals: true, peopleStakeholders: true, salesProducts: true, salesActions: true, successInsights: true, relatedActivity: true }, s.b2bSections || {});
  const strategy = Object.assign({ lens: 'sales', objective: 'convert' }, s.profileStrategy || {});
  const layout = s.layout || {};
  const accountRailWidth = Math.max(240, Math.min(390, Number(layout.leftColWidth) || 290));
  const actionRailWidth = Math.max(230, Math.min(390, Number(layout.middleColWidth) || 320));
  const insights = Array.isArray(s.insights?.items) ? s.insights.items : [];
  const affinities = s.affinities || { title: 'Account Interests & Signals', seriesA: {}, seriesB: {}, groups: [] };
  const groups = Array.isArray(affinities.groups) ? affinities.groups : [];
  const details = Array.isArray(s.preferences?.items) ? s.preferences.items : [];
  const stakeholders = Array.isArray(s.events?.items) ? s.events.items : [];
  const products = Array.isArray(s.membership?.items) ? s.membership.items : [];
  const recommendations = Array.isArray(s.recommendations?.items) ? s.recommendations.items.slice(0, 2) : [];
  const activity = Array.isArray(s.activity?.items) ? s.activity.items.slice(0, 4) : [];
  const extraCard = Array.isArray(s.extraCards) ? s.extraCards[0] : null;
  const initials = a.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'A';
  const percent = (value, fallback) => {
    const n = Number.parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
    return `${Math.max(8, Math.min(100, Number.isFinite(n) ? n : fallback))}%`;
  };
  const canonicalNav = ['Home', 'Data Streams', 'Segments', 'Activations', 'Data Lake Objects', 'Data Model', 'Identity Resolutions', 'Calculated Insights'];
  const accountMark = a.logo ? `<img src="${esc(a.logo)}" alt="">` : initials;
  const noModules = `<section class="account-card account-empty"><strong>No modules visible in this view.</strong><span>Turn modules back on in Step 5 of the generator.</span></section>`;
  const panel = (title, body, className = '') => `<section class="account-card ${className}"><div class="account-panel-head"><h2>${esc(title)}</h2></div>${body}</section>`;
  const signalPanel = () => !visible.overviewSignals || affinities.includeAggregate === false ? '' : panel(affinities.title || 'Account Interests & Signals', `
    <div class="account-legend"><span><i style="background:${esc(affinities.seriesA?.color || primary)}"></i>${esc(affinities.seriesA?.label || 'People signals')}</span><span><i style="background:${esc(affinities.seriesB?.color || accent)}"></i>${esc(affinities.seriesB?.label || 'Account engagement')}</span></div>
    <div class="account-signal-grid">${groups.slice(0, 2).map(group => `<div><h3>${esc(group.name)}</h3>${(group.items || []).slice(0, 3).map(item => `<div class="account-signal"><span>${esc(item.label)}</span><div><b style="width:${Math.max(0, Math.min(100, Number(item.a) || 0))}%;background:${esc(affinities.seriesA?.color || primary)}"></b><em style="width:${Math.max(0, Math.min(100, Number(item.b) || 0))}%;background:${esc(affinities.seriesB?.color || accent)}"></em></div></div>`).join('')}</div>`).join('')}</div>`, 'account-signals');
  const accountDetailsPanel = () => !visible.overviewDetails ? '' : panel('Account details', `<div class="account-detail-grid">
    <div><label>Account owner</label><strong>${esc(a.owner)}</strong></div><div><label>Website</label><strong>${esc(a.website)}</strong></div>
    <div><label>Account type</label><strong>${esc(a.type)}</strong></div><div><label>Parent account</label><strong>${esc(a.parentAccount)}</strong></div>
    ${details.slice(0, 4).map(item => `<div><label>${esc(item.label)}</label><strong>${esc(item.value)}</strong></div>`).join('')}
  </div>`);
  const insightsPanel = () => !visible.successInsights ? '' : panel(s.insights?.title || 'Calculated Insights', `<div class="account-insights">${insights.slice(0, 6).map(item => `<div><span>${raw(item.icon || '•')}</span><label>${esc(item.label)}</label><strong>${esc(item.value)}</strong></div>`).join('')}</div>`);
  const actionPanel = () => !visible.salesActions ? '' : panel(s.recommendations?.title || 'Next Best Actions', recommendations.length ? `<div class="account-actions">${recommendations.map(item => `<div><small>${esc(item.eyebrow)}</small><strong>${esc(item.title)}</strong><button type="button">${esc(item.cta || 'Activate')}</button></div>`).join('')}</div>` : '<div class="account-empty">No actions configured.</div>');
  const activityPanel = () => !visible.relatedActivity ? '' : panel(s.activity?.title || 'Account Activity', `<div class="account-activity">${activity.map(item => `<div><span>${raw(item.icon || '•')}</span><p><strong>${esc(item.title)}</strong>${raw(item.body)}<small>${esc(item.time)}</small></p></div>`).join('')}</div>`);
  const productsPanel = () => !visible.salesProducts ? '' : panel(s.membership?.title || 'Products & Contracts', `<table class="account-table"><tbody>${products.slice(0, 4).map(item => `<tr><th>${esc(item.label)}</th><td>${esc(item.value)}</td></tr>`).join('')}</tbody></table>`);
  const stakeholderPanel = () => !visible.peopleStakeholders ? '' : panel(s.events?.title || 'Key Stakeholders', `<table class="account-table account-people-table"><thead><tr><th>Person</th><th>Role</th><th>Title</th></tr></thead><tbody>${stakeholders.slice(0, 5).map(item => `<tr><th>${esc(item.name)}</th><td>${esc(item.date)}</td><td>${esc(item.confirmation)}</td></tr>`).join('')}</tbody></table>`);
  const extraPanel = () => !extraCard ? '' : panel(extraCard.title || 'Related account details', `<table class="account-table"><tbody>${(extraCard.items || []).slice(0, 4).map(item => `<tr><th>${esc(item.label)}</th><td>${esc(item.value)}</td></tr>`).join('')}</tbody></table>`);

  const overviewMain = `${visible.overviewMetrics ? panel('Commercial, product usage & customer experience', `<div class="account-metric-grid">
    <article><h3>Commercial</h3><strong>${esc(m.revenue)}</strong><small>${esc(m.revenueTrend)}</small><div class="account-spark"></div><p>Open pipeline <b>${esc(m.pipeline)}</b></p><p>Renewal <b>${esc(m.renewalDate)}</b></p></article>
    <article><h3>Product Usage</h3><strong>${esc(m.usageScore)}</strong><small>${esc(m.usageTrend)}</small><div class="account-spark"></div><p>${esc(m.activeUsers)}</p><div class="account-progress"><i style="width:${percent(m.usageScore, 65)}"></i></div><p>Utilization <b>${esc(m.utilization || m.usageScore)}</b></p></article>
    <article><h3>Customer Experience</h3><strong>${esc(m.healthScore)}</strong><small>${esc(m.healthTrend)}</small><div class="account-spark"></div><p>Support <b>${esc(m.supportCases)}</b></p><div class="account-progress"><i style="width:${percent(m.healthScore, 72)}"></i></div><p>Renewal readiness <b>On track</b></p></article>
  </div>`, 'account-overview-metrics') : ''}${accountDetailsPanel()}${signalPanel()}` || noModules;
  const overviewSide = `${panel('Notification Center', `<div class="account-notice"><strong>Renewal planning window</strong><span>Renewal ${esc(m.renewalDate)} · review coverage and adoption now.</span></div><div class="account-notice"><strong>Account engagement ${esc(m.usageTrend || 'trending')}</strong><span>${esc(m.activeUsers || 'Usage signal')} with monitored stakeholder activity.</span></div>`)}${insightsPanel()}`;
  const peopleMain = `${stakeholderPanel()}${panel('Relationship coverage', `<div class="account-relationship"><div><strong>${esc(insights.find(item => /stakeholder/i.test(item.label))?.value || '8 of 10 roles mapped')}</strong><span>Buying committee coverage</span></div><div><strong>${esc(m.healthScore)}</strong><span>Relationship health</span></div><div><strong>${esc(m.usageScore)}</strong><span>Engaged account teams</span></div></div>`)}${visible.peopleStakeholders ? panel('Contact intelligence', `<div class="account-note">Use the <b>People</b> workspace for champions, decision makers, contact coverage, and their aggregate account signals.</div>`) : ''}` || noModules;
  const peopleSide = `${activityPanel()}${signalPanel()}`;
  const salesMain = `${visible.overviewMetrics ? panel('Revenue & pipeline', `<div class="account-sales-summary"><div><label>Current commercial value</label><strong>${esc(m.revenue)}</strong><small>${esc(m.revenueTrend)}</small></div><div><label>Open pipeline</label><strong>${esc(m.pipeline)}</strong><small>Renewal ${esc(m.renewalDate)}</small></div><div><label>Account tier</label><strong>${esc(a.tier)}</strong><small>${esc(a.type)}</small></div></div>`) : ''}${productsPanel()}${extraPanel()}` || noModules;
  const salesSide = `${actionPanel()}${panel('Sales signal', `<div class="account-note"><b>Expansion propensity:</b> ${esc(insights.find(item => /expansion/i.test(item.label))?.value || 'High')}<br><br><b>Recommended motion:</b> pair the renewal conversation with an adoption-value review.</div>`)}`;
  const successMain = `${visible.overviewMetrics ? panel('Adoption & health', `<div class="account-success-grid"><div><label>Usage score</label><strong>${esc(m.usageScore)}</strong><small>${esc(m.usageTrend)}</small><div class="account-progress"><i style="width:${percent(m.usageScore, 65)}"></i></div></div><div><label>Health score</label><strong>${esc(m.healthScore)}</strong><small>${esc(m.healthTrend)}</small><div class="account-progress"><i style="width:${percent(m.healthScore, 72)}"></i></div></div><div><label>Support snapshot</label><strong>${esc(m.supportCases)}</strong><small>Monitored in customer success</small></div></div>`) : ''}${insightsPanel()}` || noModules;
  const successSide = `${panel('Success focus', `<div class="account-notice"><strong>Renewal readiness</strong><span>Renewal ${esc(m.renewalDate)}. Align champions to value realized.</span></div><div class="account-notice"><strong>Adoption opportunity</strong><span>${esc(m.activeUsers || 'Usage')} · increase active-team coverage before renewal.</span></div>`)}${visible.overviewSignals ? signalPanel() : ''}`;
  const relatedMain = `${accountDetailsPanel()}${extraPanel()}${visible.relatedActivity ? activityPanel() : ''}` || noModules;
  const relatedSide = `${visible.peopleStakeholders ? stakeholderPanel() : ''}${actionPanel()}` || noModules;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(a.name)} — Account Unified Profile</title>
<style>
:root{--primary:${primary};--accent:${uiAccent};--secondary:${secondary};--menu:${menuBg};--menu-text:${menuText};--page:${pageBg};--ink:#13213a;--muted:#65748a;--line:#dbe3ed;--card:#fff}*{box-sizing:border-box}html,body{width:1300px;height:860px;overflow:hidden}body{margin:0;background:var(--page);color:var(--ink);font-family:'Salesforce Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.3}.sf-global{height:42px;padding:0 18px;display:flex;align-items:center;gap:16px;background:linear-gradient(180deg,#fff,#f4f6f9);border-bottom:1px solid var(--line)}.sf-brand{display:flex;align-items:center;gap:8px;min-width:190px;font-size:14px;font-weight:700;color:#252f3e}.sf-brand-mark{width:30px;height:30px;border-radius:5px;background:var(--primary);color:#fff;display:grid;place-items:center;overflow:hidden;font-size:12px}.sf-brand-mark img{width:100%;height:100%;object-fit:contain}.sf-search{height:24px;flex:1;max-width:540px;margin:auto;background:#fff;border:1px solid #cdd6e1;border-radius:3px;color:#7c899b;padding:5px 10px;font-size:10px}.sf-icons{display:flex;align-items:center;gap:5px;color:#64748b}.sf-icon{height:26px;min-width:26px;padding:0 6px;display:grid;place-items:center;background:#f5f6f8;border:1px solid #dfe5ec;border-radius:3px;font-size:12px}.sf-user{width:25px;height:25px;border-radius:50%;background:#7cab8c;color:#fff;display:grid;place-items:center;font-size:10px}.sf-app-nav{height:44px;padding:0 16px;display:flex;align-items:stretch;gap:20px;background:var(--menu);border-bottom:3px solid var(--accent);overflow:hidden}.sf-app-name{display:flex;align-items:center;gap:8px;padding-right:15px;border-right:1px solid var(--line);font-weight:700;font-size:13px;color:var(--menu-text)}.sf-waffle{font-size:17px;color:var(--accent)}.sf-app-nav a{display:flex;align-items:center;color:var(--menu-text);text-decoration:none;font-size:10px;white-space:nowrap}.sf-app-nav a:first-of-type{font-weight:700;color:var(--primary);border-bottom:3px solid var(--accent)}.sf-profile-tab{margin-left:auto;display:flex;align-items:center;padding:0 12px;background:#fff;border:1px solid var(--line);border-bottom:0;border-radius:4px 4px 0 0;font-size:11px;font-weight:700;white-space:nowrap}.account-shell{height:774px;padding:12px;display:grid;grid-template-columns:${accountRailWidth}px minmax(0,1fr);gap:12px}.account-rail{height:100%;padding:18px 16px;border:0;border-radius:7px;background:linear-gradient(155deg,var(--primary),#142042);color:#fff;overflow:hidden}.account-head{display:flex;align-items:center;gap:11px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.2)}.account-mark{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;overflow:hidden;background:var(--accent);border:2px solid rgba(255,255,255,.35);font-weight:700;font-size:17px}.account-mark img{width:100%;height:100%;object-fit:contain;background:#fff}.account-name{font-size:19px;font-weight:700;line-height:1.1}.account-location{margin-top:4px;color:rgba(255,255,255,.72)}.rail-fields{margin:16px 0}.rail-field{display:grid;grid-template-columns:17px 84px 1fr;gap:5px;margin:10px 0;font-size:11px}.rail-field i{color:#b9d8ff;font-style:normal}.rail-field span{color:rgba(255,255,255,.68)}.rail-field b{overflow-wrap:anywhere}.rail-rule{height:1px;background:rgba(255,255,255,.18);margin:13px 0}.rail-stat{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.15)}.rail-stat span{display:block;color:rgba(255,255,255,.68);font-size:10px}.rail-stat strong{display:block;margin-top:3px;font-size:14px}.rail-health{display:flex;align-items:center;gap:9px;margin-top:14px;padding:9px;background:rgba(255,255,255,.09);border-radius:5px}.rail-gauge{width:36px;height:36px;border:5px solid rgba(255,255,255,.25);border-top-color:#56e0b2;border-right-color:#56e0b2;border-radius:50%}.rail-health b{font-size:11px}.rail-health small{display:block;margin-top:2px;color:rgba(255,255,255,.68);font-size:9px}.rail-powered{margin-top:17px;padding-top:11px;border-top:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.68);font-size:10px}.account-workspace{height:100%;background:#fff;border:1px solid var(--line);border-radius:7px;box-shadow:0 1px 2px rgba(20,38,67,.04);overflow:hidden}.account-tabs{height:43px;display:flex;align-items:end;padding:0 16px;gap:25px;border-bottom:1px solid var(--line)}.account-tab{appearance:none;border:0;background:transparent;padding:0 1px 10px;color:#64748b;font:600 12px inherit;cursor:pointer}.account-tab[aria-selected="true"]{color:var(--primary);border-bottom:3px solid var(--accent)}.account-views{height:calc(100% - 43px);padding:10px}.account-view{display:none;height:100%;grid-template-columns:minmax(0,1fr) ${actionRailWidth}px;gap:10px}.account-view.active{display:grid}.account-pane{min-width:0;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:hidden}.account-card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px;box-shadow:0 1px 2px rgba(17,38,73,.035)}.account-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.account-panel-head h2{margin:0;font-size:14px;color:#21344f}.account-overview-metrics{padding:12px}.account-metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.account-metric-grid article{padding:10px;border:1px solid #dce9fa;background:linear-gradient(180deg,#fff,#f7fbff);min-width:0}.account-metric-grid h3{margin:0;color:#334968;font-size:11px}.account-metric-grid article>strong{display:inline-block;margin:8px 0 0;font-size:22px;line-height:1}.account-metric-grid article>small{display:inline-block;margin-left:5px;color:#267447;background:#e7f7ec;border-radius:99px;padding:2px 5px;font-size:8px;font-weight:700}.account-spark{height:20px;margin:10px 0 7px;background:linear-gradient(169deg,transparent 45%,rgba(6,106,254,.17) 46%,rgba(6,106,254,.17) 72%,transparent 73%);border-bottom:2px solid var(--accent);clip-path:polygon(0 70%,16% 32%,31% 54%,45% 34%,60% 68%,75% 28%,88% 45%,100% 56%,100% 100%,0 100%)}.account-metric-grid p{display:flex;justify-content:space-between;gap:5px;margin:5px 0 0;padding-top:5px;border-top:1px solid #dfe8f2;color:var(--muted);font-size:9px}.account-metric-grid p b{color:var(--ink)}.account-progress{height:6px;margin:7px 0;background:#dfe8f3;border-radius:99px;overflow:hidden}.account-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#73a0ff);border-radius:inherit}.account-detail-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:26px}.account-detail-grid>div{padding:6px 0;border-top:1px solid var(--line)}.account-detail-grid>div:nth-child(-n+2){border-top:0;padding-top:0}.account-detail-grid label,.account-sales-summary label,.account-success-grid label{display:block;color:var(--muted);font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.account-detail-grid strong{display:block;margin-top:3px;font-size:11px}.account-legend{display:flex;gap:10px;margin:-1px 0 8px;color:var(--muted);font-size:9px}.account-legend span{display:flex;gap:4px;align-items:center}.account-legend i{width:7px;height:7px;border-radius:50%}.account-signal-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.account-signal-grid h3{margin:0 0 5px;font-size:10px}.account-signal{display:grid;grid-template-columns:83px 1fr;gap:7px;align-items:center;margin:6px 0;font-size:9px}.account-signal>span{text-align:right;color:#40536d}.account-signal>div{height:13px;display:flex;flex-direction:column;justify-content:center;gap:2px}.account-signal b,.account-signal em{display:block;height:4px;border-radius:2px}.account-notice{padding:9px 0;border-top:1px solid var(--line)}.account-notice:first-child{border-top:0;padding-top:0}.account-notice strong{display:block;font-size:11px}.account-notice span{display:block;margin-top:3px;color:var(--muted);font-size:10px}.account-insights>div{display:grid;grid-template-columns:16px 1fr auto;gap:5px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:10px}.account-insights>div:first-child{border-top:0;padding-top:0}.account-insights span{color:var(--accent);font-weight:700}.account-insights label{color:#3d5069}.account-insights strong{max-width:95px;text-align:right;font-size:10px}.account-table{width:100%;border-collapse:collapse;font-size:10px}.account-table th{text-align:left;color:var(--muted);font-size:9px;letter-spacing:.03em}.account-table td,.account-table th{padding:7px 0;border-top:1px solid var(--line);vertical-align:top}.account-table thead th{border-top:0;padding-top:0;text-transform:uppercase}.account-table tbody th{color:#265fa6;font-weight:700}.account-people-table td{padding-right:9px}.account-relationship,.account-sales-summary,.account-success-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.account-relationship>div,.account-sales-summary>div,.account-success-grid>div{padding:10px;background:#f7fbff;border:1px solid #dce9fa}.account-relationship strong,.account-sales-summary strong,.account-success-grid strong{display:block;margin-top:3px;font-size:18px}.account-relationship span,.account-sales-summary small,.account-success-grid small{display:block;margin-top:3px;color:var(--muted);font-size:9px}.account-actions>div{padding:9px 0;border-top:1px solid var(--line)}.account-actions>div:first-child{padding-top:0;border-top:0}.account-actions small{display:block;color:var(--accent);font-size:9px;font-weight:700;text-transform:uppercase}.account-actions strong{display:block;margin:3px 0 7px;font-size:11px}.account-actions button{border:1px solid var(--accent);border-radius:4px;background:#fff;color:var(--accent);padding:4px 9px;font-size:9px;font-weight:700}.account-activity>div{display:flex;gap:7px;padding:7px 0;border-top:1px solid var(--line)}.account-activity>div:first-child{border-top:0;padding-top:0}.account-activity>div>span{width:18px;height:18px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:var(--secondary);color:var(--accent);font-size:10px}.account-activity p{margin:0;font-size:9px;color:var(--muted)}.account-activity p strong{display:block;color:var(--ink);font-size:10px}.account-activity small{display:block;margin-top:2px;color:#8390a2;font-size:8px}.account-note{font-size:11px;line-height:1.45;color:var(--muted)}.account-empty{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:120px;text-align:center;color:var(--muted)}.account-empty span{margin-top:4px;font-size:10px}
</style><style>:root{--accent:${accent}}.sf-profile-tab{margin-left:0}.account-view-context{margin-left:auto;padding:0 0 10px;color:#506681;font-size:10px;font-weight:700;white-space:nowrap}</style></head>
<body>
<header class="sf-global"><div class="sf-brand"><span class="sf-brand-mark">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.brandName || 'D')[0])}</span><span>${esc(s.brandName || 'Customer')}</span></div><div class="sf-search">⌕&nbsp;&nbsp;Search Salesforce</div><div class="sf-icons"><span class="sf-icon">☆⌄</span><span class="sf-icon">＋</span><span class="sf-icon">?</span><span class="sf-icon">⚙</span><span class="sf-icon">●</span><span class="sf-user">${esc((s.userName || 'U')[0])}</span></div></header>
<nav class="sf-app-nav"><div class="sf-app-name"><span class="sf-waffle">⠿</span>Data Cloud</div>${canonicalNav.map(link => `<a href="#">${esc(link)}</a>`).join('')}<div class="sf-profile-tab">♙&nbsp; ${esc(a.name)} &nbsp;×</div></nav>
<main class="account-shell"><aside class="account-rail"><div class="account-head"><div class="account-mark">${accountMark}</div><div><div class="account-name">${esc(a.name)}</div><div class="account-location">${esc(a.headquarters)}</div></div></div><div class="rail-fields"><div class="rail-field"><i>▣</i><span>Account ID</span><b>${esc(a.accountId)}</b></div><div class="rail-field"><i>▥</i><span>Industry</span><b>${esc(a.industry)}</b></div><div class="rail-field"><i>▰</i><span>Type</span><b>${esc(a.type)}</b></div><div class="rail-field"><i>⌖</i><span>Employees</span><b>${esc(a.employees)}</b></div></div><div class="rail-rule"></div><div class="rail-stat"><span>Current Commercial Value</span><strong>${esc(m.revenue)}</strong></div><div class="rail-stat"><span>Open Pipeline</span><strong>${esc(m.pipeline)}</strong></div><div class="rail-stat"><span>Renewal Date</span><strong>${esc(m.renewalDate)}</strong></div><div class="rail-stat"><span>Account Tier</span><strong>${esc(a.tier)}</strong></div><div class="rail-health"><div class="rail-gauge"></div><div><b>${esc(m.healthScore)} Account Health</b><small>${esc(m.healthTrend || 'Calculated from account signals')}</small></div></div><div class="rail-powered">Powered by&nbsp;&nbsp; ✦ ◉ ◌ ◈ ⌁ 🧠</div></aside>
<section class="account-workspace"><div class="account-tabs" role="tablist" aria-label="Account views"><button class="account-tab" type="button" role="tab" aria-selected="true" aria-controls="account-overview" data-account-tab="overview">Overview</button><button class="account-tab" type="button" role="tab" aria-selected="false" aria-controls="account-people" data-account-tab="people">People</button><button class="account-tab" type="button" role="tab" aria-selected="false" aria-controls="account-sales" data-account-tab="sales">Sales</button><button class="account-tab" type="button" role="tab" aria-selected="false" aria-controls="account-success" data-account-tab="success">Success</button><button class="account-tab" type="button" role="tab" aria-selected="false" aria-controls="account-related" data-account-tab="related">Related</button><span class="account-view-context">${esc(viewerLensLabel(strategy))} view · ${esc(strategy.objective)}</span></div><div class="account-views">
<div class="account-view active" id="account-overview" role="tabpanel"><div class="account-pane">${overviewMain || noModules}</div><div class="account-pane">${overviewSide}</div></div>
<div class="account-view" id="account-people" role="tabpanel"><div class="account-pane">${peopleMain || noModules}</div><div class="account-pane">${peopleSide || noModules}</div></div>
<div class="account-view" id="account-sales" role="tabpanel"><div class="account-pane">${salesMain || noModules}</div><div class="account-pane">${salesSide || noModules}</div></div>
<div class="account-view" id="account-success" role="tabpanel"><div class="account-pane">${successMain || noModules}</div><div class="account-pane">${successSide || noModules}</div></div>
<div class="account-view" id="account-related" role="tabpanel"><div class="account-pane">${relatedMain || noModules}</div><div class="account-pane">${relatedSide || noModules}</div></div>
</div></section></main>
<script>(function(){var tabs=document.querySelectorAll('[data-account-tab]'),views=document.querySelectorAll('.account-view');tabs.forEach(function(tab){tab.addEventListener('click',function(){var name=tab.getAttribute('data-account-tab');tabs.forEach(function(item){item.setAttribute('aria-selected',String(item===tab));});views.forEach(function(view){view.classList.toggle('active',view.id==='account-'+name);});});});})();</script>
</body></html>`;
}
