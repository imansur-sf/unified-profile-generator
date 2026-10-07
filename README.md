# Unified Profile Generator

A Salesforce-style demo-profile builder for individual (B2C) and account (B2B) stories. Use it without signing in; sign in only for online projects and personal integration keys. Customer facts, signals, and activities are modeled demo content, not live CRM data.

## Run and verify

```sh
npm ci
npm start
```

Open `http://localhost:3000`. The Node server supplies same-origin account/auth proxies, protected website fetching, and optional shared AI services. Static/file-only use supports manual editing, but does not provide those server routes. Keep secrets in environment variables, never the repository.

```sh
npm test
npm run build
```

Tests cover state races, renderer safety/fidelity, uploaded images, async integration jobs, and request boundaries using fixtures and mocks. They do not send real OTPs or charge AI providers. `npm run build` regenerates `Unified_Profile_Generator.html`; the bundled builder still needs its backend endpoints, CDN styling, and starter assets. Downloaded customer profiles have inline styles and retain embedded images.

## User workflow

1. Choose Individual or Account, enter the customer URL, and select the views to create.
2. Create the profile set. Text and image progress are reported separately for each view.
3. Select a view and add a decision brief to update that view only. Shared customer identity stays consistent. Retry missing images without regenerating text.
4. Edit fields, extra profile-card facts, module placement, imagery, and colors. Suggested/hidden cards stay editable without appearing on the output. Native select/up/down controls are alternatives to dragging.
5. Present or export the selected view, or sign in to save the whole set online. Updates use revisions to protect against another editor session. “Save a separate copy” creates another project deliberately.

Local recovery keeps an image-bearing backup in IndexedDB for the current browser tab and offers restoration after reload. It is separate from online saving, stores no auth/API credentials, can be unavailable in restricted/private browsers, and can be erased by clearing browser data. Do not treat it as a permanent backup.

## API and MCP

See [API/MCP integration](docs/API-MCP.md) and the in-app **Settings & Integrations → About API & MCP Integration** guide. Both interfaces use the same server generation pipeline. Jobs persist in the shared accounts database; explicit resume continues an interrupted job. A call completed just before its checkpoint was stored can be repeated on resume—this is not exactly-once provider billing.

## Deployment and rollback

See [two-phase implementation and rollback checkpoints](docs/QUALITY-IMPLEMENTATION.md). Deploy the shared accounts migration/server before the corresponding UPG release.

- `GEMINI_API_KEY`: server-side shared provider credential.
- `SAASY_ACCOUNTS_URL`: trusted shared accounts backend URL.
- `PUBLIC_ORIGIN`: exact HTTPS UPG origin, required for correct discovery/export URLs behind a TLS-terminating proxy.
- `TRUST_PROXY`: optional, verified proxy IPs/CIDRs only. The default is false; forwarded headers are not inherently trustworthy.
- `MCP_ALLOWED_ORIGINS`: optional additional trusted browser-client origins for MCP.

Run staging checks for OTP, deployment networking, database migrations/concurrency, browser layout/keyboard interactions, and a small paid generation sample before relying on a release for a meeting. The audit and test evidence are recorded in `docs/`.

## Main files

| Area | Files |
| --- | --- |
| Editor and recovery | `index.html`, `js/app.js`, `js/editor-support.js`, `js/images.js` |
| Rendering and presets | `js/generator.js`, `js/defaults.js` |
| Shared AI contract/prompts | `js/profile-contract.js`, `js/pagehost.js`, `js/localai.js` |
| Server/integrations | `server.js`, `lib/` |
| Standalone bundle | `build-standalone.py`, `Unified_Profile_Generator.html` |
| Regression tests | `test/` |
