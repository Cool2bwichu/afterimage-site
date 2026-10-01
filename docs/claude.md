# AFTERIMAGE, programmed by Claude — 28 September 2026

Base: `claude/upbeat-cray-isi4g0` at `e37b64a` (the Observatory). This is a
separate version of the site: the same interface, with Claude replacing the GPT
companion that develops reels, Atlases and single-film replacements. The GPT
version, its bridge and the published Sites project are untouched.

```text
Browser ──> site server routes ──(bearer secret)──> companion/ ──┬─> Claude Code (`claude -p`) on your Claude plan   [subscription, default]
            /api/status, /api/connect,               same contract │     CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`
            /api/generations, /api/atlas/…,          as the        └─> Anthropic Messages API with an API key          [api]
            /api/replacements/…                      subscription bridge
```

## What changed

- **`companion/`** is a small Node service that answers the subscription bridge's
  private HTTP contract with Claude. The bridge's validators, durable job store and
  coordinator are carried over; the Codex app-server, ChatGPT device sign-in and
  prompt builders are replaced. See `companion/README.md`.
- **Your Claude subscription, like the GPT version's ChatGPT one.** By default
  the companion runs Claude Code in non-interactive mode, signed in with a
  one-year token from `claude setup-token`. Reels draw on your Pro or Max plan's
  usage limits, with no API key and no per-token bill.
  - Claude Code runs with no tools apart from structured output, and no
    settings, MCP servers or memory.
  - It works in an empty folder, and only the token reaches its environment.
  - An Anthropic API key remains an alternative (`AFTERIMAGE_CLAUDE_AUTH=api`).

  Keep the subscription mode for a site only you use. Anthropic documents the
  token for your own scripts; products for other people need an API key.
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
- **Connection.** Claude runs on the companion's own credential, so the ChatGPT
  device-code flow is gone. The connection panel reads *Connect Claude*. Its
  *Check connection* button asks the companion, which says plainly what is
  wrong, inside the panel:
  - a missing token (with the `claude setup-token` steps);
  - a token Claude rejected;
  - Claude Code not being installed;
  - or, in API mode, a missing or rejected key.

  Nothing is disguised as success. Checking the subscription connection doesn't
  spend any allowance. A token Claude refuses is reported from the first reel
  that tries it.
- **Identity.** The footer names the companion's model ("reasoned live by Claude
  Opus 5.5"). The charting room reads "Claude is charting your next
  constellation". The exported star chart is marked "charted by Claude" and the
  web manifest says the instrument is programmed by Claude.

No browser storage key, request shape, job shape or route changed. Saved reels,
Atlases, Likes, the watchlist and afterimages carry over between the two versions.

## GitHub Pages

This version can also run as a static site on GitHub Pages, with the companion
on Railway. The setup steps are in [github-pages.md](github-pages.md).

```text
cool2bwichu.github.io/afterimage-site/ ──(passphrase)──> companion on Railway ──> Claude Code on your plan
static page, no secrets                                 /api/* browser routes  └─> TMDB
```

- **`github-pages/` and `vite.pages.config.ts`** build the same interface as a
  single static page. The companion's address is compiled in and checked:
  HTTPS, with no path. The page, icons and web manifest sit under
  `/afterimage-site/`.
- **Every private call goes through `app/lib/api.ts`.** In the normal site it
  calls the site's own `/api/…` routes, unchanged. In the Pages build it calls
  the companion with the passphrase instead.
- **The companion answers the site's `/api/*` routes directly** (status, reels,
  Atlases, replacements, job polling, film search and details). It reuses the
  site's own TMDB code and verifies Atlas and replacement films in-process.
  - It accepts a call only with the passphrase, and only from the allowed
    origin.
  - It throttles wrong attempts.
  - In production it refuses to start with a passphrase shorter than 16
    characters, or with no allowed origin.
- **Unlocking:** when the companion asks for the passphrase, the connection
  panel reads *Unlock AFTERIMAGE* and has a passphrase field.
  - A wrong passphrase is refused plainly and not kept.
  - The right one is kept in that browser (`afterimage:companion-passphrase:v1`),
    so the site stays unlocked after a refresh.
- **Deploy files:**
  - `.github/workflows/github-pages.yml` tests, builds and publishes on pushes
    to `claude/observatory-claude`. It builds with the companion's Railway
    address, which the repository variable `AFTERIMAGE_COMPANION_URL` can
    replace.
  - `railway.json` builds `companion/Dockerfile` from the repository root.
    Only changes to `companion/`, `app/lib/`, `railway.json` or
    `.dockerignore` redeploy it.

A Pages site is public even from a private repository. The passphrase is what
keeps Claude, your plan's allowance and TMDB for you.

## Model settings

Claude Opus 5.5 at `high` effort with adaptive thinking, in both modes. Model
and effort are configuration (`AFTERIMAGE_CLAUDE_MODEL`,
`AFTERIMAGE_CLAUDE_EFFORT`); use a model your plan includes. Operations are
bounded: 5 minutes for a reel, 4 for a replacement and 7 for an Atlas.

API mode also:

- streams up to 64,000 output tokens;
- marks the system prompt for caching;
- turns on server-side refusal fallbacks (`fallbacks: "default"`), which
  `AFTERIMAGE_CLAUDE_FALLBACKS=off` disables.

Subscription mode adds its own failure explanations: a usage limit reached, a
plan that can't be used, and a model the plan doesn't include.

## Validation

- Companion: 95 tests, all offline. They cover:
  - the bridge's carried-over contract suites;
  - the engine against a scripted API client;
  - the Claude Code runner against a stand-in `claude` executable, checking its
    arguments, environment isolation, stdin, typed failures, the rejected-token
    state and the deadline;
  - the HTTP routes and job lifecycle;
  - the browser routes' passphrase, origins, throttle, start-up checks and film
    search;
  - the site's own job parser applied to the companion's output.
- Site: 129 tests, including the Claude identity and connection copy and the
  Pages API client. TypeScript, lint, the production build and the Pages build
  pass.
- The real Claude Code 2.1.284 binary, run through the companion against a local
  stand-in API:
  - It accepted every flag and signed in with the subscription token as a bearer
    token. An `ANTHROPIC_API_KEY` in the companion's environment was not passed on.
  - It requested `claude-opus-5-5` with adaptive thinking at `high` effort.
  - It offered only the `StructuredOutput` tool and made one model request per
    operation.
  - A rejected token and a hit usage limit came back as `AUTH_REQUIRED` and
    `CLAUDE_USAGE_LIMIT`.
- End to end in Chromium, in subscription mode (real Claude Code) and in API mode
  (real Anthropic SDK), each against the stand-in:
  - the footer names Claude Opus 5.5;
  - the charting room credits Claude;
  - a refresh mid-reel resumes the same job;
  - the reel, a single-film replacement and an Atlas all complete;
  - a missing token, a token rejected during a reel, and a rejected or missing
    API key each show *Connect Claude* with the exact reason in the panel;
  - no page errors at 1440×900 or 390×844.

  The captured requests confirmed that the SDK sent the beta Messages route with
  `server-side-fallback-2026-07-01`, `claude-opus-5-5`, streaming, adaptive
  thinking, `high` effort, a JSON schema and a cached system prompt.
- The GitHub Pages build, end to end in Chromium, against the companion running
  real Claude Code on the stand-in:
  - it asks to be unlocked, refuses a wrong passphrase and accepts the right one;
  - it stays unlocked after a refresh;
  - the reel, a replacement, an Atlas and film search complete, and every
    private call goes to the companion;
  - the phone layout fits, with no page errors.
- The companion's Docker image, built and run in production mode, developed a
  complete reel through the Claude Code inside it.
  - This environment blocks Debian's package mirror, so the test build copied
    in a CA bundle in place of the `ca-certificates` install.
  - Railway builds the Dockerfile unchanged.

## Not verified

No live Claude request was made: this environment has neither your subscription
token nor an API key. Recommendation quality, latency and how much of the plan's
allowance a reel uses are therefore unmeasured. Check the first live reel, Atlas
and replacement before relying on it. The companion logs token counts per call,
and in subscription mode Claude Code's API-price estimate, to make usage
visible. No live Railway or GitHub Pages deploy was made from here.

## Run and deploy

Local:

1. Install Claude Code and run `claude setup-token`.
2. Install `companion/` with `npm --prefix companion ci`.
3. Put these in `.env.local`:
   - `CLAUDE_CODE_OAUTH_TOKEN`
   - `AFTERIMAGE_BRIDGE_URL=http://localhost:8788`
   - `AFTERIMAGE_BRIDGE_SECRET`
   - `AFTERIMAGE_FILM_METADATA_URL=http://localhost:3000/api/films/enrich`
4. Run `npm run companion` and `npm run dev`.

Hosted on GitHub Pages with the companion on Railway: follow
[github-pages.md](github-pages.md).

Hosted elsewhere:

- Deploy `companion/` (the Dockerfile installs Claude Code 2.1.284) as its own
  always-on service, with persistent job storage and `CLAUDE_CODE_OAUTH_TOKEN`
  in the host's secret store. Renew the token yearly.
- Give this version of the site its own hosting environment, with
  `AFTERIMAGE_BRIDGE_URL` pointing at the companion.

Publishing is a separate, explicit step. It should not reuse the production
Sites project, which keeps serving the GPT version.
