# Isolated UPG preview revamp

## Release contract

- Production `/` and its frontend remain unchanged.
- The redesigned editor is available only at `/preview-v2/`.
- Both editors use the existing AI/auth backend. This is a UI trial, not a separately isolated runtime.
- Preview drafts and provider preferences use separate browser storage.
- Preview cloud saves always create a separate copy. Preview cannot update or delete an existing cloud project.
- Promotion to `/` requires the user's subsequent approval.

## Rollback checkpoints

- Stable baseline: `c3e12b2` (`Make profile presentations slide-ready in 16:9`).
- Baseline tag: `rollback/pre-preview-v2-2026-10-20`, backed up to GitHub.
- Development branch: `codex/preview-v2`.
- Heroku baseline: release **v55**, succeeded, `Deploy c3e12b28` (2026-10-11).
- Phase 1 checkpoint: `rollback/preview-v2-phase1-2026-10-20`.
- Phase 2 checkpoint: `rollback/preview-v2-phase2-2026-10-20`.
- Rollback code through a reviewed revert/redeploy or the retained stable tag. Heroku release rollback is an emergency fallback, not a data restore.

## Work tracking

TaskCreate/TaskUpdate tools are unavailable in this session; this checklist tracks the work instead.

### Phase 1 — isolated, clearer workspace

- [x] Record and push the stable rollback tag.
- [x] Snapshot the frontend into `preview-v2/`.
- [x] Explicit preview routes, trailing-slash redirect, asset handling and missing-file 404.
- [x] Calmer readable typography, named navigation and larger preview.
- [x] One persistent persona selector and clearer generation versus personalization controls.
- [x] Preserve existing control IDs, editing handlers, sign-in, presentation and export capabilities.
- [x] Separate browser storage and enforce copy-only project saves.
- [x] Phase 1 verification: 178/178 tests passed, including HTTP routing, original-file hashes, copy-only save/idempotency guards and UI structure.
- [x] Phase 1 rollback checkpoint.

### Phase 2 — responsive, forgiving interactions

- [x] Continuous column resize feedback through a bounded, revision-checked message bridge; the iframe sandbox remains intact and exports omit editor-only code.
- [x] Precise card insertion, dedicated drag handles, placement markers and keyboard alternatives.
- [x] Focus preservation and reduced-motion scroll behavior.
- [x] Persistent recovery feedback and stop-remaining-generation action.
- [x] Automated regression and isolation checks: 195/195 tests and 16/16 DOM workflow checks passed.
- [x] Approved-tool visual checks assessed: unavailable; no browser/paint verification claimed.
- [x] Push source and deploy preview alongside unchanged production.
- [x] Hosted smoke checks, rollout notes and final checkpoint.

## Hosted release

- Preview: `https://sassysolutions-unified-pro-gen-09e8f3d71dc2.pear-virginia.herokuapp-internal.com/preview-v2/`
- The original URL remains `/`, with no redesign or changed generation runtime.
- Application code: `6b9a7e4`; verified Heroku release **v56**, succeeded on October 20, 2026.
- GitHub `main` contains the additive release; `codex/preview-v2` and all three rollback tags are backed up.
- Authenticated one-off dyno verification of v56 passed: production file hashes, original and preview HTTP routes, every preview module, stylesheet, starter assets, backend health, shared sign-in script, one real Gemini text response, and one real generated recommendation image.
- The generated test image was discarded and no cloud projects were created or changed.
- A subsequent documentation-only commit records these results without changing application code.

Hands-on review is still required for visual rendering, drag feel, keyboard and
touch behavior in a real browser, actual OTP sign-in, and saving/reopening a cloud
copy. Browser verification tools required by this repository were unavailable;
the HTTP, unit, and DOM checks above do not replace those checks.

## Design and implementation notes

The Apple-design skill informed the editor's hierarchy and restrained interactions:
readable system typography, consistent spacing, navy/cobalt accents on light
surfaces, named navigation, one persistent persona selector, and a larger live
preview. Generation choices and per-view personalization are separate actions.
Focus mode, header save/present/export controls, and persistent feedback reduce
trips through the wizard. Motion is brief and respects reduced-motion settings.
The generated Salesforce profile design is deliberately unchanged.

### Preview branding follow-up

At the user's request, the preview restores a navy-to-blue header, a cyan edge,
blue selected-view controls and a softly blue preview toolbar. The SaaSy logo
matches the original `w-16 h-16` size (4rem / 64px at default text size), without
shrinking on narrow screens. Light editing surfaces and the redesigned spacing
remain. Header actions, dropdowns, keyboard focus and accessibility preference
fallbacks keep contrasting colors. No original frontend or generation logic was
changed. Verification: 196 automated tests and 16 DOM checks passed, including
logo-size and foreground/background contrast assertions; no browser paint check
was available.

The subsequent logo-size refinement increases the preview mark from 4rem to 5rem
(80px at default text size), following feedback that matching the original's
nominal 64px box still looked too small. A dedicated non-shrinking wrapper and
explicit image sizing preserve the original artwork and aspect ratio, including
at narrow breakpoints. Sticky-preview and personalization scroll offsets clear
the taller header. This changes only the trial editor, not the original app.
Verification: 197 automated tests and 16 DOM checks passed; browser paint
verification remains unavailable.

The profile-type buttons now use a solid blue selected state with white text and
a lighter blue unselected state. The customer URL field has a persistent 2px blue
border, a subtle blue-tinted surface, larger text and an explicit keyboard focus
outline. These preview-only accents follow the Apple-design guidance on clear
states; forced-colors selection/focus cues and full-opacity text remain legible.
Verification: 198 automated tests and 16 DOM checks passed, including text and
field-border contrast assertions. Browser paint verification remains unavailable.

An additional regression was found during the DOM workflow audit: simply visiting
a queued view caused native color-input normalization and empty optional fields
to look like manual edits. Preview generation now compares those equivalent values
canonically while preserving genuine user edits.

Cancellation checks also run between the real initial scrape, backend health,
text, and image stages. Stopping prevents subsequent AI requests; an already
dispatched request may complete, but its late result is ignored. Regression tests
exercise this actual client pipeline using deferred HTTP fixtures.

## Reproduce verification

### Field finder and wording cleanup

Rollback checkpoint: `rollback/preview-before-field-finder-2026-10-20` at
`2d449b6`, backed up to GitHub before this change.

TaskCreate/TaskUpdate remain unavailable; this checklist tracks the focused pass:

- [x] Shorten workspace context, keep draft recovery actionable, and move the
  simulated-data explanation into a native disclosure.
- [x] Add a local field finder for the selected view and shared customer settings.
- [x] Complete regression, DOM workflow and accessibility source review.
- [x] Prepare the preview release; hosting confirmation is recorded in the chat.

The Apple-design skill informed the quieter hierarchy and contextual feedback.
Completed generation no longer leaves a list of redundant ready messages;
generation, missing-image and retry states stay visible. The preview toolbar
reports screen fit, with shorter-layout guidance only when it overflows. Browser
backup feedback does not claim an online save. Blue profile choices, the URL
outline and the larger logo are retained.

Use **Find something to edit**, or Command-K / Control-K, to search field labels,
actual generated text, current values and module titles across the seven editor
sections. A result opens its section, expands disclosures, focuses the control
and briefly outlines it. Results include shared-setting and suggested/hidden
module context; navigation never makes a hidden module visible. Search performs
no AI requests and does not inspect the sandboxed output iframe. After a view,
mode or project change, stale results are rejected and refreshed. Provider keys
and image payloads are excluded. The accessibility skill informed combobox
roles/state, keyboard interaction, native labels and focus handling.

Verification: 199 automated tests, 18 full-editor DOM checks and 18 dedicated
finder DOM checks passed. Source review for SC 1.3.1 form labels, SC 2.1.1
keyboard, and SC 4.1.2 role/value: no outstanding findings (`[]` for each).
The keyboard-selection reset found during independent review was corrected and
covered by a mutation-refresh regression. Browser paint and screen-reader
verification remain unperformed because the required preview tools are absent.

Additional DOM verification:

```sh
UPG_JSDOM_PATH=/path/to/node_modules/jsdom node scripts/check-preview-search.cjs
```

```sh
node --test test/*.test.cjs
UPG_JSDOM_PATH=/path/to/node_modules/jsdom node scripts/check-preview-dom.cjs
node scripts/preview-smoke.cjs
```

The DOM harness uses an optional external jsdom installation, not a new app
dependency. The hosted smoke script accepts `--ai` to opt into one small real text
call and one generated image; neither credentials nor generated image content
are printed or saved. It does not create or modify cloud projects.

## Review tomorrow

Test B2C and B2B; create multiple views; personalize one; resize and move modules;
sign in; open an original project as a copy; save and reopen a preview copy;
present/fullscreen; download/copy HTML; refresh and recover a preview draft.
Original projects must not be overwritten and the original URL must retain its
current interface. Real AI calls consume the same provider quota as production.

## Verification boundaries

- No `preview_*` browser tools are available in this session. Source/DOM checks do not verify pixel rendering or gesture feel.
- Direct unauthenticated HTTP requests to the deployed internal hostname return its expected SSO redirect. This is not an AI failure.
- Hosted backend checks can run through the authenticated Heroku CLI in a one-off dyno using `node scripts/preview-smoke.cjs --ai`; this does not prove browser SSO/OTP or actual cloud save success.
- Preview copies remain in the shared signed-in user's UPG project list, prefixed `Preview ·`. Each deliberate save makes a new copy; retries of the same attempt remain idempotent. Use the original app to delete unwanted copies.
