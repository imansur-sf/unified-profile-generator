# Customer-logo recovery

## Cause

The renderer correctly rejects embedded SVG and ICO data, but the brand-image endpoint previously returned downloaded logos using their original MIME type. A remote logo could therefore appear initially and disappear after embedding. The previous discovery also selected only one favicon; relative URLs could be resolved against the pre-redirect address. Image-backed logo boxes inherited the primary brand color.

## Change

- Browser, standalone builder, API and MCP generation share bounded logo discovery: header/brand assets, touch icons, favicons, then `/favicon.ico`. Relative assets use the final fetched page URL. Generic customer/college logo collections are excluded where identifiable.
- Fetched images are decoded and converted to portable PNG. SVG/ICO are supported without relaxing the renderer's data-URL safety policy. SVG external references/executable content are rejected. Native decoding runs in a bounded child process, with byte/pixel/dimension limits, concurrency/queue caps and a hard deadline.
- White-only/transparent candidates are skipped because image-backed logo boxes are white. The original colors/transparency of accepted assets are preserved. Initials still use the primary brand color.
- Failed candidates fall through to alternatives. The editor displays status and a **Retry logo only** action. Manual image edits, newer requests and project changes take precedence over delayed requests.
- Older embedded SVG/ICO logos are normalized when a project or recovered draft is opened. This updates the local editor only; users still explicitly save online. Root branding is shared across persona views.
- No paid image generation is needed for a logo: this feature discovers and normalizes the customer's existing website assets.

## Evidence

- `npm run build`, `npm test`: **144 tests passed**, including malformed HTML scanning, SVG/ICO conversion and safety, white-only fallback, manual-edit races, saved-logo recovery, API/MCP generation and B2C/B2B render output. The standalone bundle is rebuilt and parity-tested.
- Read-only HTTP checks exercised the real local scraper and decoder against **1-800Accountant**, **Tony Robbins**, and **NCSA**. Each returned a decoded PNG; NCSA and 1-800Accountant used SVG sources. A regression fixture based on NCSA's fetched markup excludes its unrelated college-logo candidates. A subsequent live NCSA scrape failed upstream, illustrating that source-site availability can vary independently of decoding.
- These are automated rendering/state and real HTTP checks, not pixel-level browser tests. The repository-required `preview_*` browser tools were unavailable. The remaining live check is to generate/retry each brand after deployment, switch persona views, and compare Preview/Present/Download.
- No cloud projects, accounts data, credentials or production configuration changed. No real OTP or paid model call was initiated.

## Deployment and rollback

- Pre-change checkpoint: **`upg-logo-fix-baseline-2026-10-07`**, commit **`48671e2`**, pushed to origin before implementation.
- Deploy UPG only. No accounts deployment or database migration is required. New locked dependencies are `sharp` and `saxes`; keep npm optional dependencies enabled so the correct native Sharp package is installed on Heroku.
- To roll back, create a new revert/release commit restoring the checkpoint, rebuild, and deploy; do not force-push or reset shared history. The checkpoint preserves source, not project data or configuration.
- Dependency audit also reported existing advisories in the Express dependency tree. They were not introduced by the logo decoder and are a separate follow-up; this change does not upgrade unrelated server dependencies.

## Limitations

Some sites block server-side scraping, use client-rendered/inlined-only logos, or expose only white/unsupported assets. In these cases retry or manual upload remains available. The decoder intentionally rejects SVGs requiring external resources or unsupported features rather than compromising fetch/render boundaries. Existing remote images are retained if all normalization candidates fail; their eventual availability is controlled by the source website.
