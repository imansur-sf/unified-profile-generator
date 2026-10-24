# Claude implementation brief: portable Unified Profile Generator skill

## Start here: your assignment

Read `00-START-HERE.md` if present, this entire brief, the package inventory, and the relevant source/reference files before editing anything. You are receiving a **handoff kit and source snapshot**, not a claim that a production-ready Claude skill already exists. Your job is to build and verify that skill in your available environment.

The owner wants Claude to produce the same family of tailored Salesforce/Data Cloud screens as Unified Profile Generator (UPG), without using UPG's Heroku application. The current hosted app must remain operational and unchanged. Produce a portable skill that can work in two ways:

1. Standalone: a user asks Claude to generate or revise a customer-specific unified profile.
2. As a production component: a separate 3D-world/presentation skill supplies a scene brief and consumes the generated HTML, structured JSON, and, when supported, PNG.

**Extract and reuse the supplied engine. Do not independently redesign Salesforce screens or recreate UPG's editor.** Never claim equivalent behavior based on a prompt alone. Preserve known rendering code, validate structured data, and demonstrate the final artifacts.

### Hard boundaries

- Work only inside your designated skill workspace. Treat `source/upg-core/` as an immutable reference snapshot; copy it into your implementation directory before adapting it. Preserve checksums/source version information.
- Do not modify/deploy the live UPG app, Heroku settings, databases, account services, unrelated projects, or other tools. Do not call back to UPG or require its API key.
- Do not add sign-in, OTP, cloud-project persistence, MCP hosting, a web editor, a server, a separate database, or a paid provider. These are not needed for the portable skill.
- Do not evade enterprise restrictions, authentication, browser sandbox protections, network policy, installation restrictions, or connector approvals. A self-contained skill is an architectural alternative, not a bypass.
- Do not ship credentials, environment files, tokens, customer project backups, or personal production data. Use bundled synthetic examples and approved public research only.
- If code execution, a necessary runtime, browser capture, research, or image generation is unavailable, report that specific limitation. Do not fabricate a successful test, image, PNG, or company fact.

## First deliverable: capability preflight

Before promising the final experience, determine the actual target environment. Record what you tested rather than assuming every Claude product has identical tools.

| Capability | Claude Code/local environment | Managed Claude web/enterprise environment |
| --- | --- | --- |
| Read packaged files and run scripts | Verify filesystem access and Node version | Verify custom skills and code execution are enabled by the administrator |
| Run the JavaScript rendering engine | Verify Node built-ins and any exact dependencies | Verify Node is actually available; do not presume a Python-only environment can run it |
| Customer website research | Use tools/network access approved for this environment | Verify available browsing and download tools; use supplied brand facts if browsing is unavailable |
| Image creation/retrieval | Use only approved, available tools and explicit user authorization | Do not assume an image-generation tool exists merely because Claude can write image prompts |
| Browser screenshot | Verify an approved browser, sandbox, and rendering library | Verify browser installation/execution policy; HTML/JSON may be the supported deliverables instead |
| Transfer artifacts to another skill | Verify local paths and execution orchestration | Verify downloadable artifact/filesystem handoff in that product |

If the runtime is incompatible, stop the affected part and explain options. Do not convert the renderer into a guessed approximation merely to declare parity. Ask the owner before undertaking a major port to another language/runtime. Produce useful HTML/JSON without PNG if that is the supported capability, while clearly labeling the limitation.

## Architecture and source routing

The package uses `source/upg-core/` for relevant original components; `examples/` for synthetic data and runnable samples; `tools/` for handoff helpers; and `references/` for explanatory material. Use the delivered inventory to resolve the exact files. Do not assume a proposed helper exists until you have inspected it.

The original engine has several distinct layers:

- `js/defaults.js`: template structure and profile-mode defaults. Defaults are structural starting points, not verified facts about a new customer.
- `js/pagehost.js`: common prompt instructions, website extraction helpers, model-response parsing, base prompt construction, and persona-overlay prompt construction (`window.UPG_Shared`).
- `js/localai.js`: original browser/provider adapters **plus reusable image-prompt builders**. Reuse the pure helpers; do not invoke its provider or gateway adapters from the skill.
- `js/generator.js`: actual Salesforce-style HTML renderer, including B2C and B2B layouts. Preserve its layout/styling/escaping behavior.
- `js/brand-logo.js`: logo-candidate discovery helpers. Discovering a candidate URL is distinct from fetching and verifying a legitimate logo asset.
- `js/profile-contract.js`: AI-response and saved-state validation, canonical JSON utilities, and other shared contracts.
- `lib/profile-runtime.js`: headless adapter loading trusted application code, constructing state, managing persona variants, and selecting/rendering views. The VM here is an adapter for trusted bundled code, **not a security sandbox for arbitrary code**.
- `lib/profile-artifacts.js`: selected-view render-data projection and artifact metadata. Its JSON output is deliberately narrower than a full saved editor project.
- `lib/profile-capture.js` and local render helper: optional isolated browser capture of exported HTML. Inspect dependencies, environment requirements, allowed requests, sandbox protections, readiness checks, and output dimensions before use.

Do not copy the entire app server or invoke its generation worker/provider wrappers to obtain a profile. That would reintroduce the hosted dependencies we are removing. The included `lib/generation-pipeline.js` is different: it accepts injected adapters and can be reused locally with supplied source context, Claude-written JSON, approved assets, and local checkpoints.

### Intended generation flow

1. Normalize and validate the user request.
2. Gather permitted brand context and explicit presentation facts, recording provenance.
3. Build prompts from the bundled UPG instructions and the user's scene brief.
4. **Claude itself writes schema-valid JSON.** No second Gemini/Anthropic API call is required just because the original webapp called a model. Do not ask users for a model API key to reproduce this orchestration.
5. Validate JSON before changing any existing generated artifact.
6. Create a base state for one selected view; create additional views as overlays on the same customer identity.
7. Obtain/prepare approved image assets, attach them to the correct view, and preserve attribution/provenance separately.
8. Select the requested view and generate HTML using the reused renderer.
9. Export structured companion JSON and an artifact manifest. Optionally capture PNG if supported.
10. Check readiness, asset availability, dimensions, and content consistency; present the files and any limitations.

## Input and content contracts

Design a documented, versioned request file that includes customer URL, optional supplied brand facts/assets, profile type (`b2c` or `b2b`), selected views, per-view decision brief/objective, custom role when appropriate, optional shared scene facts, requested outputs, and overwrite policy. Treat this request as a proposed skill-level contract, not as an already-existing UPG endpoint.

Internal persona lens identifiers are exactly `sales`, `service`, `marketing`, `success`, and `custom`. Display `success` as Customer Success. Do not invent `finance` as a new internal lens; use `custom` with `customRole: "Finance"` and the corresponding decision brief. Support IT and other roles the same way. A predefined Sales or Service view can also have arbitrary additional relevant modules; custom fields are not exclusive to the Custom view.

Every selected view should have its own meaningful signals, recommendations, activity, and images. Example intent:

- Sales: conversion, pipeline, buying signals, cross-sell/expansion.
- Service: case resolution, support needs, entitlements, friction, save actions.
- Marketing: audience intent, channels, consent, campaigns, content relevance.
- Customer Success: adoption, health, value realization, renewal.
- Custom: the supplied department/role and decision objective take priority.

Keep the same fictional person/account identity and shared company branding across views unless the user explicitly asks for different subjects. A URL alone does not justify real customer names, private CRM history, contact details, balances, scores, or purchase behavior. Distinguish:

1. Verified public brand/product facts, with source and retrieval date.
2. User-supplied scenario facts that the presentation must preserve.
3. Modeled/synthetic demo facts created to make the screen useful.

Keep that distinction in provenance/manifest metadata and user-facing delivery notes. Never imply the skill connected to live Salesforce or retrieved real CRM records. Minimize personal data and use clearly synthetic addresses/contact details in examples.

### Validation and state details you must respect

- Run `validateAIProfile` for a full base response with the correct profile type. Overlay validation omits identity requirements, but still requires valid section content.
- Required section item arrays include insights, preferences, events, membership, recommendations, and activity. Affinity groups require numeric finite `a`/`b` values in the 0–100 range. Additional cards and rail fields have their own expected structures. Read the actual contract and prompts for all keys/limits; do not infer schemas from a screenshot.
- `buildState` initializes a complete state. It intentionally clears template photos, logo, and avatar; supply approved assets explicitly afterward. It sets some metadata for the original shared backend—adapt provenance in your working copy so a local Claude-produced artifact does not falsely claim shared-backend generation.
- `applyView` deliberately resets recommendation images to pending when content changes. Attach generated/resolved images **after** this step, then refresh that view's snapshot. Do not accidentally erase completed images or attach them only to the currently active base view.
- `addView` stores a `personaVariants[lens]` overlay rather than changing the base identity. `selectSavedView` selects one view before rendering. Updating only top-level fields or only a variant can create a preview/export mismatch. Test both the active lens and a non-active lens after edits.
- Custom modules use `extraCards`, `rightExtraCards`, and `railFields`; placement/visibility are meaningful. The original runtime makes the first middle card visible and other generated cards suggested. If the brief explicitly requests a visible module, use a documented placement/visibility policy in your adapter and verify the module actually appears. Merely adding a card to data does not prove it is visible in a screenshot.
- B2B has separate account identity/metrics, section settings, account tabs, and rail widths. Its account portrait/logo is not the same thing as the top navigation brand logo or logged-in user avatar. Test these independently.
- The saved-state validator is necessary but does not by itself prove safe arbitrary HTML, semantic completeness, correct company facts, or good rendering. Apply additional skill-level validation and visual checks.

## Logos, images, and offline portability

Use legitimate customer assets obtained through approved sources or provided by the user. A website favicon can be a fallback but may be low resolution; do not silently describe it as an official high-quality logo. Never pretend a guessed URL or AI approximation is a verified customer logo. Preserve source URL, acquisition method, licensing/usage notes if known, and fallback reason in an asset manifest.

Keep image roles separate: top brand logo, B2C subject portrait, B2B account image, logged-in avatar, and each recommendation image. Recommendation imagery should reflect that specific recommendation's title, department, audience, customer industry, and scenario. Do not reuse Sales imagery across Service/Marketing/Success unless that reuse is intentional and reported.

If image generation is unavailable, provide image prompts plus an explicit missing-asset report and accept supplied images. Do not silently substitute unrelated stock imagery, claim images were generated, or make paid network calls without approval. Missing assets must never be disguised as a completed premium-quality result.

For portable output, prefer validated embedded raster assets. Resolve local relative paths within the workspace; do not permit path traversal or arbitrary local-file reads. Reject active/unsafe image formats or sanitize them using approved utilities. Do not embed API keys, cookies, private URLs, or credentials. Record whether HTML is truly self-contained or still relies on external assets/fonts. A fallback origin URL does not make missing assets portable.

Default a logo's backing to white when appropriate so a supplied logo remains legible; retain explicit user overrides. Check light primary colors, white-on-white text, contrast-adaptive rail styling, transparent logos, missing logos, and B2B identity images. Do not globally recolor a customer's logo to solve surrounding contrast.

## HTML, JSON, PNG, and local edits

Use the renderer's existing widescreen geometry. The current artifact contract describes a 1600 × 900 CSS canvas and a 1920 × 1080 PNG; both are 16:9. Preserve proportions and screenshot the correct viewport—do not take a tall full-page capture and stretch it into a slide. Keep fonts, menus, card layout, and scroll behavior consistent with the original engine. Important scene content must be visible in the first screen; report deliberate below-fold content rather than shrinking text until unreadable.

Before a PNG is marked ready, wait for layout/fonts, wait for required images to load/decode, reject broken image placeholders, and capture using the approved sandboxed runtime. Enforce timeouts and safe network/file handling; never add `--no-sandbox` as an expedient workaround. Exported scripts and text must be treated appropriately for their trust level; execute only trusted renderer code and render escaped/validated content.

Prefer editing structured data, then regenerating HTML and PNG. Small direct HTML edits can be supported as a separate local-copy workflow, but subsequent rendering from JSON can overwrite them. Explicitly document which file is authoritative. Changing HTML does not change a previously generated PNG; recapture it. Replacing imagery requires supplied/new assets, not just a text edit.

Selected-view presentation JSON is **companion render data, not a full UPG cloud-project backup**. It does not contain all persona variants or all editor state. If the skill needs a multi-view local project, define and version a separate local project format. Never claim local edits save back to UPG. No UPG identity, API key, or account is required for these local operations.

## Integration with the 3D presentation skill

Define a file-based integration contract rather than relying on one skill magically invoking another. The caller supplies the same documented request JSON and shared scene facts; the profile skill returns a machine-readable manifest and artifact files. For each output include persona, profile type, dimensions, renderer/source version, content revision/hash, relative artifact path, modeled-data designation, provenance path, asset readiness, warnings, and capture availability/status. These are proposed skill contract fields—version and document them.

The consuming skill must place the PNG without stretching its aspect ratio. It may use HTML interactively only if its environment explicitly supports that and its trust/network model is appropriate. It must not publish local absolute paths, secret URLs, credentials, or private asset locations. Save a new content revision after every edit so a presentation cannot unknowingly pair new HTML with an old screenshot.

## Two-phase implementation plan

### Phase 1 — portable deterministic engine and first proven workflow

1. Inventory the package; verify source hashes; create a separate working implementation and record its baseline.
2. Run capability preflight in the actual target environment. List supported/unavailable features.
3. Wrap existing trusted renderer/runtime/contract code with clear local CLI commands or equivalent documented scripts. No server or model-provider dependency.
4. Use Claude to produce a validated B2C Sales response and a validated B2B Sales response from synthetic/public scenarios. Generate HTML and companion JSON for each. Use approved assets or declared fallbacks.
5. Add local screenshot capture only if supported; validate actual 1920 × 1080 PNG bytes and inspect results.
6. Add edit-and-rerender, validation failure preservation, no-overwrite defaults, and a first request/result manifest contract.
7. Record a rollback checkpoint before Phase 2. Do not modify the original source snapshot.

Exit gate: reproducible B2C and B2B outputs using the exact engine, no hidden hosted dependency, validation failures preserve the last good artifact, screenshots inspected if supported, honest capability report.

### Phase 2 — personalization, multi-view quality, and skill packaging

1. Add all five persona lenses and per-view briefs, plus a Custom role example. Preserve identity and scene facts across overlays.
2. Add purposeful custom cards/rail fields and verify placement for requested visible modules. Cover B2B tabs and account image separately from the brand logo.
3. Integrate approved research and image tools as optional adapters. Preserve asset provenance, missing-asset reporting, offline portability checks, and no paid-call defaults.
4. Finalize the standalone and 3D caller contracts, revisioned outputs, local editing instructions, and representative examples.
5. Write the actual `SKILL.md` with clear trigger descriptions, input collection, tool preflight, progressive reference loading, exact commands, validation gates, safety boundaries, and fallback behavior. Keep large schemas/prompts/examples in references, not in an enormous instruction blob.
6. Run the test matrix below in the actual target(s). Package the final skill in the directory/ZIP layout accepted by the target Claude product; verify that the ZIP contains the skill rather than another handoff folder.
7. Deliver versioned skill files, the final ZIP, sample artifacts, an inventory/checksum manifest, test report, supported-environment matrix, limitations, and rollback instructions.

Do not describe Phase 2 as complete until real artifacts and test evidence exist. A successful local Claude Code test does not establish managed enterprise-web compatibility.

## Acceptance tests and delivery evidence

- Both B2C and B2B; each of Sales, Service, Marketing, Customer Success, and Custom. Distinct content per view and stable shared identity.
- A Sales customization with a call-coaching module and additional profile fields; a Service-specific recommendation; Custom Finance or IT.
- Active view versus non-active saved variant exports match the requested lens. Editing/re-rendering one view does not overwrite another view's images or data.
- Brand logo present/missing/transparent, light and dark colors, B2B account photo, B2C portrait, avatar, recommendation image alignment, and image failure behavior.
- All required images resolve before a ready PNG; malformed/unsupported/oversized assets fail clearly. No unrelated fallbacks silently substituted.
- Exact aspect ratio, legible text, no accidental cropping of required scene content, no stretched screenshots, and no dependence on the editor UI.
- Schema errors, invalid numeric scores, invalid module shapes, invalid lens, unavailable view, invalid URL, malicious website instructions, script-like text, local path traversal, and missing runtime are handled safely and preserve good outputs.
- Offline rendering of a self-contained example, and honest external-dependency reporting for any non-self-contained example.
- Local revision/edit/rerender works without UPG requests. A PNG and its HTML/JSON manifest refer to the same content revision.
- Standalone user request and file-based 3D presentation handoff both succeed. No project data, keys, cookies, or environment secrets appear in artifacts or logs.

For each check report PASS, FAIL, or NOT RUN with reason and evidence. Include exact commands/runtime versions where applicable. Do not equate unit tests with visual inspection, or a sample fixture with successful live customer research.

## Stop conditions and questions to surface

Stop only the affected feature and report when: the environment prohibits a required tool; a necessary dependency cannot be approved/installed; research is blocked; a real logo cannot be verified; image generation is unavailable; capture cannot run safely; required user scenario facts conflict; the renderer needs a major incompatible port; or source components needed by a helper are absent. Ask the owner before adding a paid provider, external service, persistent server, new permissions, or a materially different architecture.

Deliver the supported subset clearly if a platform limitation remains. The goal is a trustworthy reusable UPG skill, not a simulated claim of parity.
