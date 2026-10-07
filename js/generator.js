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

// Extra identity facts are owned by the selected view, not the shared brand.
function renderProfileRailFields(fields, mode = 'b2c') {
  if (!Array.isArray(fields)) return '';
  return fields.filter(field => field && typeof field === 'object' && field.visible !== false).map(field => {
    const label = esc(field.label || 'Custom field');
    const value = esc(field.value ?? '');
    const icon = raw(field.icon || '•');
    if (mode === 'b2b') return `<div class="rail-field" data-rail-field-id="${esc(field.id)}"><i aria-hidden="true">${icon}</i><span>${label}</span><b>${value}</b></div>`;
    return `<div class="profile-field" data-rail-field-id="${esc(field.id)}"><span class="profile-field-icon" aria-hidden="true">${icon}</span><span class="profile-field-label">${label}</span><span class="profile-field-value">${value}</span></div>`;
  }).join('');
}

function renderLayoutStatusScript(state) {
  const revision = JSON.stringify(String(state._renderRevision || '')).replace(/</g, '\\u003c');
  return `<script>
(function () {
  function report() {
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'upg:layout-status', revision: ${revision}, height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0), viewport: window.innerHeight }, '*');
  }
  window.upgReportLayout = report;
  window.addEventListener('load', report, { once: true });
  if (document.readyState === 'complete') report();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(report).catch(function () {});
})();
</script>`;
}

// All interpolated styles and image sources pass these narrow validators.
// Render a safe copy: producing a preview must never rewrite the saved draft.
function renderColor(value, fallback = '#066afe') {
  const color = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + color.slice(1).split('').map(char => char + char).join('').toLowerCase();
  return fallback;
}

function safeImageURL(value) {
  const url = String(value || '').trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  if (/^assets\/[a-z0-9_./-]+\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(url) && !url.includes('..')) return url;
  if (!/^https?:\/\//i.test(url) || /[\u0000-\u0020\u007f]/.test(url)) return '';
  try {
    const parsed = new URL(url);
    return parsed.username || parsed.password ? '' : parsed.href;
  } catch (_) { return ''; }
}

function safeRenderState(state) {
  const colors = state.colors || {};
  const affinities = state.affinities || {};
  return Object.assign({}, state, {
    colors: {
      primary: renderColor(colors.primary, '#001e5b'), accent: renderColor(colors.accent),
      secondary: renderColor(colors.secondary, '#eaf5fe'), menu: renderColor(colors.menu, '#ffffff'),
      menuText: renderColor(colors.menuText, '#3e3e3c'), pageBg: renderColor(colors.pageBg, '#eaf5fe')
    },
    logo: safeImageURL(state.logo), userAvatar: safeImageURL(state.userAvatar),
    profile: Object.assign({}, state.profile, { photo: safeImageURL(state.profile?.photo) }),
    account: Object.assign({}, state.account, { logo: safeImageURL(state.account?.logo) }),
    affinities: Object.assign({}, affinities, {
      seriesA: Object.assign({}, affinities.seriesA, { color: renderColor(affinities.seriesA?.color, '#001e5b') }),
      seriesB: Object.assign({}, affinities.seriesB, { color: renderColor(affinities.seriesB?.color) })
    }),
    recommendations: Object.assign({}, state.recommendations, {
      items: (state.recommendations?.items || []).map(item => Object.assign({}, item, { image: safeImageURL(item.image) }))
    }),
    navLinks: Array.isArray(state.navLinks) ? state.navLinks : []
  });
}

// Reconstruct a small formatting language instead of passing authored HTML
// through to the browser. No links, images, event handlers or arbitrary CSS.
// Keeping a stack prevents closing tags from escaping the containing card.
function raw(value) {
  const source = String(value ?? '');
  const allowed = new Set(['b', 'strong', 'em', 'i', 'u', 's', 'br', 'span']);
  const stack = [];
  let output = '', cursor = 0;
  const text = value => esc(value).replace(/&amp;((?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);)/gi, '&$1');
  const tokens = /<\/?([a-z][a-z0-9]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  for (const match of source.matchAll(tokens)) {
    output += text(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const name = match[1].toLowerCase();
    if (!allowed.has(name)) continue;
    if (match[0].startsWith('</')) {
      const index = stack.lastIndexOf(name);
      if (index >= 0) while (stack.length > index) output += `</${stack.pop()}>`;
      continue;
    }
    let style = '';
    if (name === 'span') {
      const attr = match[0].match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const declarations = [];
      for (const declaration of (attr?.[1] || attr?.[2] || '').split(';')) {
        const [property, ...rest] = declaration.split(':');
        const key = property.trim().toLowerCase(), val = rest.join(':').trim().toLowerCase();
        if (key === 'color' && renderColor(val, '')) declarations.push(`color:${getAccountColorTheme(renderColor(val), '#066afe', '#ffffff').primaryInk}`);
        if (key === 'font-weight' && /^(?:normal|bold|[1-9]00)$/.test(val)) declarations.push(`font-weight:${val}`);
        if (key === 'font-style' && /^(?:normal|italic)$/.test(val)) declarations.push(`font-style:${val}`);
        if (key === 'text-decoration' && /^(?:none|underline|line-through)$/.test(val)) declarations.push(`text-decoration:${val}`);
      }
      if (declarations.length) style = ` style="${declarations.join(';')}"`;
    }
    output += `<${name}${style}>`;
    if (name !== 'br') stack.push(name);
  }
  output += text(source.slice(cursor));
  while (stack.length) output += `</${stack.pop()}>`;
  return output;
}

function scorePercent(value) {
  const text = String(value ?? '').trim();
  const fraction = text.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const plain = text.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  let number = null;
  if (fraction && Number(fraction[2]) > 0) number = Number(fraction[1]) / Number(fraction[2]) * 100;
  else if (plain) number = Number(plain[1]);
  return number === null || !Number.isFinite(number) ? null : Math.max(0, Math.min(100, number));
}

function renderScoreMeter(value, label) {
  const score = scorePercent(value);
  return score === null ? `<span class="score-unknown">${esc(label)}: unavailable</span>`
    : `<div class="account-progress" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}"><i style="width:${score}%"></i></div>`;
}

// Account output retains this data for compatibility with existing exports;
// the generated Salesforce chrome intentionally keeps it hidden.
function viewerLensLabel(strategy) {
  const lens = typeof strategy === 'string' ? strategy : strategy?.lens;
  if (lens === 'custom') return String(strategy?.customRole || '').trim().slice(0, 64) || 'Custom profile';
  return ({ sales: 'Sales', service: 'Service', marketing: 'Marketing', success: 'Customer Success' })[lens] || 'Sales';
}

// A section-icon slot. If `icon` looks like a URL or data URL, render the image.
// If it's a short emoji string, render inside the colored square.
// If it's empty, fall back to `emojiFallback` inside the colored square.
function renderSectionIcon(icon, emojiFallback, bgColor) {
  const bg = renderColor(bgColor);
  const image = safeImageURL(icon);
  if (image) {
    return `<span class="section-icon section-icon-image"><img src="${esc(image)}" alt=""></span>`;
  }
  const glyph = typeof icon === 'string' && icon.trim() ? icon : emojiFallback;
  return `<span class="section-icon" style="background:${esc(bg)};">${raw(glyph)}</span>`;
}

// Account surfaces use the chosen brand color without an added gradient.
// Keep text readable independently of whether that color is light or dark.
function getAccountColorTheme(primary, accent, menu) {
  const rgb = color => {
    let hex = String(color || '').replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split('').map(char => char + char).join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return [19, 33, 58];
    return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  };
  const luminance = channels => channels.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (a, b) => {
    const light = luminance(rgb(a)), dark = luminance(rgb(b));
    return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
  };
  const foreground = background => {
    if (contrast('#13213a', background) >= 4.5) return '#13213a';
    return contrast('#ffffff', background) >= 4.5 ? '#ffffff' : '#000000';
  };
  const text = foreground(primary);
  const channels = rgb(text);
  const background = rgb(primary);
  const mutedCandidate = '#' + channels.map((value, index) =>
    Math.round(value * 0.78 + background[index] * 0.22).toString(16).padStart(2, '0')
  ).join('');
  return {
    text,
    muted: contrast(mutedCandidate, primary) >= 4.5 ? mutedCandidate : text,
    rule: `rgba(${channels.join(',')},0.2)`,
    surface: text === '#ffffff' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.35)',
    markText: foreground(accent),
    primaryInk: contrast(primary, '#ffffff') >= 4.5 ? primary : '#13213a',
    accentInk: contrast(accent, '#ffffff') >= 4.5 ? accent : '#13213a',
    navInk: contrast(primary, menu) >= 4.5 ? primary : foreground(menu)
  };
}

function generateProfileHTML(state) {
  if (state.profileType === 'b2b') return generateTabbedAccountProfileHTML(state);
  const s = safeRenderState(state);
  const primary = s.colors.primary || '#001E5B';
  const accent = s.colors.accent || '#066AFE';
  const secondary = s.colors.secondary || '#EAF5FE';
  const menuBg = s.colors.menu || '#FFFFFF';
  const menuText = getAccountColorTheme(s.colors.menuText, accent, menuBg).navInk;
  const pageBg = s.colors.pageBg || '#EAF5FE';
  const theme = getAccountColorTheme(primary, accent, menuBg);
  const leftW = Math.max(220, Math.min(500, Number(s.layout?.leftColWidth) || 290));
  const middleMin = Math.max(220, Math.min(500, Number(s.layout?.middleColWidth) || 320));
  const visible = Object.assign({ affinities: true, preferences: true, events: true, membership: true, recommendations: true, activity: true }, s.b2cSections || {});
  const customCards = [...(s.extraCards || []).map(card => Object.assign({ placement: 'middle' }, card)),
    ...(s.rightExtraCards || []).map(card => Object.assign({ placement: 'right' }, card))];
  const isVisibleCustomCard = (card) => (card?.visibility || 'visible') === 'visible';
  const middleExtraCards = customCards.filter(card => isVisibleCustomCard(card) && (card.placement || 'middle') !== 'right');
  const rightExtraCards = customCards.filter(card => isVisibleCustomCard(card) && card.placement === 'right');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(s.profile.name)} — Unified Profile</title>
<style>
:root {
  --primary: ${primary};
  --primary-text: ${theme.text};
  --primary-ink: ${theme.primaryInk};
  --accent: ${accent};
  --accent-ink: ${theme.accentInk};
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
html { width: 1300px; min-height: 860px; }
body {
  min-width: 1300px;
  min-height: 860px;
  margin: 0;
  font-family: 'Salesforce Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background: var(--page-bg);
  font-size: 13px;
  line-height: 1.4;
  overflow-x: hidden;
  overflow-y: auto;
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
  color: var(--primary-text);
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
  overflow: hidden;
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
  white-space: nowrap;
  flex: 0 0 auto;
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
  /* The two Salesforce chrome rows occupy ~102px at their rendered size. */
  height: auto;
  min-height: calc(860px - 102px);
  align-items: stretch;
  overflow: visible;
}

.card {
  min-width: 0;
  overflow-wrap: anywhere;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

/* ── Profile card ─────────────────────────────────────────── */
.profile-card { display: flex; flex-direction: column; gap: 14px; align-self: start; }
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
  color: var(--primary-ink);
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
  color: var(--primary-ink);
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
.events-table .ev-name > span:first-child { color: #006DCC; text-decoration: underline; font-weight: 500; }
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
  max-height: 390px;
  overflow-y: auto;
  scrollbar-gutter: stable;
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
  color: var(--primary-text);
  border: none;
  border-radius: 4px;
  padding: 5px 20px;
  font-size: 12px;
  font-weight: 600;
  margin-top: 2px;
}
.rec-count { margin: 8px 0 0; color: var(--text-muted); font-size: 11px; }
.recs-carousel:focus-visible, .activity-list:focus-visible { outline: 2px solid var(--primary-ink); outline-offset: 3px; }
.affinity-bar, .affinities-legend-dot { box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }

/* ── Engagement Activity timeline ──────────────────────────── */
.activity-list { display: flex; flex-direction: column; gap: 14px; position: relative; max-height: 290px; overflow-y: auto; scrollbar-gutter: stable; padding-right: 5px; }
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
.activity-icon.color-2 { background: #EAF4FF; color: var(--accent-ink); }
.activity-icon.color-3 { background: #FFEAF3; color: #F02D64; }
.activity-icon.color-4 { background: #EFF9EF; color: #2A8A4A; }
.activity-title { font-size: 13px; font-weight: 600; color: var(--text); }
.activity-body { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
.activity-time { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

.right-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; overflow: visible; }
.middle-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; overflow: visible; }

/* Right column: Einstein Recs on top, then Events+Membership on left + Activity on right */
.right-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; flex: 0 0 auto; min-height: 0; overflow: visible; }
.right-bottom-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: visible; }
.activity-card { min-height: 0; max-height: 360px; align-self: start; overflow: hidden; display: flex; flex-direction: column; }
.activity-card .activity-list { flex: 1; min-height: 0; }
/* The default canvas clips only the activity area to preserve a clean first
   screenshot. Once a user intentionally adds cards on the right, that column
   becomes part of the normal page flow so no added card is lost below it. */
.right-bottom-expanded { flex: 0 0 auto; overflow: visible; }
.right-bottom-expanded > .activity-card { align-self: start; max-height: 340px; }

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
  ${s.navLinks.map((l, i) => `<span class="app-nav-link${i === 0 ? ' active' : ''}">${esc(l)}</span>`).join('')}
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
      ${renderProfileRailFields(s.railFields)}
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
                <div class="affinity-bar" style="width:${scorePercent(it.a) ?? 0}%; background:${esc(s.affinities.seriesA.color)};"></div>
                <div class="affinity-bar" style="width:${scorePercent(it.b) ?? 0}%; background:${esc(s.affinities.seriesB.color)};"></div>
              </div>
            </div>`).join('')}
        </div>`).join('')}
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

    ${middleExtraCards.map(card => `
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
        <div class="recs-carousel" role="list" tabindex="0" aria-label="${esc(s.recommendations.title || 'Recommendations')}">
          ${s.recommendations.items.map(rec => `
            <div class="rec-card" role="listitem">
              <div class="rec-image">${rec.image ? `<img src="${esc(rec.image)}" alt="">` : ''}</div>
              <div class="rec-body">
                <div class="rec-eyebrow">${esc(rec.eyebrow)}</div>
                <div class="rec-title">${esc(rec.title)}</div>
                <span class="rec-cta">${esc(rec.cta)}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <p class="rec-count">${s.recommendations.items.length} recommendation${s.recommendations.items.length === 1 ? '' : 's'}${s.recommendations.items.length > 2 ? ' · Scroll to review all' : ''}</p>
    </div>` : ''}

    <div class="right-bottom${rightExtraCards.length ? ' right-bottom-expanded' : ''}">
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
                  <td class="ev-name"><span>${esc(ev.name)}</span>${ev.confirmation ? `<span class="ev-confirm">Confirmation ${esc(ev.confirmation)}</span>` : ''}</td>
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

        ${rightExtraCards.map(card => `
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

      ${visible.activity ? `<div class="card activity-card">
        <div class="section-head">
          <div class="section-icon-title">
            <span class="section-icon" style="background:#4E4E4E;">≡</span>
            <span class="section-title">${esc(s.activity.title)}</span>
          </div>
          <span class="section-menu">▾</span>
        </div>
        <div class="activity-list" role="list" tabindex="0" aria-label="${esc(s.activity.title || 'Activity')}">
          ${s.activity.items.map((it, i) => `
            <div class="activity-item" role="listitem">
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

${renderLayoutStatusScript(s)}
</body>
</html>`;
}

// B2B account template. It intentionally has a different information
// hierarchy from the person-level profile above: account identity and value
// stay persistent, while commercial, adoption, relationship, and action
// signals become the primary working surface.
function generateAccountProfileHTML(state) {
  return generateTabbedAccountProfileHTML(state);
}

// The account experience is a single fixed-canvas workspace. Rather than
// stacking every B2B section vertically, each view gets a focused, clickable
// tab so the exported profile remains presentation-ready at 1300 × 860.
function generateTabbedAccountProfileHTML(state) {
  const s = safeRenderState(state);
  const primary = s.colors?.primary || '#001E5B';
  const accent = s.colors?.accent || '#066AFE';
  const uiAccent = accent;
  const secondary = s.colors?.secondary || '#EAF5FE';
  const menuBg = s.colors?.menu || '#FFFFFF';
  const menuText = getAccountColorTheme(s.colors.menuText, accent, menuBg).navInk;
  const theme = getAccountColorTheme(primary, accent, menuBg);
  const pageBg = s.colors?.pageBg || '#F4F8FC';
  const a = Object.assign({ name: 'Account', headquarters: '', accountId: '', industry: '', type: '', owner: '', website: '', employees: '', address: '', tier: '', parentAccount: '', logo: '' }, s.account || {});
  const m = Object.assign({ revenue: '—', revenueTrend: '', pipeline: '—', usageScore: '—', usageTrend: '', activeUsers: '', healthScore: '—', healthTrend: '', supportCases: '', renewalDate: '—', utilization: '' }, s.accountMetrics || {});
  const visible = Object.assign({ overviewMetrics: true, overviewDetails: true, overviewSignals: true, peopleStakeholders: true, salesProducts: true, salesActions: true, successInsights: true, relatedActivity: true }, s.b2bSections || {});
  const layout = s.layout || {};
  const accountRailWidth = Math.max(240, Math.min(390, Number(layout.leftColWidth) || 290));
  const actionRailWidth = Math.max(230, Math.min(390, Number(layout.middleColWidth) || 320));
  const insights = Array.isArray(s.insights?.items) ? s.insights.items : [];
  const affinities = s.affinities || { title: 'Account Interests & Signals', seriesA: {}, seriesB: {}, groups: [] };
  const groups = Array.isArray(affinities.groups) ? affinities.groups : [];
  const details = Array.isArray(s.preferences?.items) ? s.preferences.items : [];
  const stakeholders = Array.isArray(s.events?.items) ? s.events.items : [];
  const products = Array.isArray(s.membership?.items) ? s.membership.items : [];
  const recommendations = s.recommendations.items;
  const activity = Array.isArray(s.activity?.items) ? s.activity.items : [];
  const extraCards = [...(s.extraCards || []).map(card => Object.assign({ placement: 'middle' }, card)),
    ...(s.rightExtraCards || []).map(card => Object.assign({ placement: 'right' }, card))]
    .filter(card => (card?.visibility || 'visible') === 'visible');
  const initials = String(a.name).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'A';
  const accountMark = a.logo ? `<img src="${esc(a.logo)}" alt="">` : esc(initials);
  const tabs = ['overview', 'people', 'sales', 'success', 'related'];
  const selectedTab = tabs.includes(s.accountViewTab) ? s.accountViewTab : 'overview';
  const tabRevision = JSON.stringify(String(s._renderRevision || '')).replace(/</g, '\\u003c');
  const noModules = `<section class="account-card account-empty"><strong>No modules visible in this view.</strong><span>Turn modules back on in Step 5 of the generator.</span></section>`;
  const panel = (title, body, className = '') => `<section class="account-card ${className}"><div class="account-panel-head"><h2>${esc(title)}</h2></div>${body}</section>`;
  const signalPanel = () => !visible.overviewSignals || affinities.includeAggregate === false ? '' : panel(affinities.title || 'Account Interests & Signals', `
    <div class="account-legend"><span><i style="background:${esc(affinities.seriesA?.color || primary)}"></i>${esc(affinities.seriesA?.label || 'People signals')}</span><span><i style="background:${esc(affinities.seriesB?.color || accent)}"></i>${esc(affinities.seriesB?.label || 'Account engagement')}</span></div>
    <div class="account-signal-grid">${groups.map(group => `<div><h3>${esc(group.name)}</h3>${(group.items || []).map(item => `<div class="account-signal"><span>${esc(item.label)}</span><div><b style="width:${scorePercent(item.a) ?? 0}%;background:${esc(affinities.seriesA?.color || primary)}"></b><em style="width:${scorePercent(item.b) ?? 0}%;background:${esc(affinities.seriesB?.color || accent)}"></em></div></div>`).join('')}</div>`).join('')}</div>`, 'account-signals');
  const accountDetailsPanel = () => !visible.overviewDetails ? '' : panel('Account details', `<div class="account-detail-grid">
    <div><label>Account owner</label><strong>${esc(a.owner)}</strong></div><div><label>Website</label><strong>${esc(a.website)}</strong></div>
    <div><label>Account type</label><strong>${esc(a.type)}</strong></div><div><label>Parent account</label><strong>${esc(a.parentAccount)}</strong></div>
    ${details.map(item => `<div><label>${esc(item.label)}</label><strong>${esc(item.value)}</strong></div>`).join('')}
  </div>`);
  const insightsPanel = () => !visible.successInsights ? '' : panel(s.insights?.title || 'Calculated Insights', `<div class="account-insights">${insights.map(item => `<div><span>${raw(item.icon || '•')}</span><label>${esc(item.label)}</label><strong>${esc(item.value)}</strong></div>`).join('')}</div>`);
  const actionPanel = () => !visible.salesActions ? '' : panel(s.recommendations?.title || 'Next Best Actions', recommendations.length ? `<div class="account-actions" role="list" tabindex="0" aria-label="${esc(s.recommendations?.title || 'Next Best Actions')}">${recommendations.map(item => `<div role="listitem">${item.image ? `<img class="account-action-image" src="${esc(item.image)}" alt="">` : ''}<small>${esc(item.eyebrow)}</small><strong>${esc(item.title)}</strong><span class="account-action-label">${esc(item.cta || 'Activate')}</span></div>`).join('')}</div><p class="rec-count">${recommendations.length} actions · Scroll to review all</p>` : '<div class="account-empty">No actions configured.</div>');
  const activityPanel = () => !visible.relatedActivity ? '' : panel(s.activity?.title || 'Account Activity', `<div class="account-activity" role="list" tabindex="0" aria-label="${esc(s.activity?.title || 'Account Activity')}">${activity.map(item => `<div role="listitem"><span>${raw(item.icon || '•')}</span><p><strong>${esc(item.title)}</strong>${raw(item.body)}<small>${esc(item.time)}</small></p></div>`).join('')}</div>`, 'account-activity-card');
  const productsPanel = () => !visible.salesProducts ? '' : panel(s.membership?.title || 'Products & Contracts', `<table class="account-table"><tbody>${products.map(item => `<tr><th>${esc(item.label)}</th><td>${esc(item.value)}</td></tr>`).join('')}</tbody></table>`);
  const stakeholderPanel = () => !visible.peopleStakeholders ? '' : panel(s.events?.title || 'Key Stakeholders', `<table class="account-table account-people-table"><thead><tr><th>Person</th><th>Role</th><th>Title</th></tr></thead><tbody>${stakeholders.map(item => `<tr><th>${esc(item.name)}</th><td>${esc(item.date)}</td><td>${esc(item.confirmation)}</td></tr>`).join('')}</tbody></table>`);
  const extraPanel = placement => extraCards.filter(card => (card.placement === 'right' ? 'right' : 'middle') === placement).map(card => panel(card.title || 'Related account details', `<table class="account-table"><tbody>${(card.items || []).map(item => `<tr><th>${esc(item.label)}</th><td>${esc(item.value)}</td></tr>`).join('')}</tbody></table>`)).join('');

  const overviewMain = `${visible.overviewMetrics ? panel('Commercial, product usage & customer experience', `<div class="account-metric-grid">
    <article><h3>Commercial</h3><strong>${esc(m.revenue)}</strong><small>${esc(m.revenueTrend)}</small><p>Open pipeline <b>${esc(m.pipeline)}</b></p><p>Renewal <b>${esc(m.renewalDate)}</b></p></article>
    <article><h3>Product Usage</h3><strong>${esc(m.usageScore)}</strong><small>${esc(m.usageTrend)}</small><p>${esc(m.activeUsers)}</p>${renderScoreMeter(m.usageScore, 'Usage score')}<p>Utilization <b>${esc(m.utilization || m.usageScore)}</b></p></article>
    <article><h3>Customer Experience</h3><strong>${esc(m.healthScore)}</strong><small>${esc(m.healthTrend)}</small><p>Support <b>${esc(m.supportCases)}</b></p>${renderScoreMeter(m.healthScore, 'Health score')}<p>Health trend <b>${esc(m.healthTrend || 'Not provided')}</b></p></article>
  </div>`, 'account-overview-metrics') : ''}${accountDetailsPanel()}${signalPanel()}` || noModules;
  const overviewSide = `${panel('Notification Center', `<div class="account-notice"><strong>Renewal planning window</strong><span>Renewal ${esc(m.renewalDate)} · review coverage and adoption now.</span></div><div class="account-notice"><strong>Account engagement ${esc(m.usageTrend || 'not provided')}</strong><span>${esc(m.activeUsers || 'Usage signal')}</span></div>`)}${insightsPanel()}`;
  const peopleMain = `${stakeholderPanel()}${panel('Relationship coverage', `<div class="account-relationship"><div><strong>${esc(insights.find(item => /stakeholder/i.test(item.label))?.value || 'Not provided')}</strong><span>Buying committee coverage</span></div><div><strong>${esc(m.healthScore)}</strong><span>Relationship health</span></div><div><strong>${esc(m.usageScore)}</strong><span>Engaged account teams</span></div></div>`)}${visible.peopleStakeholders ? panel('Contact intelligence', `<div class="account-note">Use the <b>People</b> workspace for champions, decision makers, contact coverage, and their aggregate account signals.</div>`) : ''}` || noModules;
  const peopleSide = `${activityPanel()}${signalPanel()}`;
  const salesMain = `${visible.overviewMetrics ? panel('Revenue & pipeline', `<div class="account-sales-summary"><div><label>Current commercial value</label><strong>${esc(m.revenue)}</strong><small>${esc(m.revenueTrend)}</small></div><div><label>Open pipeline</label><strong>${esc(m.pipeline)}</strong><small>Renewal ${esc(m.renewalDate)}</small></div><div><label>Account tier</label><strong>${esc(a.tier)}</strong><small>${esc(a.type)}</small></div></div>`) : ''}${productsPanel()}` || noModules;
  const salesSide = `${actionPanel()}${panel('Sales signal', `<div class="account-note"><b>Expansion propensity:</b> ${esc(insights.find(item => /expansion/i.test(item.label))?.value || 'Not provided')}<br><br><b>Recommended motion:</b> pair the renewal conversation with an adoption-value review.</div>`)}`;
  const successMain = `${visible.overviewMetrics ? panel('Adoption & health', `<div class="account-success-grid"><div><label>Usage score</label><strong>${esc(m.usageScore)}</strong><small>${esc(m.usageTrend)}</small>${renderScoreMeter(m.usageScore, 'Usage score')}</div><div><label>Health score</label><strong>${esc(m.healthScore)}</strong><small>${esc(m.healthTrend)}</small>${renderScoreMeter(m.healthScore, 'Health score')}</div><div><label>Support snapshot</label><strong>${esc(m.supportCases)}</strong><small>Support information</small></div></div>`) : ''}${insightsPanel()}` || noModules;
  const successSide = `${panel('Success focus', `<div class="account-notice"><strong>Renewal readiness</strong><span>Renewal ${esc(m.renewalDate)}. Align champions to value realized.</span></div><div class="account-notice"><strong>Adoption opportunity</strong><span>${esc(m.activeUsers || 'Usage')} · increase active-team coverage before renewal.</span></div>`)}${visible.overviewSignals ? signalPanel() : ''}`;
  const relatedMain = `${accountDetailsPanel()}${visible.relatedActivity ? activityPanel() : ''}` || noModules;
  const relatedSide = `${visible.peopleStakeholders ? stakeholderPanel() : ''}${actionPanel()}` || noModules;
  const viewPanels = [
    ['overview', overviewMain, overviewSide], ['people', peopleMain, peopleSide],
    ['sales', salesMain, salesSide], ['success', successMain, successSide],
    ['related', relatedMain, relatedSide]
  ];

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(a.name)} — Account Unified Profile</title>
<style>
:root{--primary:${primary};--accent:${uiAccent};--secondary:${secondary};--menu:${menuBg};--menu-text:${menuText};--page:${pageBg};--rail-text:${theme.text};--rail-muted:${theme.muted};--rail-rule:${theme.rule};--rail-surface:${theme.surface};--mark-text:${theme.markText};--primary-ink:${theme.primaryInk};--ink:#13213a;--muted:#65748a;--line:#dbe3ed;--card:#fff}*{box-sizing:border-box}html,body{width:1300px;height:860px;overflow:hidden}body{margin:0;background:var(--page);color:var(--ink);font-family:'Salesforce Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.3}.sf-global{height:42px;padding:0 18px;display:flex;align-items:center;gap:16px;background:linear-gradient(180deg,#fff,#f4f6f9);border-bottom:1px solid var(--line)}.sf-brand{display:flex;align-items:center;gap:8px;min-width:190px;font-size:14px;font-weight:700;color:#252f3e}.sf-brand-mark{width:30px;height:30px;border-radius:5px;background:var(--primary);color:var(--rail-text);display:grid;place-items:center;overflow:hidden;font-size:12px}.sf-brand-mark img{width:100%;height:100%;object-fit:contain}.sf-search{height:24px;flex:1;max-width:540px;margin:auto;background:#fff;border:1px solid #cdd6e1;border-radius:3px;color:#7c899b;padding:5px 10px;font-size:10px}.sf-icons{display:flex;align-items:center;gap:5px;color:#64748b}.sf-icon{height:26px;min-width:26px;padding:0 6px;display:grid;place-items:center;background:#f5f6f8;border:1px solid #dfe5ec;border-radius:3px;font-size:12px}.sf-user{width:25px;height:25px;border-radius:50%;background:#7cab8c;color:#fff;display:grid;place-items:center;font-size:10px}.sf-app-nav{height:44px;padding:0 16px;display:flex;align-items:stretch;gap:20px;background:var(--menu);border-bottom:3px solid var(--accent);overflow:hidden}.sf-app-name{display:flex;align-items:center;gap:8px;padding-right:15px;border-right:1px solid var(--line);font-weight:700;font-size:13px;color:var(--menu-text)}.sf-waffle{font-size:17px;color:var(--accent)}.sf-app-nav a{display:flex;align-items:center;color:var(--menu-text);text-decoration:none;font-size:10px;white-space:nowrap}.sf-app-nav a:first-of-type{font-weight:700;color:var(--primary-ink);border-bottom:3px solid var(--accent)}.sf-profile-tab{margin-left:auto;display:flex;align-items:center;padding:0 12px;background:#fff;border:1px solid var(--line);border-bottom:0;border-radius:4px 4px 0 0;font-size:11px;font-weight:700;white-space:nowrap}.account-shell{height:774px;padding:12px;display:grid;grid-template-columns:${accountRailWidth}px minmax(0,1fr);gap:12px}.account-rail{height:100%;padding:18px 16px;border:1px solid var(--rail-rule);border-radius:7px;background:var(--primary);color:var(--rail-text);overflow:hidden}.account-head{display:flex;align-items:center;gap:11px;padding-bottom:16px;border-bottom:1px solid var(--rail-rule)}.account-mark{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;overflow:hidden;background:var(--accent);color:var(--mark-text);border:2px solid var(--rail-rule);font-weight:700;font-size:17px}.account-mark img{width:100%;height:100%;object-fit:contain;background:#fff}.account-name{font-size:19px;font-weight:700;line-height:1.1}.account-location{margin-top:4px;color:var(--rail-muted)}.rail-fields{margin:16px 0}.rail-field{display:grid;grid-template-columns:17px 84px 1fr;gap:5px;margin:10px 0;font-size:11px}.rail-field i{color:var(--rail-muted);font-style:normal}.rail-field span{color:var(--rail-muted)}.rail-field b{overflow-wrap:anywhere}.rail-rule{height:1px;background:var(--rail-rule);margin:13px 0}.rail-stat{padding:9px 0;border-bottom:1px solid var(--rail-rule)}.rail-stat span{display:block;color:var(--rail-muted);font-size:10px}.rail-stat strong{display:block;margin-top:3px;font-size:14px}.rail-health{display:flex;align-items:center;gap:9px;margin-top:14px;padding:9px;background:var(--rail-surface);border-radius:5px}.rail-gauge{width:36px;height:36px;border:5px solid var(--rail-rule);border-top-color:#56e0b2;border-right-color:#56e0b2;border-radius:50%}.rail-health b{font-size:11px}.rail-health small{display:block;margin-top:2px;color:var(--rail-muted);font-size:9px}.rail-powered{margin-top:17px;padding-top:11px;border-top:1px solid var(--rail-rule);color:var(--rail-muted);font-size:10px}.account-workspace{height:100%;background:#fff;border:1px solid var(--line);border-radius:7px;box-shadow:0 1px 2px rgba(20,38,67,.04);overflow:hidden}.account-tabs{height:43px;display:flex;align-items:end;padding:0 16px;gap:25px;border-bottom:1px solid var(--line)}.account-tab{appearance:none;border:0;background:transparent;padding:0 1px 10px;color:#64748b;font:600 12px inherit;cursor:pointer}.account-tab[aria-selected="true"]{color:var(--primary-ink);border-bottom:3px solid var(--accent)}.account-views{height:calc(100% - 43px);padding:10px}.account-view{display:none;height:100%;grid-template-columns:minmax(0,1fr) ${actionRailWidth}px;gap:10px}.account-view.active{display:grid}.account-pane{min-width:0;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:hidden}.account-card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px;box-shadow:0 1px 2px rgba(17,38,73,.035)}.account-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.account-panel-head h2{margin:0;font-size:14px;color:#21344f}.account-overview-metrics{padding:12px}.account-metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.account-metric-grid article{padding:10px;border:1px solid #dce9fa;background:linear-gradient(180deg,#fff,#f7fbff);min-width:0}.account-metric-grid h3{margin:0;color:#334968;font-size:11px}.account-metric-grid article>strong{display:inline-block;margin:8px 0 0;font-size:22px;line-height:1}.account-metric-grid article>small{display:inline-block;margin-left:5px;color:#267447;background:#e7f7ec;border-radius:99px;padding:2px 5px;font-size:8px;font-weight:700}.account-spark{height:20px;margin:10px 0 7px;background:linear-gradient(169deg,transparent 45%,rgba(6,106,254,.17) 46%,rgba(6,106,254,.17) 72%,transparent 73%);border-bottom:2px solid var(--accent);clip-path:polygon(0 70%,16% 32%,31% 54%,45% 34%,60% 68%,75% 28%,88% 45%,100% 56%,100% 100%,0 100%)}.account-metric-grid p{display:flex;justify-content:space-between;gap:5px;margin:5px 0 0;padding-top:5px;border-top:1px solid #dfe8f2;color:var(--muted);font-size:9px}.account-metric-grid p b{color:var(--ink)}.account-progress{height:6px;margin:7px 0;background:#dfe8f3;border-radius:99px;overflow:hidden}.account-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#73a0ff);border-radius:inherit}.account-detail-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:26px}.account-detail-grid>div{padding:6px 0;border-top:1px solid var(--line)}.account-detail-grid>div:nth-child(-n+2){border-top:0;padding-top:0}.account-detail-grid label,.account-sales-summary label,.account-success-grid label{display:block;color:var(--muted);font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.account-detail-grid strong{display:block;margin-top:3px;font-size:11px}.account-legend{display:flex;gap:10px;margin:-1px 0 8px;color:var(--muted);font-size:9px}.account-legend span{display:flex;gap:4px;align-items:center}.account-legend i{width:7px;height:7px;border-radius:50%}.account-signal-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.account-signal-grid h3{margin:0 0 5px;font-size:10px}.account-signal{display:grid;grid-template-columns:83px 1fr;gap:7px;align-items:center;margin:6px 0;font-size:9px}.account-signal>span{text-align:right;color:#40536d}.account-signal>div{height:13px;display:flex;flex-direction:column;justify-content:center;gap:2px}.account-signal b,.account-signal em{display:block;height:4px;border-radius:2px}.account-notice{padding:9px 0;border-top:1px solid var(--line)}.account-notice:first-child{border-top:0;padding-top:0}.account-notice strong{display:block;font-size:11px}.account-notice span{display:block;margin-top:3px;color:var(--muted);font-size:10px}.account-insights>div{display:grid;grid-template-columns:16px 1fr auto;gap:5px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:10px}.account-insights>div:first-child{border-top:0;padding-top:0}.account-insights span{color:var(--accent);font-weight:700}.account-insights label{color:#3d5069}.account-insights strong{max-width:95px;text-align:right;font-size:10px}.account-table{width:100%;border-collapse:collapse;font-size:10px}.account-table th{text-align:left;color:var(--muted);font-size:9px;letter-spacing:.03em}.account-table td,.account-table th{padding:7px 0;border-top:1px solid var(--line);vertical-align:top}.account-table thead th{border-top:0;padding-top:0;text-transform:uppercase}.account-table tbody th{color:#265fa6;font-weight:700}.account-people-table td{padding-right:9px}.account-relationship,.account-sales-summary,.account-success-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.account-relationship>div,.account-sales-summary>div,.account-success-grid>div{padding:10px;background:#f7fbff;border:1px solid #dce9fa}.account-relationship strong,.account-sales-summary strong,.account-success-grid strong{display:block;margin-top:3px;font-size:18px}.account-relationship span,.account-sales-summary small,.account-success-grid small{display:block;margin-top:3px;color:var(--muted);font-size:9px}.account-actions>div{padding:9px 0;border-top:1px solid var(--line)}.account-actions>div:first-child{padding-top:0;border-top:0}.account-actions small{display:block;color:var(--accent);font-size:9px;font-weight:700;text-transform:uppercase}.account-actions strong{display:block;margin:3px 0 7px;font-size:11px}.account-actions button{border:1px solid var(--accent);border-radius:4px;background:#fff;color:var(--accent);padding:4px 9px;font-size:9px;font-weight:700}.account-activity>div{display:flex;gap:7px;padding:7px 0;border-top:1px solid var(--line)}.account-activity>div:first-child{border-top:0;padding-top:0}.account-activity>div>span{width:18px;height:18px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:var(--secondary);color:var(--accent);font-size:10px}.account-activity p{margin:0;font-size:9px;color:var(--muted)}.account-activity p strong{display:block;color:var(--ink);font-size:10px}.account-activity small{display:block;margin-top:2px;color:#8390a2;font-size:8px}.account-note{font-size:11px;line-height:1.45;color:var(--muted)}.account-empty{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:120px;text-align:center;color:var(--muted)}.account-empty span{margin-top:4px;font-size:10px}
</style>
<style>
:root{--accent-ink:${theme.accentInk}}
html{width:1300px;min-height:860px;height:auto;overflow-y:auto}
body{min-width:1300px;min-height:860px;height:auto;overflow-x:hidden;overflow-y:auto}
.sf-app-name{white-space:nowrap;flex:0 0 auto}
.sf-app-nav{overflow-x:auto;scrollbar-width:thin}
.sf-waffle{color:var(--menu-text)}
.sf-profile-tab{margin-left:0}
.account-shell{min-height:774px;height:auto;align-items:stretch}
.account-rail{min-height:750px;height:auto;overflow-wrap:anywhere}
.account-name{overflow-wrap:anywhere}
.account-workspace{min-height:750px;height:auto;overflow:visible;min-width:0}
.account-views{min-height:707px;height:auto}
.account-view{min-height:687px;height:auto}
.account-view[hidden]{display:none}
.account-pane{overflow:visible}
.account-card{overflow-wrap:anywhere}
.account-card.account-activity-card{max-height:340px;min-height:0;overflow:hidden;display:flex;flex-direction:column}
.account-activity-card>.account-activity{max-height:285px;min-height:0;overflow-y:auto;scrollbar-gutter:stable}
.account-actions{max-height:430px;overflow-y:auto;scrollbar-gutter:stable}
.account-actions small,.account-insights span{color:var(--accent-ink)}
.account-activity>div>span{background:#f3f6fa;color:var(--accent-ink)}
.account-action-image{display:block;width:100%;height:100px;object-fit:cover;border-radius:4px;margin-bottom:7px}
.account-action-label{display:inline-block;border:1px solid var(--accent-ink);border-radius:4px;background:#fff;color:var(--accent-ink);padding:4px 9px;font-size:10px;font-weight:700}
.account-progress i{background:var(--accent-ink)}
.account-custom-modules{display:grid;grid-template-columns:minmax(0,1fr) ${actionRailWidth}px;gap:10px;padding:0 10px 10px}
.account-signal b,.account-signal em,.account-legend i{box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
.account-tab:focus-visible,[role="list"][tabindex]:focus-visible{outline:2px solid var(--primary-ink);outline-offset:2px}
.account-metric-grid article>small{color:var(--muted);background:#eef2f6}
.score-unknown,.rec-count{display:block;margin:7px 0;color:var(--muted);font-size:10px}
</style></head>
<body>
<header class="sf-global"><div class="sf-brand"><span class="sf-brand-mark">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.brandName || 'D')[0])}</span><span>${esc(s.brandName || 'Customer')}</span></div><div class="sf-search">⌕&nbsp;&nbsp;Search Salesforce</div><div class="sf-icons"><span class="sf-icon">☆⌄</span><span class="sf-icon">＋</span><span class="sf-icon">?</span><span class="sf-icon">⚙</span><span class="sf-icon">●</span><span class="sf-user">${esc((s.userName || 'U')[0])}</span></div></header>
<nav class="sf-app-nav"><div class="sf-app-name"><span class="sf-waffle">⠿</span>${esc(s.appName || 'Data Cloud')}</div>${s.navLinks.map((link, index) => `<span class="sf-app-nav-link" style="display:flex;align-items:center;color:${index === 0 ? esc(theme.navInk) : 'var(--menu-text)'};font-size:10px;white-space:nowrap;cursor:default;user-select:none;${index === 0 ? 'font-weight:700;border-bottom:3px solid var(--accent);' : ''}">${esc(link)}</span>`).join('')}<div class="sf-profile-tab">♙&nbsp; ${esc(s.tabName || a.name)} &nbsp;×</div></nav>
<main class="account-shell"><aside class="account-rail"><div class="account-head"><div class="account-mark">${accountMark}</div><div><div class="account-name">${esc(a.name)}</div><div class="account-location">${esc(a.headquarters)}</div></div></div><div class="rail-fields"><div class="rail-field"><i>▣</i><span>Account ID</span><b>${esc(a.accountId)}</b></div><div class="rail-field"><i>▥</i><span>Industry</span><b>${esc(a.industry)}</b></div><div class="rail-field"><i>▰</i><span>Type</span><b>${esc(a.type)}</b></div><div class="rail-field"><i>⌖</i><span>Employees</span><b>${esc(a.employees)}</b></div>${renderProfileRailFields(s.railFields, 'b2b')}</div><div class="rail-rule"></div><div class="rail-stat"><span>Current Commercial Value</span><strong>${esc(m.revenue)}</strong></div><div class="rail-stat"><span>Open Pipeline</span><strong>${esc(m.pipeline)}</strong></div><div class="rail-stat"><span>Renewal Date</span><strong>${esc(m.renewalDate)}</strong></div><div class="rail-stat"><span>Account Tier</span><strong>${esc(a.tier)}</strong></div><div class="rail-health"><div><b>${esc(m.healthScore)} Account Health</b><small>${esc(m.healthTrend || 'Health trend not provided')}</small></div></div><div class="rail-powered">Powered by&nbsp;&nbsp; ✦ ◉ ◌ ◈ ⌁ 🧠</div></aside>
<section class="account-workspace"><div class="account-tabs" role="tablist" aria-label="Account views">
${tabs.map(tab => `<button class="account-tab" id="tab-${tab}" type="button" role="tab" aria-selected="${tab === selectedTab}" tabindex="${tab === selectedTab ? '0' : '-1'}" aria-controls="account-${tab}" data-account-tab="${tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}
</div><div class="account-views">
${viewPanels.map(([tab, main, side]) => `<div class="account-view${selectedTab === tab ? ' active' : ''}" id="account-${tab}" role="tabpanel" aria-labelledby="tab-${tab}"${selectedTab === tab ? '' : ' hidden'}><div class="account-pane">${main || noModules}</div><div class="account-pane">${side || noModules}</div></div>`).join('')}
</div>
${extraCards.length ? `<div class="account-custom-modules"><div class="account-pane" data-module-placement="middle">${extraPanel('middle')}</div><div class="account-pane" data-module-placement="right">${extraPanel('right')}</div></div>` : ''}
</section></main>
<script>
(function () {
  var tabs = Array.from(document.querySelectorAll('[data-account-tab]'));
  var views = document.querySelectorAll('.account-view');
  function select(tab) {
    var name = tab.getAttribute('data-account-tab');
    tabs.forEach(function (item) {
      item.setAttribute('aria-selected', String(item === tab));
      item.setAttribute('tabindex', item === tab ? '0' : '-1');
    });
    views.forEach(function (view) {
      var active = view.id === 'account-' + name;
      view.classList.toggle('active', active);
      view.hidden = !active;
    });
    if (window.parent !== window) window.parent.postMessage({ type: 'upg:account-tab-change', tab: name, revision: ${tabRevision} }, '*');
    if (window.upgReportLayout) window.upgReportLayout();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { select(tab); });
    tab.addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      tabs[next].focus();
      select(tabs[next]);
    });
  });
})();
</script>
${renderLayoutStatusScript(s)}
</body></html>`;
}
