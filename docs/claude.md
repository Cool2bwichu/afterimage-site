# AFTERIMAGE, programmed by Claude — 28 September 2026

Base: `claude/upbeat-cray-isi4g0` at `e37b64a` (the Observatory). This is a
separate version of the site: the same interface, with Claude replacing the GPT
companion that develops reels, Atlases and single-film replacements. The GPT
version, its bridge and the published Sites project are untouched.

```text
Browser ──> site server routes ──(bearer secret)──> companion/ ──> Anthropic Messages API
            /api/status, /api/connect,               same contract as     claude-opus-5-5,
            /api/generations, /api/atlas/…,          the subscription     streaming, adaptive
            /api/replacements/…                      bridge               thinking, JSON schema
```

## What changed

- **`companion/`** is a small Node service that answers the subscription bridge's
  private HTTP contract with Claude. The bridge's validators, durable job store and
  coordinator are carried over; the Codex app-server, ChatGPT device sign-in and
  prompt builders are replaced. See `companion/README.md`.
- **Claude's brief.** AFTERIMAGE's editorial rules were rewritten as Claude system
  prompts (reel, Light Table reel, replacement, Atlas). They keep every product
  decision in the GPT prompts:
  - plain language and no invented scenes or quotes;
  - film 1 as the closest synthesis;
  - hard exclusions for references, Likes and "not interested";
  - the Light Table channel meanings and selected-source provenance;
  - the Atlas lens calibration;
  - the bounded influence of Likes.

  The request's data is sent in tags and treated as data.
- **Structured output.** Every answer is constrained by the contract's JSON schema
  and then validated exactly as before. An answer that breaks a rule gets one more
  attempt, with the reason. If the API rejects a request's shape (the schema or
  the fallback beta), that call is retried once without those optional features,
  with the schema stated in the prompt instead. Nothing else is retried by the
  companion; the SDK handles ordinary transient retries.
- **Connection.** Claude runs on the companion's Anthropic API key, so the ChatGPT
  device-code flow is gone. The connection panel reads *Connect Claude* and its
  *Check connection* button asks the companion to verify the key against the
  Models API. It reports a missing or rejected key plainly; nothing is disguised
  as success.
- **Identity.** The footer names the companion's model ("reasoned live by Claude
  Opus 5.5"). The charting room reads "Claude is charting your next
  constellation". The exported star chart is marked "charted by Claude" and the
  web manifest says the instrument is programmed by Claude.

No browser storage key, request shape, job shape or route changed. Saved reels,
Atlases, Likes, the watchlist and afterimages carry over between the two versions.

## Model settings

Claude Opus 5.5 at `high` effort with adaptive thinking. It streams up to 64,000
output tokens, and the system prompt is marked for prompt caching. Server-side
refusal fallbacks (`fallbacks: "default"`) are on by default; set
`AFTERIMAGE_CLAUDE_FALLBACKS=off` to disable them. Model and effort are
configuration (`AFTERIMAGE_CLAUDE_MODEL`, `AFTERIMAGE_CLAUDE_EFFORT`). Operations
are bounded: 5 minutes for a reel, 4 for a replacement and 7 for an Atlas.

## Validation

- Companion: 78 tests, all offline. They cover the bridge's carried-over contract
  suites, the engine against a scripted client, the HTTP routes and job
  lifecycle, and the site's own job parser applied to the companion's output.
- Site: 125 tests, including three for the Claude identity and connection copy.
  TypeScript, lint and the production build pass.
- End to end in Chromium, with the companion on the real Anthropic SDK pointed at
  a local stand-in for the Messages and Models APIs that streams SSE as the API
  does:
  - the footer names Claude Opus 5.5;
  - the charting room credits Claude;
  - a refresh mid-reel resumes the same job;
  - the reel, a single-film replacement and an Atlas all complete;
  - a rejected or missing key shows *Connect Claude* with the exact reason;
  - no page errors at 1440×900 or 390×844.

  The captured requests confirmed that the SDK sent the beta Messages route with
  `server-side-fallback-2026-07-01`, `claude-opus-5-5`, streaming, adaptive
  thinking, `high` effort, a JSON schema and a cached system prompt.

## Not verified

No live Claude request was made: this environment has no Anthropic credentials.
Recommendation quality, latency and cost with the real model are therefore
unmeasured. The first live reel, Atlas and replacement should be checked before
this version is shared. The companion logs token counts per call to make cost
visible.

## Run and deploy

Local: install `companion/` (`npm --prefix companion ci`), put `ANTHROPIC_API_KEY`,
`AFTERIMAGE_BRIDGE_URL=http://localhost:8788`, `AFTERIMAGE_BRIDGE_SECRET` and
`AFTERIMAGE_FILM_METADATA_URL=http://localhost:3000/api/films/enrich` in
`.env.local`, then run `npm run companion` and `npm run dev`.

Hosted: deploy `companion/` (Dockerfile) as its own always-on service with
persistent job storage. Give this version of the site its own hosting
environment pointing `AFTERIMAGE_BRIDGE_URL` at it. Publishing is a separate,
explicit step. It should not reuse the production Sites project, which keeps
serving the GPT version.
