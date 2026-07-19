# Unified Profile Generator

A wizard for building Salesforce Data Cloud unified customer profile demos — mirrors the shape of the [Loyalty Portal Generator](../../Desktop/Loyalty_Portal_Generator.html).

## Run locally

```
python3 -m http.server 8080
```

Then open http://localhost:8080/.

## Bundle to a single HTML

```
python3 build-standalone.py
```

Writes `Unified_Profile_Generator.html` — self-contained, deployable to GitHub Pages or any static host.

## AI URL analysis

Paste an Anthropic API key (`sk-ant-…`) into the Quick Start panel; keys are stored only in this browser's localStorage and sent only to `api.anthropic.com`. Site scraping goes through public CORS proxies with automatic fallback to URL-only analysis.

## File layout

| File | Purpose |
| --- | --- |
| `index.html` | Wizard shell + preview iframe |
| `js/defaults.js` | Per-industry starter data (recruiting, retail, healthcare, financial, generic) |
| `js/generator.js` | Renders the unified profile HTML |
| `js/app.js` | Wizard flow + state binding |
| `js/images.js` | Drop-zone + URL image handling |
| `js/pagehost.js` | Shared AI prompt + scrape helpers |
| `js/localai.js` | BYOK Anthropic client + CORS-proxy scrape |
| `build-standalone.py` | Bundler → single HTML |
