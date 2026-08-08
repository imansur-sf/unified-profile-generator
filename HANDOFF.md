# UPG Session Handoff

Last updated: 2026-08-08. **Read this first.** No PROGRESS.md exists yet for this repo — `git log` is the history; this file is current state + what's left.

## Where we are

- **Working directory**: `/Users/imansur/claude/unified-profile-generator`.
- **Branch**: `main`. Fully in sync with `origin/main` — nothing pending push. Working tree clean (only `node_modules/` untracked, gitignored elsewhere or harmless).
- **Deployment**: Heroku (Fir CNB buildpack via `project.toml`), `web: node server.js` (`Procfile`). Node 22.x, Express 4, `GEMINI_API_KEY` in Heroku env — no secrets in source.
- **Cross-property save/sign-in initiative is fully complete.** UPG is one of four properties — alongside the SaaSy Solutions catalog, Loyalty Portal Generator (LPG), and Interactive Customer Presentations (ICP) — sharing a save/sign-in system backed by the standalone `saasy-accounts` Heroku app. UPG's piece:
  - Sign-in widget (`<script src="https://sassysolutions-accounts-8215113235cf.aster-virginia.herokuapp.com/saasy-auth.js">`, `index.html:693`): Salesforce-email OTP, no passwords.
  - Save/load project integration in `js/app.js` (`7adc004`): project save (create/update), a "My Projects" list with load/delete, and `?projectId=` URL-based auto-hydration on page load — lets the SaaSy Solutions catalog's "Reopen" links jump straight into a saved profile.
  - Save-project-name modal (`8f65875`): previously Save Project silently derived the name from the brand name and always overwrote the current project. Now a modal lets the user name it, and offers Update vs. Save-as-New once a project is already loaded, so an edit session doesn't silently clobber the original.
  - "Export for Cloudy" button (`exportForCloudy()`, `js/app.js:556`, bundled into the `8f65875` commit): downloads the self-contained export HTML and opens `sfdc.co/cloudy` in a new tab with an SSO/drag-in reminder — no automated push exists (Cloudy has no push API yet).
  - See `saasy-accounts`'s own `HANDOFF.md` (sibling repo) for the shared-backend side of this.
- **AI image generation** (`87453dc`, `js/localai.js`): generates a profile photo and recommendation-card imagery via the LLM Gateway image path. Predates and is unrelated to the sign-in work; unchanged since.
- **No open backlog items.** Next session's job is to watch for regressions the user flags after reviewing the SaasyAuth/My-Projects panel and the save-name modal, since neither shipped with a design check-in.

## Architecture (current)

```
Browser
  ├─ LLM calls  ──►  Heroku app (server.js) ──►  Gemini API
  │                   GEMINI_API_KEY lives in Heroku env
  └─ Save/Load/Auth ──►  saasy-auth.js widget ──►  saasy-accounts (shared Heroku backend + Postgres)
```

## Standing directives

1. **Auto-push**: for this repo, run `git add`/`commit`/`push` directly rather than handing the user terminal commands (established convention, mirrors `saasy-solutions`/`interactive-customer-presentations`).
2. **No secrets in committed source.** `GEMINI_API_KEY` lives in Heroku env only.
3. **Browser verification must exclusively use `preview_*` tools** — never Bash or other browser automation.

## Key files

- **`js/app.js`** — wizard state (`state`), `exportForCloudy()` (line 556), SaasyAuth save/load/My-Projects wiring (from `7adc004`), save-name modal + Update/Save-as-New (from `8f65875`).
- **`js/localai.js`** — AI image generation for profile photo + recommendation cards (`87453dc`).
- **`js/generator.js` / `js/defaults.js` / `js/pagehost.js`** — profile HTML generation, default data, Page Host integration.
- **`index.html`** — SaasyAuth script tag (line 693), save-name modal markup (from `8f65875`).
- **`Unified_Profile_Generator.html`** — the standalone/exported single-file version of the tool; kept in sync with the `index.html`/`js/*` wizard on each relevant commit.
- **`server.js`** — Express + Gemini proxy, same-origin backend (superseded the earlier Cloudflare Worker per `5768419`).
- **`project.toml` / `Procfile`** — Heroku Fir CNB buildpack config.

## What to do next session

1. No known open backlog items. If the user raises new findings after reviewing this work, triage those first.
2. For the shared-backend side of any My-Projects/SaasyAuth issue, see `saasy-accounts/HANDOFF.md` (sibling repo) — it owns the OTP/JWT/Postgres logic that UPG's panel calls into.
