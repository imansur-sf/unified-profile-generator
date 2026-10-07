# UPG API and MCP

Use the UPG application origin for these routes, not the accounts-service URL. Send the owner's UPG API key in `X-API-Key`; never put a key in a URL. Generation requires `generations:write` and `profiles:write`, status and the resume ownership preflight require `profiles:read`, and export requires `exports:read`. Generation keys created by the app include all these scopes. API keys are not stored in generation-job payloads or checkpoints.

## Generate a saved profile set

`POST /integrations/v1/upg/generations`

Supply a stable `Idempotency-Key` header: 16–200 letters, digits, underscores, or hyphens. The equivalent JSON field is `idempotencyKey`. If both are present they must match. Omission remains supported for older clients, but a lost initial response cannot be safely replayed without the generated key returned in the response.

```json
{
  "url": "https://customer.example",
  "profileType": "b2b",
  "projectName": "Customer working views",
  "tier": "balanced",
  "includeImages": true,
  "views": [
    { "persona": "sales", "objective": "expand", "brief": "Prioritize the next commercial conversation." },
    { "persona": "service", "objective": "resolve", "brief": "Prioritize support friction and entitlements." }
  ]
}
```

`views` is optional; the existing top-level `persona`, `objective`, `brief`, and `customRole` fields still create one view. Supported personas are `sales`, `service`, `marketing`, `success`, and `custom`; custom requires a role. A set contains 1–5 distinct personas. Images default to enabled and incur provider usage. Set `includeImages: false` for a text-only generation. B2C generates one shared portrait; B2B does not generate an individual portrait. Action images use each persona's recommendations and brief.

An accepted new request returns `202` with `{job, created:true, idempotencyKey}`. Exact replay returns `200` and the same job without starting more paid work. Reusing a key for different normalized input returns `409`. If local workers are full, the persisted job remains queued and includes a start error; explicitly resume it later.

The API uses the editor's text/overlay prompts, image prompt builders, validation, and renderer. Source context is fetched once per job. Each persona gets separate modeled fields, actions, modules, and images while sharing the fictional customer identity. This is generation-semantic parity, not identical interactive UI scheduling or an assertion that modeled data is verified website fact.

## Status and explicit resume

- `GET /integrations/v1/upg/generations/{jobId}` reads durable status. It never launches a provider call.
- `POST /integrations/v1/upg/generations/{jobId}/resume` explicitly continues a queued, failed, or interrupted job from its last saved checkpoint. No input changes are accepted on resume.

Jobs retain `id`, `status`, `phase`, timestamps, normalized `input`, `projectId`, `result`, `error`, `attempts`, and `resumable`. For older clients, completed responses also expose `job.profile.id`. `result.visuals` distinguishes `ready`, `partial`, `failed`, and `not_requested` by persona; a completed project can have missing images. `result.sourceFallback` indicates URL-only context if website retrieval failed.

The existing accounts Postgres database holds jobs and opaque checkpoints. A worker holds only the caller key in memory and renews its 120-second fenced lease every 30 seconds. Each source/text/image stage is checkpointed. A second active worker cannot claim the job; an expired worker cannot checkpoint or save. Project creation and job completion share one accounts transaction, with replay protection after a lost response.

No new background credential is introduced. Process restart therefore does **not** automatically resume paid work. Once a running lease expires, status reports `interrupted`; send an authenticated resume after user confirmation. If a provider finishes/charges just before a process dies and before its checkpoint is durable, that one uncheckpointed call can be repeated on explicit resume. Exactly-once provider billing is not promised. Image-provider failures are recorded as partial visuals; open the completed project in UPG to retry those images.

## Image-bearing saved exports

`GET /integrations/v1/upg/profiles/{profileId}/export?persona=service`

The optional `persona` selects an existing saved view. Without it, the active saved view is used. Its saved account tab, profile fields, recommendation imagery, and shared portrait are preserved. Missing personas return `404`; they are not synthesized from a template. Exports render on demand from authorized saved state, so inline images do not need a second large HTML copy in project storage. Bundled local image assets are embedded when small enough.

The response is a downloaded HTML attachment with a sandbox CSP and `nosniff`. The renderer sanitizes authored rich text; the sandbox is defense in depth. Saved project size remains capped at 20 MB. External image/font URLs may still require connectivity; inline generated imagery does not.

## MCP

Discovery: `GET /.well-known/mcp.json`. Transport: JSON-RPC POST `/mcp`; GET returns `405` because there is no optional server event stream. Pass `X-API-Key` as a header in the MCP client configuration.

- `upg_generate_profile` accepts the same generation fields, including `views`, `includeImages`, and `idempotencyKey`. Ask for confirmation before paid generation.
- `upg_get_generation_status` accepts `{ "jobId": "gen_…" }` and is read-only.
- `upg_resume_generation` accepts the same job ID. Ask for confirmation, explaining the uncheckpointed-call billing boundary above.
- `upg_list_profiles` and `upg_get_profile` read saved projects.
- `upg_get_profile_export` accepts `profileId`, optional `persona`, and optional `includeHtml`. It normally returns a scoped `exportPath` and header-auth instructions. HTML larger than 200,000 characters is omitted even if requested; retrieve the path with `X-API-Key` to obtain the complete image-bearing attachment.

## Deployment and verification

Deploy the additive accounts jobs migration/routes before this UPG version. Existing project/API clients remain supported. Configure `SAASY_ACCOUNTS_URL` for that accounts instance. Existing Gemini settings are reused; no worker secret is required.

Production rollout requires `PUBLIC_ORIGIN`. When `NODE_ENV=production` and it is missing, API integrations, MCP, and discovery return `503 public_origin_required`; the editor and guest AI remain available. Health exposes only configuration booleans, never keys. Local development retains a validated Host/protocol fallback.

Set `PUBLIC_ORIGIN` to the canonical UPG HTTPS origin, especially behind TLS-terminating proxies. `MCP_ALLOWED_ORIGINS` optionally adds exact browser origins. `TRUST_PROXY` accepts explicit ingress IP/CIDR allowlists, not `true` or a hop count. Forwarding headers are ignored by default; guests behind an unconfigured ingress may share an IP quota. Do not trust arbitrary forwarded headers to fix that quota behavior.

Offline regression command:

```sh
node --test test/server-boundary.test.cjs test/server-generation.test.cjs test/server-jobs.test.cjs test/server-safe-fetch.test.cjs
```

These tests use mocked providers/storage and trusted renderer fixtures. They do not establish production connectivity, real Gemini quality/latency, or real browser rendering. Verify those separately with an authorized deployment smoke test.

Generation limits image work to 12 prompts per persona and an 18 MB checkpoint budget (within the 20 MB storage-request cap). Skipped or oversized images are reported as partial/failed visuals, not silently replaced with template pictures.
