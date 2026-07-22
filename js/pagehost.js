// ============================================================
// pagehost.js — Shared prompt/scrape helpers used by localai.js
// ============================================================
// A pared-down version of the Loyalty Portal's pagehost module.
// It exposes:
//   - window.UPG_Shared.normalizeURL(u)
//   - window.UPG_Shared.extractCoreHTML(html, url)
//   - window.UPG_Shared.SYSTEM_PROMPT
//   - window.UPG_Shared.buildUserPrompt(scraped)
//   - window.UPG_Shared.parseAIResponseText(text)
// The BYOK client in localai.js uses these to turn a raw
// customer URL into a Unified Profile object.
// ============================================================

(function () {
  function normalizeURL(raw) {
    if (!raw) return null;
    let u = raw.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try { return new URL(u).toString(); }
    catch { return null; }
  }

  function extractCoreHTML(html, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg, iframe, template').forEach(n => n.remove());

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const description =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const siteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

    const faviconEl = doc.querySelector('link[rel~="icon"]') || doc.querySelector('link[rel="apple-touch-icon"]');
    let favicon = faviconEl?.getAttribute('href') || '';
    if (favicon && !favicon.startsWith('http')) {
      try { favicon = new URL(favicon, url).toString(); } catch { /* leave */ }
    }

    const bodyText = (doc.body?.innerText || doc.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(Boolean)
      .slice(0, 30)
      .join('\n');

    const navLinkCandidates = Array.from(doc.querySelectorAll('nav a, header a'))
      .map(a => a.textContent.trim())
      .filter(t => t && t.length < 30)
      .slice(0, 15);

    return { url, title, siteName, description, ogImage, favicon, headings, navLinkCandidates, bodyText };
  }

  const SYSTEM_PROMPT = `You are a brand analyst helping a Salesforce Solution Engineer build a demo Data Cloud unified customer profile for a specific customer.

You will receive scraped content from a customer's website. Extract brand identity and generate a realistic, on-brand unified profile — a fictional but plausible individual member/customer/patient/client/athlete/etc. — that the customer's marketing or engagement team would recognize as accurate to their business.

Return ONLY a single JSON object matching the schema below. No preamble, no markdown fences, no trailing prose.

Schema:
{
  "brandName": string,
  "industry": "recruiting" | "retail" | "healthcare" | "financial" | "generic",
  "appName": string,     // e.g. "Data Cloud", "Marketing Cloud"
  "tabName": string,     // usually the demo profile's name — shown in the top-right nav tab
  "colors": {
    "primary":  "#RRGGBB",   // brand-dark, used for text + primary accents
    "accent":   "#RRGGBB",   // brand highlight (buttons, active indicators)
    "secondary":"#RRGGBB",   // near-white wash
    "menu":     "#RRGGBB",   // background of the app-nav bar (often white)
    "menuText": "#RRGGBB"    // text color inside the app-nav bar
  },
  "navLinks": [ string ],    // 6-8 items — real Data Cloud sections (Home, Data Streams, Segments, Activations, Data Lake Objects, Data Model, Identity Resolutions, Calculated Insights). Keep these exact when unsure.

  "profile": {
    "name": string,          // realistic fictional person for this industry
    "city": "City, ST",
    "customerId": string,    // 8-digit number
    "email": "name@gmail.com",
    "parentEmail": string,   // ONLY for recruiting/education/youth; else ""
    "phone": "(NNN) NNN-NNNN",
    "address": "Street\\nCity, ST ZIP",
    "segment": string        // 4-5 comma-separated segment memberships this customer would be in
  },

  "loyalty": {
    "title": string,         // e.g. "Loyalty Insights", "Relationship Insights", "Wellness Rewards"
    "memberId": string,
    "tier": string,          // brand-appropriate tier name
    "points": string,
    "redeemedPoints": string
  },

  "insights": {
    "title": string,         // vertical-flavored: "Athlete Insights", "Patient Insights", "Shopper Insights", "Client Insights"
    "items": [               // 6 items
      { "icon": "emoji", "label": string, "value": string }
    ]
  },

  "affinities": {
    "title": "Affinities",
    "seriesA": { "label": string, "color": "#RRGGBB" },  // e.g. Views / Browse / Research / Interest
    "seriesB": { "label": string, "color": "#RRGGBB" },  // e.g. Interaction / Purchase / Transactions / Engagement
    "groups": [              // 3-4 groups
      { "name": string, "items": [ { "label": string, "a": 0-100, "b": 0-100 } ] }
    ]
  },

  "preferences": {
    "title": string,         // "Athlete Preferences", "Customer Preferences", etc.
    "items": [ { "label": string, "value": string } ]  // 4 items
  },

  "events": {
    "title": string,         // e.g. "Events (All Brands)", "Recent Visits"
    "items": [ { "name": string, "date": "M/D/YY - M/D/YY", "confirmation": string } ]  // 1-3 items
  },

  "membership": {
    "title": string,         // e.g. "NCSA Membership Details"
    "items": [ { "label": string, "value": string } ]  // 2-3 items
  },

  "recommendations": {
    "title": "Einstein Recommendations",
    "items": [               // 2 items — Next Best Action + Recommended
      {
        "eyebrow": "Next Best Action:" | "Recommended:",
        "title": string,     // action-oriented, brand-appropriate
        "cta": string,       // 1-2 word button label
        "image": ""          // leave empty; the app fills a default
      }
    ]
  },

  "activity": {
    "title": "Engagement Activity",
    "items": [               // AT LEAST 4 items, prefer 5-6 — reverse chronological
      { "icon": "emoji", "title": string, "body": "may include <b>bold</b> or <span style=\\"color:#RRGGBB\\">colored</span> HTML", "time": string }
    ]
  },

  "extraCards": [            // 1-2 items — additional middle-column cards to fill vertical space
    {
      "title": string,       // vertical-appropriate category (e.g. "Coaching History", "Skills Assessment", "Family Info")
      "icon": "emoji",       // single emoji
      "items": [ { "label": string, "value": string } ]   // 3-5 rows
    }
  ],

  "rightExtraCards": [       // 0-1 item — extra card BELOW Membership Details in the right column
    {
      "title": string,       // e.g. "Recent Communications", "Program Enrollment", "Referral Sources"
      "icon": "emoji",
      "items": [ { "label": string, "value": string } ]   // 2-3 rows
    }
  ]
}

Rules:
- The profile MUST feel specific to this customer's business — not generic.
- If the site is a sports recruiting / education / youth-athletics brand, use industry:"recruiting" and include parentEmail.
- Colors should match the customer's actual visual brand where discernible from the page.
- Numbers in insights/affinities/loyalty should be plausible for this industry (e.g. AUM for wealth mgmt, RFM for retail).
- **DENSITY MATTERS** — SEs screenshot the entire profile onto slides. Every section must feel FULL. Aim for the maximum item count in each list, not the minimum. Empty white space looks unfinished. Populate extraCards (1-2) and rightExtraCards (0-1) with content the customer's marketing team would recognize as accurate to their business.
- Return ONLY the JSON. No explanation.`;

  function buildUserPrompt(scraped) {
    return `Customer URL: ${scraped.url}
Site title: ${scraped.title || '(not extracted)'}
Description: ${scraped.description || '(not extracted)'}
Site name (og): ${scraped.siteName || '(not extracted)'}

Headings on the homepage:
${scraped.headings || '(none extracted)'}

Nav links seen: ${scraped.navLinkCandidates.join(' • ') || '(none)'}

Body text (truncated):
${scraped.bodyText.slice(0, 5000) || '(no body text extracted — analyze from URL/domain alone)'}

Now generate the Unified Profile JSON per the schema.`;
  }

  function parseAIResponseText(text) {
    if (!text) throw new Error('Empty AI response');
    // Strip Markdown fences if present
    let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    // Some models wrap JSON in extra prose — try to grab the largest {...} block
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first > 0 && last > first) t = t.slice(first, last + 1);
    try { return JSON.parse(t); }
    catch (e) { throw new Error('AI returned malformed JSON: ' + e.message); }
  }

  window.UPG_Shared = { normalizeURL, extractCoreHTML, SYSTEM_PROMPT, buildUserPrompt, parseAIResponseText };
})();
