# Two-phase quality implementation

The October 7 audit is the detailed finding/acceptance-test inventory. Implementation is consolidated into two releases, as requested.

## Rollback checkpoints

- Before implementation: UPG tag `upg-quality-baseline-2026-10-07` (`56af5a0`); accounts tag `accounts-upg-quality-baseline-2026-10-07` (`de6ed8d`). Both pushed to origin.
- After Phase 1: pending.
- After Phase 2: pending.

Rollback uses a new revert/release commit based on the appropriate checkpoint, never a force-push/reset of shared history. Shared-account data migrations must be additive; old app versions must remain able to read old project payloads. Tags preserve source, not database contents or Heroku config. No existing projects will be bulk modified or deleted.

## Phase 1 — Reliable and safe foundation (verification complete)

- [x] Scope asynchronous generation/image updates to their original draft/mode/persona/revision; protect manual edits and mode switches.
- [x] Preserve briefs, shared metrics, reject malformed/default-only success; eliminate template contamination and duplicate module IDs. Semantic relevance still requires human sampling.
- [x] Safe scrape/fetch and rendered rich-text boundaries, robust save/session/project ownership handling and shared-account async error handling.
- [x] One immutable output snapshot, account-tab fidelity, correct colors/metrics, content-preserving rendering, safe standalone bundling.
- [x] Permanent offline regression tests and repeatable builds: 54 UPG tests, 19 accounts tests; standalone rebuilt. Phase 1 checkpoint follows verification.

## Phase 2 — Complete experience and integration reliability (pending)

- [ ] Clear per-view progress and image provenance/retry; relevant generation and UI/API/MCP parity.
- [ ] Durable/idempotent async jobs and image-bearing persona exports; correct polling quotas and public origins.
- [ ] Simplify selected-view editing and module library; keyboard controls, labels, dialogs, meaningful completion, draft recovery and explicit save-copy flow.
- [ ] Documentation and operational diagnostics; browser/staging verification wherever tools/access allow.
- [ ] Regression pass, commit/push and final checkpoint.

## Verification boundaries

Live email/OTP, production DB mutations and paid model calls are not part of offline regression tests. Browser verification requires the repository's permitted tools or the user's approval of an alternate browser tool. Pending external checks will be reported explicitly rather than treated as passing.

## Deployment notes

- Deploy accounts before UPG. Its existing release migration adds nullable/idempotency metadata and a revision counter without rewriting project JSON. Old clients remain compatible; new clients use optimistic revisions.
- Set UPG `PUBLIC_ORIGIN` to its exact HTTPS deployment origin so discovery/exports work behind the Heroku TLS proxy. `TRUST_PROXY` defaults to false; only use operator-verified proxy IP/CIDRs, never an arbitrary forwarded header or trust-all. Until configured, guest quotas may be shared by proxy IP.
- The rollback tags preserve source only. Keep database backups and config history separately; leave additive columns in place when rolling back application code.
- No production project was deleted, merged, rewritten, or test-saved by this work.
