# UPG → Claude skill: implementation handoff

This is a source-and-instructions kit for **building** a Claude skill, not an installable finished skill. The existing Unified Profile Generator webapp is not changed by this package.

## Give this to Claude

Extract the entire ZIP into a workspace accessible to Claude Code, or attach it to a Claude conversation that supports reading archives and running code. Do not upload this handoff ZIP as a completed custom skill. Your enterprise administrator must permit the relevant skill, execution, research, and capture tools. A skill does not bypass connector or network restrictions.

Copy this instruction into Claude:

> Build a portable Unified Profile Generator skill from this handoff. Read 00-START-HERE.md, 01-CLAUDE-IMPLEMENTATION-BRIEF.md, and the three references completely. Verify SOURCE-MANIFEST.json using tools/verify-handoff.cjs. Reuse the supplied renderer and validation code rather than approximating the screens. Keep source/upg-core immutable and implement in a separate workspace. Start with the offline examples and tests. Follow the two-phase plan and capability preflight. Claude should generate the structured content itself; do not depend on UPG's hosted API, MCP, accounts, model gateway, or credentials. Support standalone generation and a file-based contract for my 3D presentation skill. Produce editable HTML and JSON, plus a verified 1920×1080 PNG only where safe browser capture is supported. Preserve shared identity while tailoring each persona's modules, recommendations, and imagery. Report PASS/FAIL/NOT RUN with evidence, and stop only affected features if required tools are unavailable. Deliver the actual skill package, examples, tests, limitations, and rollback instructions—not just another plan.

## Read in this order

1. `01-CLAUDE-IMPLEMENTATION-BRIEF.md`: product intent, guardrails, two phases, acceptance criteria.
2. `references/ENGINE-MAP.md`: which real engine components to reuse and traps to avoid.
3. `references/INPUT-OUTPUT-CONTRACT.md`: concrete requests, state, files, editing and 3D integration.
4. `references/TESTING-AND-RUNTIME.md`: exact commands, dependencies, capture and security limits.
5. Actual source and tests; prompts are executable source, not a paraphrased substitute.

## Prove the kit works first

Requires Node.js 22 or newer. No npm install, model key, UPG account, or network request is needed for these checks. Run from the extracted handoff folder:

```sh
node tools/verify-handoff.cjs
node --test source/upg-core/test/profile-artifacts.test.cjs source/upg-core/test/profile-capture.test.cjs source/upg-core/test/server-generation.test.cjs
node tools/render-example.cjs b2c /tmp/upg-b2c-proof
node tools/render-example.cjs b2b /tmp/upg-b2b-proof
node tools/emit-prompts.cjs b2c /tmp/upg-prompt-proof
```

Choose fresh output directories; helpers refuse to overwrite existing ones. Examples are synthetic structural smoke tests, **not polished customer research or generated photography**. Their manifests intentionally report missing images. Open each HTML to inspect; optional PNG capture instructions are in the runtime reference.

## What's included / excluded

Included: exact core source snapshot, validation, actual text/image prompt builders, B2C/B2B rendering, five persona lenses, adapter-based generation, isolated capture code, original unit tests, synthetic fixtures, helper scripts and source checksums. `SOURCE-MANIFEST.json` identifies the original Git commit and SHA-256 of every copied source file.

Excluded: editor UI, full server, sign-in/OTP, accounts/database, real projects, secrets, installed dependencies and browser binaries. Legacy browser/provider functions remain in some original source files because pure prompt functions share those files; do not invoke those adapters. See engine map.

## Rollback and ownership

This folder is a snapshot; building the skill must not modify the live app. In Claude's new implementation workspace, create a baseline Git commit before changes and another checkpoint between phases. Preserve this source snapshot and hashes. Revert only that new workspace when testing fails. No Heroku rollback is needed for an isolated skill build.

The hosted integration work is paused, not deleted. This kit does not enable a connector, alter corporate approvals, or establish compatibility with a particular managed Claude environment. Read `SOURCE-NOTICE.md` before redistribution.
