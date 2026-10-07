# Unified Profile Generator: quality audit and improvement plan

Date: October 7, 2026  
UPG baseline: `56af5a0` — Add editable B2B account picture  
Scope: B2C/B2B builder, five persona strategies, generation/images, rendering/export, project lifecycle, shared authentication, REST/MCP.  
Status: analysis and local characterization testing complete; implementation has not started. No application sources or production data were changed.

## Executive recommendation

Improve the existing app incrementally; do not start with a visual rewrite. The most important problems are correctness problems underneath the UI: asynchronous work can update the wrong persona/customer, generated content can retain irrelevant starter data, and the renderer silently omits editable content. These explain several of the previously reported symptoms.

First close the security and data-loss risks, then make one validated project state drive every preview/export. Follow with better contextual generation, a consistent module layout, and a simpler editor. Keep guest usage; require sign-in only for online projects and API credentials, as intended.

## What was actually tested

| Area | Executed checks | Result / limitation |
|---|---|---|
| JavaScript syntax | Server and all six browser modules with Node 22.22.3 | Parsed successfully. This does not verify browser behavior. |
| Renderer matrix | 5 industries × 2 modes × 5 personas = 50 fixture combinations | All produced complete HTML without exceptions. Pixel layout was not evaluated. |
| Rendering/export behavior | 16 Node/HTML characterization checks, including the matrix above | Reproduced truncation, color, progress-bar, active-document and rich-text issues below; also confirmed escaping and B2C content retention controls. |
| Generation/state | 16 isolated VM tests with controlled delayed responses | 13 defect reproductions and 3 healthy controls. |
| Backend/auth/save | 19 isolated route/function assertions | Reproduced issues below and confirmed ownership and bounded save-retry controls. Database, network, identity and model responses were mocked. |
| Standalone builder | Fresh temporary build, comparison to tracked bundle, HTML-parser extraction and script compilation | Tracked and fresh bundles both have a script-boundary syntax failure; tracked bundle is also stale. |
| Builder interactions | Static markup and stubbed interaction checks | Confirmed destructive mode switch, inert Done, upload/focus/label gaps; actual keyboard/screen-reader behavior still needs browser testing. |

These are **characterization tests**: a successful assertion can mean a defect was reproduced. They must not be described as a green end-to-end test suite.

Healthy controls worth preserving: synchronous persona switching preserves edits; delayed logo embedding respects a subsequent user logo edit; B2B image prompts omit a portrait and retain the persona brief; B2C visible added cards and activity entries remain in the HTML; ordinary subject text is escaped; different-owner generation lookups are denied; profile API SQL scopes owner and tool; rejected-session save recovery retries once with the same options/idempotency key.

Not tested: live Heroku/SSO routing, real Magic OTP delivery, real Postgres transactions/concurrency, paid model/image generation, visual fidelity at actual browser sizes, offline export loading, screen readers, or real Holodeck/MCP clients. The repository's HANDOFF restricts browser verification to `preview_*` tools, which are unavailable here. No substitute browser automation was used. This is a substantial local audit, **not a claim that everything is production-verified**.

Reproduction harnesses from this session (temporary files; may be cleaned by the OS):

- `/private/tmp/upg-audit-render.cjs`
- `/private/tmp/upg-audit-generation.mC4Z44/audit.cjs`
- `/private/tmp/upg-audit-backend.imrTCq/audit.cjs`
- Fresh standalone builder: `/private/tmp/upg-audit-ux.BF2rwf/Unified_Profile_Generator.html`

Run the `.cjs` files with `node`. All external service responses are mocked; none sends email or incurs AI charges. Convert these reproductions into permanent desired-behavior regression tests during Phase 0.

## Confirmed findings

Priorities: **P1** before broadening use; **P2** next reliability/quality release; **P3** usability/maintenance. Source locations refer to the baseline above. Shared-account locations belong to the sibling `saasy-accounts` repository, not UPG.

### A. Persona isolation and personalized content

**A1 — P1: delayed results can write into the wrong view or customer.**

Reproductions include Sales images completing after switching to Service, Sales personalization completing in Service, a previous retail request writing into a replacement hospital profile, profile-set completion overwriting Sales with Service, and a B2C response being applied after switching to B2B. The ordinary synchronous switch works; completion handlers targeting mutable global state are the problem.

Evidence: `js/app.js:539–552`, `1634`, `2281–2297`, `2338–2406`.

Fix: capture project/draft ID, mode, persona, revision and request ID before any await. Commit a result only to that exact variant if its revision is still current. Cancel or discard stale work after reset/load/mode/source changes. Do not snapshot whatever happens to be active under an old lens name. Give concurrent personalization a defined last-write/conflict policy.

**A2 — P2: entered requirements can be ignored, and existing facts can drift.**

- Quick Start replaces a standard persona's entered objective/brief with its preset objective and an empty brief (`js/app.js:88–96`, `2313–2317`).
- B2B Sales → Service → Sales changed pipeline from `$510K` to `$180K`, while an existing Sales insight still said `$510K`. Templates mutate shared metrics, which are absent from persona snapshots (`342–348`).
- The personalization merge does not re-fill static form fields before later `readStaticFields()` calls. This is an additional source-level stale-form risk requiring a dedicated regression (`2289–2294`, `842`).

Fix: make each view's saved strategy the single source for initial generation and later customization. Explicitly classify shared account facts versus view-specific metrics, and never substitute a persona sample for a generated shared fact. Derive editor fields from state instead of reading stale hidden forms back into it.

**A3 — P2: relevance and completeness are not validated.**

- Every tested generated B2C Sales industry receives the visible “Business Profile (Vance Tech)” starter card (`js/app.js:210`, `1683`).
- An empty `{}` response becomes a supposedly ready default profile (`js/pagehost.js:323`, `js/localai.js:436`, `js/app.js:2353`).
- Repeated personalization creates duplicate `overlay-middle-1` IDs, making later card lookup/movement ambiguous (`js/app.js:1731–1737`, `1218`).
- Valid JSON containing `Attend the “Wellness” seminar` is damaged by smart-quote normalization before JSON parsing (`js/pagehost.js:320`).
- A base64 headshot fills the shared-identity prompt's 7,000-character slice, truncating the JSON and omitting loyalty context (`js/pagehost.js:268`).

Fix: separate curated starter content from neutral schemas; validate responses before state changes; parse valid JSON before attempting recovery; send an explicit text-only context schema; give modules stable unique IDs with upsert/replace behavior. Return an incomplete/retry state instead of silently claiming successful personalization.

**A4 — P2: image availability and relevance are conflated.**

Blank generated recommendations are replaced by industry stock images, and the next image pass counts those images as ready without generating anything (`js/app.js:1665`, `509`). B2B generates image requests but its current renderer does not display recommendation imagery (`js/generator.js:1003`). The asynchronous REST/MCP generation path is separately implemented, single-view and text-oriented; it does not run the browser's profile-set/image orchestration (`server.js:619–701`).

Fix: track each asset's provenance and status (`generated`, `uploaded`, `stock fallback`, `failed`, `pending`). Key image work to recommendation ID plus a hash of persona/action/brief/brand context. Keep failures retryable, and show “Text ready · images pending” instead of one misleading ready state. Decide explicitly whether B2B supports illustrated actions; either render them or stop paying to generate unused images. Reuse the same orchestration for UI, REST and MCP.

### B. Rendering and export fidelity

**B1 — P1/P2: editable content is silently dropped.**

The B2B renderer keeps only the first visible extra card, four activities, two recommendations, two chart groups, three items per group, four preference/product rows and five stakeholders. Placement of additional cards is not honored. B2C also drops recommendations after the first two despite an Add Recommendation control. This is not a scroll/clipping issue: omitted data never reaches the HTML.

Evidence: `js/generator.js:744`, `981–1007`.

Fix: an explicit layout budget should decide initial visible modules, but manual additions must remain accessible. Put alternatives in a visible Suggested library; never use silent array slicing as overflow management. Add real carousel/list behavior for additional recommendations or an explicit two-card limit with an explanation. Render every visible module in its chosen supported location.

**B2 — P2: scroll, tab and branding contracts are inconsistent.**

- B2B activity-scroll CSS targets `.account-card.account-activity`, but the generated activity section lacks that second class; the intended scroll treatment cannot apply (`1004`, `1028`).
- B2B App/Cloud Name and authored nav links are ignored in favor of hardcoded Data Cloud/canonical navigation (`990`, `1031`).
- Every B2B document initializes Overview. Clicking another tab changes iframe DOM only; Present uses `srcdoc`, which does not contain that runtime selection (`1033–1040`; `js/app.js:707`). This reset is source-confirmed; full click/present behavior needs the browser gate.

Fix: persist the active account tab in view state, render from it, and synchronize changes through a narrowly validated iframe message contract if needed. Keep navigation non-navigating as requested, while respecting supported branding controls. Use one tested activity component with a bounded internal scroll area and accessible keyboard scrolling.

**B3 — P2: Preview/Present/Download/Copy/API do not share one render snapshot.**

Within the 120ms preview debounce, Present uses the old iframe HTML while direct export uses new state. A fixture changed BEFORE_SWITCH to AFTER_SWITCH and reproduced the mismatch (`js/app.js:693–712`, `1428`, `1514`). Download also awaits image hydration before reading global state. Its persona can therefore change while preparation is pending; add a deferred export regression.

Fix: capture one immutable, versioned view snapshot at action time, flush pending editor updates, resolve its assets and render it once. Use the same document for preview, presentation and all export adapters. Define whether scroll position is restored; active persona and B2B tab must be consistent. Use account names for B2B filenames instead of `state.profile.name` (`1437`).

**B4 — P2: data visuals can contradict the displayed data.**

The B2B percentage parser turns `0%` into an 8% bar and `42/100` into a 100% bar. “Renewal readiness: On track” remains even with 0% health and critical churn risk. Other default narrative text also asserts High expansion propensity or generic coverage when no evidence is supplied (`js/generator.js:986–988`, `1012`, `1015`, `1018`).

Fix: store typed scores and units separately from display labels. Zero must mean zero; unknown must mean unknown. Derive narrative labels from consistent facts/rules or validated modeled content, never a reassuring literal fallback.

**B5 — P2: white branding still makes action text invisible.**

B2C recommendation buttons use primary background with fixed white text, so a white primary produces 1:1 contrast (`js/generator.js:484–486`). B2B action buttons use white background and accent text; the common white accent has the same problem (`1027`). The recent B2B rail fix does not cover these controls.

Fix: separate brand colors from semantic readable foreground/button tokens across both modes. Test primary, accent, navigation and charts with light/dark/white brands. Preserve the user's exact background choice while choosing a readable foreground; do not add unwanted gradients.

**B6 — P1 for standalone distribution: the single-file builder is broken and stale.**

This concerns `Unified_Profile_Generator.html`, the single-file **builder**, not every exported profile. The bundler inserts source verbatim inside an inline script (`build-standalone.py:62`), while the account template contains a literal closing script tag (`js/generator.js:1040`). HTML parsing ends the outer builder script prematurely. Both checked-in and freshly built output fail script compilation with “Unexpected end of input.” The tracked artifact also predates major functionality (363,507 bytes vs fresh 455,507 bytes).

Fix: escape HTML script-boundary sequences safely during bundling, test parsed script blocks, rebuild from source, and enforce build parity in CI. Clarify that the builder still needs backend/CDN resources; do not confuse it with a portable generated profile.

### C. Security, saving and integrations

**C1 — P1: scraped content can be served as active HTML on the app origin.**

`/api/scrape` preserves upstream HTML MIME and body (`server.js:81–92`). An inert script marker survived the mocked response. A directly opened scrape URL is outside the sandboxed preview, and the shared auth widget keeps bearer tokens in localStorage (`saasy-accounts/public/saasy-auth.js:16`). No browser execution or token theft was attempted.

Fix: return structured JSON or inert text with correct MIME and `nosniff`, not active remote HTML on the authenticated origin. Sanitize/allowlist authored rich-text activity/icons as well: the renderer currently preserves arbitrary markup in export (`js/generator.js:19`, `828`, `1004`). Validate CSS colors and URL schemes, and isolate hosted generated artifacts from authenticated application pages. Consider a compatible session-storage hardening design across all shared-auth apps; do not unilaterally change that contract.

**C2 — P1: fetch and billed-operation boundaries are insufficient.**

Private IPv6 literals pass `isDangerousHost`; redirects and resolved DNS destinations are not revalidated (`server.js:734`, `81`, `582`). Mock tests also bypassed the AI rate limit by changing the first X-Forwarded-For value (`106`, `137`). Actual Heroku ingress/header behavior and private-network reachability were not tested.

Fix: one safe-fetch component for scrape, image and generation context; validate normalized/resolved IPv4/IPv6 destinations and every redirect, restrict ports, and bound both bytes and full response time. Establish trusted proxy handling and server-enforced shared budgets. Preserve guest editing/generation access via the intended internal-access boundary and appropriate guest quotas; no mandatory personal sign-in should be added simply to repair rate limiting.

**C3 — P1/P2: save/session/project lifecycle still has failure paths.**

- Database rejections escape shared accounts Express 4 async routes/middleware. An isolated actual route-layer test with a mocked DB failure terminated the Node process instead of returning an error (`saasy-accounts/server.js:94`, `250`).
- Save preparation happens before `try/finally`; a field-read exception leaves Save permanently busy (`js/app.js:2087–2097`).
- Start Over/new-customer analysis retains the loaded project ID/name. Default Update targets the old project; the modal does say Update, but there is no source-change explanation (`1413`, `1712`, `2095`).
- Reauthentication can switch accounts and automatically retry the previous account's unsaved payload under the new identity (`2078–2083`).
- A same-owner project from another tool can be loaded as UPG without a tool/schema check (`2174`).
- Save has one-time session recovery, but list/load do not; expired credentials initially appear signed in.

Fix: wrap async server handlers and return controlled errors; include all save preparation inside cleanup; validate tool/schema before atomic load; bind pending operations to the original owner; preserve local draft/intent on expiry or cancellation. Clear or explicitly rebind project identity when starting a different company. Keep request idempotency, add revision/optimistic-concurrency checks, and define the company-level project rule below.

**C4 — P1/P2: asynchronous integrations are not durable or reliably exportable.**

- Jobs live in a process-local Map: a fresh worker cannot find them; identical idempotency keys create different jobs (`server.js:21`, `469`).
- Five hundred retained completed jobs block new jobs even with no running work; capacity counts history instead of active work.
- The shared ten-request/minute API-key limit counts status authorization. One authorization plus nine polls made the completion save return 429 (`saasy-accounts/server.js:20`, `101`; UPG `553`).
- Any embedded image, even a tiny logo, sets `renderStatus: requires_hosted_render` and drops saved HTML. The export endpoint does not rebuild it and returns 409 (`js/app.js:1457–1473`; `saasy-accounts/server.js:344–352`). Normal analysis deliberately embeds logos.
- HTTPS MCP Origin can be rejected when Express sees internal HTTP; discovery may advertise the wrong scheme (`server.js:57`, `259`). This was reproduced with a proxy-shaped mock, not the live ingress.

Fix: durable jobs/results, idempotent enqueue, separate concurrency/retention limits, retryable persistence and separate read/write quotas. Store asset references and build exports from versioned saved state or persist artifacts in appropriate storage. Make profile/persona selection explicit in exports. Configure public origin/trusted proxy boundaries without removing Origin validation. MCP permits GET 405 when no SSE stream is offered, so that response is not itself a bug. [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [Heroku HTTP routing](https://devcenter.heroku.com/articles/http-routing).

### D. Editor experience and accessibility

**D1 — P2: B2C/B2B switching can discard work without confirmation.** The confirmation is conditioned on `currentStep > 0`, but the selector lives in step zero. A fixture confirmed edits and variants were discarded with zero confirmation calls (`js/app.js:651`). Use dirty-state protection or retain drafts per mode.

**D2 — P2/P3: controls need a shared interaction standard.**

- Most upload/drop zones are mouse-only; the recently added account-picture control is an exception (`js/images.js:16–37`). Provide native keyboard-operable controls and consistent preview/remove/error handling everywhere.
- Dragging cards has no equivalent keyboard column-placement action (`js/app.js:1260`). Provide Move to column, Move up/down and Show/Hide controls alongside drag/drop.
- 77 of 106 static form controls lack an associated visible label or explicit ARIA label. Some have placeholder fallback names; this does not mean every one is completely unnamed. Add durable labels and meaningful delete-control names.
- Save/settings dialogs lack complete semantics/focus management; API guide/presentation behavior is inconsistent. Add focus trapping/return, Escape and background inertness.
- Number-only steps lack descriptive/current-step semantics, status/error updates lack live regions, and empty URL submission returns silently.
- The final Done button has no action. “Analyzing with Claude” is hardcoded even when the configured provider is Gemini.

**D3 — P3: build/documentation/maintenance gaps increase regression risk.** There is no checked-in test suite or test command. README/HANDOFF describe an old architecture; the static-server instructions do not support current same-origin backend/auth routes. `node_modules/` is untracked and not excluded in the repo's own ignore file. Rendering contains a legacy account implementation plus large inline CSS/override blocks. Add a repeatable build/test contract, dependency lock/reproducible install policy, accurate setup docs, and gradually extract shared rendering/state modules after tests exist. Do not begin with an all-at-once framework rewrite.

## Recommended product experience

Keep one obvious journey:

**Customer + B2C/B2B → choose views → generate set → customize selected view → present/save/export.**

1. Put customer URL and role selection in one generation section. Use one requirements field per view both before generation and afterwards—no second concept that also means “tailor this persona.” Custom is a named role, e.g. Finance or IT, with a decision brief.
2. After generation, persona tabs show Text ready / Images pending / Needs retry. The selected view's button says **Update Sales view** or **Update Finance view**. It must not imply re-generating the entire customer.
3. Clearly label shared changes (brand, company/contact identity) versus this-view changes (insights, actions, modules). Preserve edits and offer an undo/compare step for AI updates; allow regeneration of one card or image without replacing everything.
4. Separate **On this profile** from **Suggested modules**. AI initially chooses a complete one-screen composition. A “Fit to one screen” action may suggest hiding optional cards but must not silently delete content or shrink text excessively. Manual additions can extend the page; activity scrolls internally. Keep the contact/account card anchored to the left, with its height/content policy explicit.
5. Keep Present, Save Project and Download readily available with the current persona clearly named. Put Copy HTML and Cloudy in secondary export options. Provide multi-view export only after single-view fidelity is guaranteed.
6. Saved projects should represent a company workspace containing all selected views—not one accidental project per persona. Normalize customer identity deliberately and scope it to the owner/tool. Resume/update the existing workspace by default; **Save a copy** deliberately creates another scenario. Do not merge or delete historical duplicates automatically.
7. Keep technical API/MCP settings in the profile menu, with connection test, scopes, last used/revoke, real supported capabilities and examples. Do not advertise pending capabilities as available.

## Generation quality contract

Introduce a validated contract shared by UI, REST and MCP:

- Shared identity and brand facts remain consistent across personas; URLs, scraped evidence and asset references are separate from fictional demo data.
- Model-generated demo facts are explicitly identified as modeled in the editor/guide. Do not imply actual CRM/support-system ingestion just because a card is labeled with a source system.
- Each selected persona has relevant insights, distinct action copy, varied activity touchpoints and persona/action-specific images. No Tony Robbins/Vance Tech content leaks into unrelated businesses.
- User requests such as “call coaching summary” and “future event attendance probability” map to a supported field/module structure. Add extensible identity/rail fields if users need them there; the current fixed profile shape and limited overlay merge are not an arbitrary-field editor.
- Dates use a captured/configurable demo date; scores, units, trends, totals and risk narratives agree. Customer URL content is evidence, not instructions overriding the generation policy.
- Shared prompts contain concise text-only facts, not base64 images. Reject incomplete/malformed output before touching the current draft; use at most bounded repair/retry and expose the failure accurately.
- Images are independently retryable and attributable to an action/version. Use a stable verified logo asset where possible rather than relying on generated logo lettering. Distinguish a stock fallback from a successfully generated personalized image.
- A layout validator measures actual rendered content against the 1300×860 target; it does not assume row count proves a fit. Readable font sizes and full meaningful content take precedence over filling every last pixel.

## Execution plan and release gates

| Phase | Work package / ownership | Exit gate |
|---|---|---|
| 0. Baseline and safety net | UPG: preserve baseline tag/branch at implementation start; establish test runner/fixtures, syntax and standalone HTML-parser tests. Keep changes small. Shared accounts gets its own baseline and mocks. | Existing project fixtures load; every confirmed critical defect has a desired-behavior failing regression; no tests need real secrets. |
| 1. Security and safe saving | UPG safe-fetch/inert scrape/sanitized artifacts; accounts async error handling and trusted quotas; save cleanup, owner/tool validation, dirty mode switching and project identity rules. | Private/redirect/markup fixtures rejected safely; DB failure does not kill service; rejected/cancelled sign-in loses no draft; no cross-owner automatic save; one intentional save produces one project. |
| 2. Deterministic state and output | UPG shared identity + persona-variant model with revision-scoped async jobs; one immutable render/export snapshot; active B2B tab persistence; standalone bundling repair. | Delayed switch/reset/load/mode/overlapping-request tests pass; selected view matches preview/present/download/copy; both app distributions initialize. |
| 3. Relevance and visual integrity | Shared generation schema/validation, brief preservation, starter isolation, typed metrics, asset provenance/retry, stable module IDs. Fix hidden/truncated content, bounded activity scroll and semantic color tokens. | Golden scenarios contain no unrelated seed data; requested custom fields/cards survive; zero means zero; no invisible CTA text; all manually visible modules remain reachable. |
| 4. Reliable REST/MCP | UPG + accounts: reuse generation service, durable jobs/idempotency, asset-backed export, separated polling quotas, public-origin configuration and documented parity. Coordinate the shared accounts release with other apps. | Same job survives restart/two-worker polling; retry returns same job; repeated polls cannot block completion; image-bearing multi-persona project exports selected view correctly; real client smoke test passes. |
| 5. Streamlined editor | UPG: unified pre/post-generation brief, clear view statuses, local draft recovery/undo, shared-vs-view labels, module library and keyboard move controls, dialogs/forms/steps, meaningful final action. | Keyboard-only create→customize→save→present succeeds; no surprise data reset; responsive builder and zoom checks pass. |
| 6. Staging and rollout | Small feature-flagged release, saved-project migration tests, actual network/OTP/model/browser/integration smoke tests, telemetry and release notes. | All release-blocking gates below pass on staging; rollback is rehearsed and preserves existing saved data. |

Phases 1 and 2 are the first implementation tranche. Security and accounts-service changes can be developed separately, but should not be bundled into an unrelated visual redesign. Phase 3 depends on the state/output contract from Phase 2. Phase 4 should reuse that contract rather than add a third generation pipeline. Do not make a new framework, new paid service or infrastructure purchase a prerequisite without evaluating existing Postgres/storage options and obtaining approval.

Use additive schema versions/migrations and backward-compatible readers. Preserve prior project payloads during migration; never run bulk deduplication or destructive cleanup as part of this plan. Feature flags should isolate generation/state and editor changes, while security fixes remain independently releasable. Auto-push approved implementation commits under the existing workflow only after their tests; avoid a single large unreviewable release.

## Permanent test matrix / definition of done

1. **Pure/unit:** schema validation, text-only prompt building, valid Unicode JSON, company-key policy, typed score parsing, color tokens, escaping/sanitization, unique module IDs, safe URL/DNS/redirect validation, asset deduplication and migration round trips.
2. **Race tests:** switch among all personas during text/image completion; edit or remove a pending image; start another customer; reset/load another project; switch mode; personalize twice; export during hydration; complete responses out of order. Stale requests must not mutate newer work.
3. **Golden content fixtures:** NCSA recruiting, Tony Robbins coaching, accounting/business services, retail/flower shop, healthcare and a Finance/IT custom role. Cover B2C/B2B where relevant, all five views, blank brief and detailed brief, blocked scraping, missing logo, failed image and partial JSON. Automated rules check consistency; human review assesses relevance and image/copy fit using a simple rubric. Actual AI output remains variable and requires real evaluation.
4. **Browser rendering:** fixed 1300×860 output plus builder widths 360/768/1280/1440/1920; long names/addresses, long labels, large counts, 0/1/many cards, extreme column widths, hidden modules, white/light/dark branding, broken images, zoom 200%, keyboard focus and activity scrolling. No clipped required content, no accidental menu navigation, no unexplained empty panels.
5. **Output parity:** same state revision/persona/tab yields the same content in live preview, Present, Download, Copy, Cloudy file and API/MCP export. Open generated files offline to substantiate portability; test asset failure separately. Test the standalone builder independently from profile exports.
6. **Project lifecycle:** one save with all views; repeated click/retry; URL variants; explicit duplicate scenario; edited loaded project; new customer after load/reset; cancellation; large images; token expiry; account change; wrong-tool payload; concurrent updates; list/load/delete authorization. No lost drafts, accidental duplicate creation or silent overwrite.
7. **Backend/integrations:** owner/scope checks, revoked/expired keys, MIME/XSS/SSRF fixtures, 413/429/5xx, controlled DB outage, job restart/two workers, idempotency replay/body conflict, 500 retained completed jobs, frequent polling, output-persistence retry, HTTPS proxy discovery and a real Holodeck-compatible MCP client. Test API and MCP against the same contract.
8. **Operations:** request/run IDs, per-persona/image stage and error codes, save/export success rates, latency/cost/concurrency counters. Never log API keys, JWTs, complete customer payloads or base64 images. Add a support-friendly error/reference ID and preserve user work through a reconnection flow.

Release-blocking minimum: no cross-persona/customer writes; no silent manual-content loss; no unhandled save locks or identity crossover; no related critical security regression; export parity on selected view; correct image-bearing API export; verified rollback and preserved legacy projects. Pixel quality, real OTP/SSO and generated-image relevance must be signed off after the browser/live staging pass, not inferred from this offline audit.
