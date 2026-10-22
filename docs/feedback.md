# UPG feedback

Implementation tracking (TaskCreate/TaskUpdate are unavailable in this session):

- [x] Inspect LPG/shared accounts and coordinate one shared-service owner.
- [x] Record UPG rollback checkpoint `rollback/pre-feedback-2026-10-22`.
- [x] Add and verify backward-compatible shared tool isolation and migration.
- [x] Add UPG feedback, private inbox, uploads and tool-pinned proxy.
- [x] Verify real PostgreSQL persistence, retries, authorization and isolation.
- [x] Verify desktop/mobile behavior, compression and account changes.
- [x] Run the final integrated regression suite (203 tests passing).
- [x] Deploy accounts first (v32); coordinate compatibility with the LPG owner.
- [ ] Push UPG and confirm its dependent release.

The feedback service uses the existing SaaSy Accounts PostgreSQL database and
SaasyAuth sessions. No new database, mail service or sign-in flow is introduced.
Feedback is identified by `tool: upg`; older clients and existing LPG submissions
remain associated with `lpg`. The UPG proxy pins all `/feedback` requests to `upg`.

Feedback controls are added to both UPG editors. This is an additive feature on
the original editor; it does not promote the preview redesign. Feedback and inbox
UI are excluded from exported customer profiles. The bundled builder includes
the controls, with the same hosted accounts/backend requirements as sign-in.

Guests can submit a category, name, email, description and up to three PNG/JPEG/
WebP screenshots. The browser resizes/compresses screenshots to at most 1 MiB
each; accounts validates them independently. Only app name/version and a fixed
screen/mode/view label accompany the explicit submission. Project state, customer
contents, URLs, credentials and API keys are not collected automatically.

After signing in as `imansur@salesforce.com`, the server verifies inbox access.
The **Feedback Inbox** toolbar button then provides unread counts, filters,
pagination, attachments, read/status updates and confirmed permanent deletion.
Every private API operation is authenticated and scoped by tool server-side.

Drafts are held in memory during retries. Idempotency keys survive a retry of the
same payload/context, and success requires a persisted submission identifier.
Sign-out or account changes discard private form/inbox content and screenshot
URLs, and pending responses cannot repopulate the previous account's content.

An expired JWT revokes inbox access but preserves the unfinished submission while
the same account email is retained. Explicit sign-out/account switching clears it.
Drafts are not persisted to browser storage and do not survive page navigation.

## Verification and deployment

- Rollback: `rollback/pre-feedback-2026-10-22` (UPG `93a3273`).
- Accounts `bab6f1e` deployed first, release **v32**, succeeded October 22, 2026.
- Shared suite: **54 passing**, including real PostgreSQL migration/backfill,
  persistence, legacy retries, tool isolation and authenticated binary access.
- Frontend behavioral checks: **14 passing** (including JWT expiration, async
  account changes, stale responses, screenshots, pagination and duplicate retry).
- Local Chromium plus a disposable PostgreSQL database verified guest storage,
  real canvas compression of three large images (each at most 1 MiB), upload,
  paste, drag/drop, fourth-image rejection, lost-response retry creating one row,
  admin screenshot rendering/status/delete, attachment cascade deletion, tool
  isolation, member denial, sign-out cleanup, focus/Escape and both editors at
  desktop 1440px and mobile 390px. Test records were removed afterward.
- Preview editor and field-finder DOM checks: **18 + 18 passing**. AI was stubbed
  for generation regressions; this change does not alter the generation pipeline.
- UPG integrated regression suite: **203 passing**, no failures or skips.
- Security/accessibility source review found and resolved expired-JWT draft loss.

Opt-in checks reuse existing developer tooling rather than adding runtime deps:

```sh
UPG_JSDOM_PATH=/path/to/jsdom node --test scripts/check-feedback-dom.cjs
# Real browser runner requires an explicitly disposable local database, accounts
# checkout/dependencies and Playwright; see its environment guards and header.
node scripts/check-feedback-browser.cjs
```

The approved original-page baseline updates only the two builder HTML hashes for
additive feedback markup/bundling; generation/runtime module hashes are unchanged.
No redesign promotion, separate database, new mail provider or config is required.
