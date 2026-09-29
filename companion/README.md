# AFTERIMAGE Claude companion

The private service that programs AFTERIMAGE with Claude. It answers the same
authenticated HTTP contract as `afterimage-subscription-bridge`, so the site's
server routes (`/api/status`, `/api/connect`, `/api/generations`,
`/api/atlas/generations`, `/api/replacements/generations`) talk to it unchanged.

It reaches Claude in one of two ways:

- **`subscription` (default):** runs Claude Code, signed in with your Claude Pro
  or Max plan, the way the subscription bridge runs Codex with a ChatGPT
  sign-in. Reels count against your plan's usage limits. There is no API key and
  no per-token bill.
- **`api`:** calls the Anthropic Messages API with an API key, billed per token.

## Use your Claude subscription

1. Install Claude Code on your computer (`npm install -g @anthropic-ai/claude-code`
   or the installer at code.claude.com).
2. Run `claude setup-token` and approve it in the browser. It prints a token that
   is valid for one year and draws on your subscription.
3. Give the companion that token as `CLAUDE_CODE_OAUTH_TOKEN`, in `.env.local`
   locally or in the host's secret store.
4. Renew it with `claude setup-token` once a year, or sooner if you revoke it.

Keep this for yourself. Anthropic's docs describe `setup-token` for your own
scripts and automation. They also say that, unless Anthropic has approved it,
third-party products may not offer claude.ai login or subscription limits to
their users. A private AFTERIMAGE that only you use fits the first case. If
other people will use the site, switch to `AFTERIMAGE_CLAUDE_AUTH=api` with an
Anthropic API key.

## Run it locally

```sh
npm --prefix companion ci
# In the site's .env.local (see ../.env.example):
#   CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY with AFTERIMAGE_CLAUDE_AUTH=api),
#   AFTERIMAGE_BRIDGE_URL=http://localhost:8788, AFTERIMAGE_BRIDGE_SECRET,
#   AFTERIMAGE_FILM_METADATA_URL=http://localhost:3000/api/films/enrich
npm run companion        # starts the companion on port 8788 with ../.env.local
npm run dev              # starts the site; it reaches the companion server-side
```

Subscription mode needs the `claude` command on the companion's `PATH`, or
`CLAUDE_BIN` pointing at it. `GET /health` is public. Everything else requires
`Authorization: Bearer $AFTERIMAGE_BRIDGE_SECRET`. The browser never sees the
secret, the token or a key.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AFTERIMAGE_CLAUDE_AUTH` | `subscription`, or `api` when only `ANTHROPIC_API_KEY` is set | How Claude is reached. |
| `CLAUDE_CODE_OAUTH_TOKEN` | none | Subscription token from `claude setup-token`. |
| `ANTHROPIC_API_KEY` | none | API key for `api` mode. It is never passed to Claude Code, where it would override the subscription. |
| `CLAUDE_BIN` | `claude` | The Claude Code executable. |
| `AFTERIMAGE_CLAUDE_WORKDIR` | a temporary folder | Claude Code's empty working and configuration folder. |
| `AFTERIMAGE_BRIDGE_SECRET` | `afterimage-local-development` outside production | Shared with the site. At least 24 characters in production. |
| `AFTERIMAGE_FILM_METADATA_URL` | none | The site's `/api/films/enrich`. Needed to verify Atlas and replacement films; HTTPS, or HTTP to `localhost`. |
| `AFTERIMAGE_JOB_DIR` | `companion/data/generation-jobs` | Durable job files. Required in production; mount persistent storage. |
| `AFTERIMAGE_CLAUDE_MODEL` | `claude-opus-5-5` | Any current Claude model ID your account can use. |
| `AFTERIMAGE_CLAUDE_EFFORT` | `high` | `low`, `medium`, `high`, `xhigh` or `max`. |
| `AFTERIMAGE_CLAUDE_FALLBACKS` | `default` | API mode only: `off` disables server-side refusal fallbacks. |
| `PORT` | `8788` | Listening port. |

## How a reel is made

1. The request is validated with the bridge's contract (films, written guidance,
   exclusions, Likes, Light Table selections) before anything is spent.
2. One Claude request per reel, Atlas or replacement:
   - AFTERIMAGE's editorial brief is the system prompt.
   - The request's data follows in tags and is treated as data, never instructions.
   - Adaptive thinking at the configured effort.
   - Structured output from the contract's JSON schema. Length, pattern and count
     limits are written into the field descriptions and checked afterwards.
3. **Subscription mode:** the request goes to Claude Code (`claude -p`) with the
   brief as the entire system prompt and the data on stdin.
   - The structured output uses `--json-schema`.
   - It runs with `--tools ""`, so its only tool is the structured-output one,
     plus `--setting-sources ""`, `--strict-mcp-config` and
     `--no-session-persistence`.
   - It gets an empty working folder and its own configuration folder.
   - Its environment contains only the subscription token, `PATH`, `HOME`,
     locale and proxy settings.
4. **API mode:** one streaming Messages call.
   - The system prompt is cached.
   - Server-side refusal fallbacks are on.
   - If the API rejects the request's shape, that call is retried once without
     the optional features, with the schema stated in the prompt instead.
5. The answer passes the same validators as the GPT bridge: exactly five films,
   none of them a reference, liked or excluded film. Light Table facets, Atlas
   lenses and catalogue identities are checked too. An answer that breaks a rule
   gets one more attempt, with the reason attached.
6. Jobs are stored durably, so a refresh resumes the reel. A failed job carries
   only a prepared explanation, never a raw error:
   - `AUTH_REQUIRED`
   - `CLAUDE_USAGE_LIMIT`
   - `CLAUDE_PLAN_UNAVAILABLE`
   - `CLAUDE_MODEL_UNAVAILABLE`
   - `CLAUDE_UNAVAILABLE`
   - `CLAUDE_TIMEOUT`
   - `CLAUDE_DECLINED`
   - `CLAUDE_CODE_MISSING`
   - `METADATA_NOT_CONFIGURED`
   - `GENERATION_FAILED`

   Subscription mode classifies failures with Claude Code's own typed error
   categories. If Claude rejects the token, the site shows *Connect Claude*
   until the companion restarts with a new one.

Each call logs one JSON line with token counts, never request content. In
subscription mode it includes Claude Code's cost estimate, which is what the
same work would cost on the API, not a charge.

## Deploy

`Dockerfile` builds a Node 22 image with Claude Code pinned to 2.1.284, the
version the companion was verified against. Run it as an always-on service
with:

- persistent storage mounted at `/data/afterimage-generation-jobs`;
- TLS at the edge;
- `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) and
  `AFTERIMAGE_BRIDGE_SECRET` in the host's secret store.

Point the Claude version of the site at it with `AFTERIMAGE_BRIDGE_URL` and the
same `AFTERIMAGE_BRIDGE_SECRET`.

## Tests

`npm test` runs without network access or credentials:

- The bridge's contract suites, carried over.
- The engine against a scripted API client.
- The Claude Code runner against a stand-in `claude` executable that records its
  arguments, environment and input.
- The HTTP routes and job lifecycle.
- A contract test that parses the companion's jobs with the site's own
  `generation-state.ts`.

## Provenance

`lib/v2-contract.mjs`, `taste-profile.mjs`, `atlas-contract.mjs`,
`replacement-contract.mjs`, `film-metadata.mjs`, `job-store.mjs` and
`generation-coordinator.mjs` come from
`Cool2bwichu/afterimage-subscription-bridge` at `9d2de51`
(`codex/current-model-profiles`). The changes are:

- The Codex prompt builders were removed; `prompts.mjs` replaces them.
- Local HTTP metadata URLs are accepted.
- There are Claude-specific failure explanations.
- The coordinator passes those explanations through.
