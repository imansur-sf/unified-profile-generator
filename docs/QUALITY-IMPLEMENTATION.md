# Two-phase quality implementation

The October 7 audit is the detailed finding/acceptance-test inventory. Implementation is consolidated into two releases, as requested.

## Rollback checkpoints

- Before implementation: UPG tag `upg-quality-baseline-2026-10-07` (`56af5a0`); accounts tag `accounts-upg-quality-baseline-2026-10-07` (`de6ed8d`). Both pushed to origin.
- After Phase 1: UPG tag `upg-quality-phase-1-2026-10-07` (`129d223`); accounts tag `accounts-upg-quality-phase-1-2026-10-07` (`e77a73e`). Both pushed to origin.
- After Phase 2: UPG tag `upg-quality-phase-2-2026-10-07`; accounts tag `accounts-upg-quality-phase-2-2026-10-07` (`7dd7fa2`). The UPG tag is applied to the final verified release commit containing this document.

Rollback uses a new revert/release commit based on the appropriate checkpoint, never a force-push/reset of shared history. Shared-account data migrations must be additive; old app versions must remain able to read old project payloads. Tags preserve source, not database contents or Heroku config. No existing projects will be bulk modified or deleted.

## Phase 1 — Reliable and safe foundation (verification complete)

- [x] Scope asynchronous generation/image updates to their original draft/mode/persona/revision; protect manual edits and mode switches.
- [x] Preserve briefs, shared metrics, reject malformed/default-only success; eliminate template contamination and duplicate module IDs. Semantic relevance still requires human sampling.
- [x] Safe scrape/fetch and rendered rich-text boundaries, robust save/session/project ownership handling and shared-account async error handling.
- [x] One immutable output snapshot, account-tab fidelity, correct colors/metrics, content-preserving rendering, safe standalone bundling.
- [x] Permanent offline regression tests and repeatable builds: 54 UPG tests, 19 accounts tests; standalone rebuilt and Phase 1 checkpoint pushed.

## Phase 2 — Complete experience and integration reliability

- [x] Per-view text/image progress, image provenance and individual-image retry; shared generation prompts/contracts across UI, API and MCP. Optional per-persona profile-card fields support custom decision briefs.
- [x] Accounts-backed durable jobs, fenced leases, idempotent creation/completion, explicit authenticated resume, per-image checkpoints, image-bearing persona exports, independent polling quotas and canonical public origin.
- [x] Selected-view context, keyboard module movement/reordering, labels/dialog focus, upload validation, meaningful completion, IndexedDB draft recovery and explicit save-copy flow. Drafts stay separate from online projects; changed editors and account switches cannot be overwritten by a delayed load.
- [x] In-app integration guide, API/MCP contracts, deployment/configuration diagnostics and rollback instructions.
- [x] Final offline gate: 104 UPG tests, 34 accounts tests, standalone rebuild/parity and diff checks. Nine additional SQL checks executed against an isolated PGlite/Postgres engine. Accounts Phase 2 pushed first; UPG receives the final checkpoint after the release prerequisite.
- [ ] Browser/staging smoke test and human review of real generated outputs; not available through the permitted browser tools in this session.

## Test evidence and remaining live gate

- `npm test` in UPG: state races, ownership, draft/save replay, all supported renderer modes, every visible module, color contrast, safe HTML/URL handling, keyboard controls, nested dialogs, async jobs, image budgets and request boundaries. Fixtures/mocks are used; this is not a pixel-level end-to-end test.
- `npm test` in accounts: 34 tests including optional revisions, owner-bound session recovery, idempotency, worker fencing, scoped exports and shared quotas. HTTP uses loopback and mocked storage/providers.
- Isolated SQL harness: `/private/tmp/upg-pglite-validation.bF2h1c/validate.cjs` (temporary, OS may remove). Nine substantive subtests ran the actual schema and route SQL, including schema reapplication, database close/reopen/resume, lost-response replay, stale leases, trigger-induced transaction rollback, same-company copies/revisions and quota reset. This single-connection WASM database does not prove deployed multi-connection concurrency.
- No paid generation or real OTP was initiated. No existing cloud project was edited. Before a meeting: test one B2C and one B2B company with several views; inspect image/action relevance and all logo variants; compare Preview/Present/Download; exercise long modules and white/dark brands; reload a local draft; save/update/copy after session expiry; complete one API/MCP job and export two personas; restart/resume a test job in staging.
- The standalone-builder regression now checks that the committed bundle matches a fresh build. Run `npm run build` before `npm test` after editor changes. A hosted CI workflow is not configured by this release.

## Verification boundaries

Live email/OTP, production DB mutations and paid model calls are not part of offline regression tests. Browser verification requires the repository's permitted tools or the user's approval of an alternate browser tool. Pending external checks will be reported explicitly rather than treated as passing.

## Deployment notes

- Deploy accounts before UPG. Its existing release migration adds nullable/idempotency metadata, a revision counter, jobs and quota tables without rewriting project JSON. Old clients remain compatible; new clients use optimistic revisions.
- Set UPG `PUBLIC_ORIGIN` to its exact HTTPS deployment origin so discovery/exports work behind the Heroku TLS proxy. `TRUST_PROXY` defaults to false; only use operator-verified proxy IP/CIDRs, never an arbitrary forwarded header or trust-all. Until configured, guest quotas may be shared by proxy IP.
- The rollback tags preserve source only. Keep database backups and config history separately; leave additive columns in place when rolling back application code.
- No production project was deleted, merged, rewritten, or test-saved by this work.
- Deployment configuration change: UPG `PUBLIC_ORIGIN` was previously unset. It is now `https://sassysolutions-unified-pro-gen-09e8f3d71dc2.pear-virginia.herokuapp-internal.com` (Heroku config release `v51`). No secret was read or changed. Production integration/MCP routes now fail clearly with `503 public_origin_required` if this setting is missing; the guest editor remains available.

## How to choose a rollback

- Undo only Phase 2: restore application source to the **Phase 1 tags in both repositories**, deploy accounts/UPG as a coordinated release, and retain additive database tables/columns. Pending Phase 2 jobs will not resume on older code; keep their records for a later upgrade.
- Undo both phases: use the **baseline tags in both repositories**. This also restores the old bugs and security limitations documented by the audit, so prefer a targeted correction if possible.
- Ask for the chosen checkpoint to be restored; create a new revert/release commit on `main` and rebuild its standalone bundle. Do not force-push, delete projects, or drop new database tables as part of a source rollback.
- The non-secret `PUBLIC_ORIGIN` setting is compatible with older code and can remain. If exact config restoration is necessary, its prior state was unset. Configuration history and database backups remain separate from Git tags.
