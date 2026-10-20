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
- [ ] Push source and deploy preview alongside unchanged production.
- [ ] Hosted smoke checks, rollout notes and final checkpoint.

## Design and implementation notes

The Apple-design skill informed the editor's hierarchy and restrained interactions:
readable system typography, consistent spacing, navy/cobalt accents on light
surfaces, named navigation, one persistent persona selector, and a larger live
preview. Generation choices and per-view personalization are separate actions.
Focus mode, header save/present/export controls, and persistent feedback reduce
trips through the wizard. Motion is brief and respects reduced-motion settings.
The generated Salesforce profile design is deliberately unchanged.

An additional regression was found during the DOM workflow audit: simply visiting
a queued view caused native color-input normalization and empty optional fields
to look like manual edits. Preview generation now compares those equivalent values
canonically while preserving genuine user edits.

Cancellation checks also run between the real initial scrape, backend health,
text, and image stages. Stopping prevents subsequent AI requests; an already
dispatched request may complete, but its late result is ignored. Regression tests
exercise this actual client pipeline using deferred HTTP fixtures.

## Reproduce verification

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
