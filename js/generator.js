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
  const primary = s.colors.primary || '#001E5B';
  const accent = s.colors.accent || '#066AFE';
  const secondary = s.colors.secondary || '#EAF5FE';
  const menuBg = s.colors.menu || '#FFFFFF';
  const menuText = s.colors.menuText || '#3E3E3C';
  const pageBg = s.colors.pageBg || '#EAF5FE';
  const leftW = Math.max(220, Math.min(500, Number(s.layout?.leftColWidth) || 290));
  const middleMin = Math.max(220, Math.min(500, Number(s.layout?.middleColWidth) || 320));

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

/* ── Main grid ─────────────────────────────────────────────── */
.up-shell {
  border: 2px solid var(--accent);
  border-top: none;
  background: var(--page-bg);
  padding: 12px;
  display: grid;
  grid-template-columns: ${leftW}px minmax(${middleMin}px, ${middleMin + 40}px) 1fr;
  gap: 12px;
  align-items: start;
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
  height: 160px;
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
.rec-eyebrow { color: var(--accent); font-size: 12px; font-weight: 600; }
.rec-title {
  color: var(--accent);
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
.activity-list { display: flex; flex-direction: column; gap: 14px; position: relative; }
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

.right-col { display: flex; flex-direction: column; gap: 12px; }
.middle-col { display: flex; flex-direction: column; gap: 12px; }

/* Right column: Einstein Recs on top, then Events+Membership on left + Activity on right */
.right-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
.right-bottom-col { display: flex; flex-direction: column; gap: 12px; }

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
    <div class="card">
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
    </div>

    <div class="card">
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
    </div>

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
    <div class="card">
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
    </div>

    <div class="right-bottom">
      <div class="right-bottom-col">
        <div class="card">
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
        </div>

        <div class="card">
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
        </div>

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

      <div class="card">
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
      </div>
    </div>
  </div>

</div>

</body>
</html>`;
}
