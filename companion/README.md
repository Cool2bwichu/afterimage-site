# AFTERIMAGE Claude companion

The private service that programs AFTERIMAGE with Claude. It answers the same
authenticated HTTP contract as `afterimage-subscription-bridge`, so the site's
server routes (`/api/status`, `/api/connect`, `/api/generations`,
`/api/atlas/generations`, `/api/replacements/generations`) talk to it unchanged.
Where the bridge drives OpenAI's Codex app-server with a ChatGPT sign-in, the
companion calls the Anthropic Messages API with an API key.

## Run it locally

```sh
cd companion
npm ci
cd ..
# In the site's .env.local (see ../.env.example):
#   ANTHROPIC_API_KEY, AFTERIMAGE_BRIDGE_URL=http://localhost:8788,
#   AFTERIMAGE_BRIDGE_SECRET, AFTERIMAGE_FILM_METADATA_URL
npm run companion        # starts the companion on port 8788 with ../.env.local
npm run dev              # starts the site; it reaches the companion server-side
```

`GET /health` is public. Everything else requires
`Authorization: Bearer $AFTERIMAGE_BRIDGE_SECRET`; the browser never sees the
secret or the Anthropic key.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Claude credentials. Without it, status reports Claude as not connected. |
| `AFTERIMAGE_BRIDGE_SECRET` | `afterimage-local-development` outside production | Shared with the site. At least 24 characters in production. |
| `AFTERIMAGE_FILM_METADATA_URL` | none | The site's `/api/films/enrich`. Needed to verify Atlas and replacement films; HTTPS, or HTTP to `localhost`. |
| `AFTERIMAGE_JOB_DIR` | `companion/data/generation-jobs` | Durable job files. Required in production; mount persistent storage. |
| `AFTERIMAGE_CLAUDE_MODEL` | `claude-opus-5-5` | Any current Claude model ID. |
| `AFTERIMAGE_CLAUDE_EFFORT` | `high` | `low`, `medium`, `high`, `xhigh` or `max`. |
| `AFTERIMAGE_CLAUDE_FALLBACKS` | `default` | `off` disables server-side refusal fallbacks. |
| `PORT` | `8788` | Listening port. |

## How a reel is made

1. The request is validated with the bridge's contract (films, written guidance,
   exclusions, Likes, Light Table selections) before anything is spent.
2. One streaming Messages call per reel, Atlas or replacement:
   - AFTERIMAGE's editorial brief is the cached system prompt.
   - The request's data follows in tags and is treated as data, never instructions.
   - Adaptive thinking at the configured effort.
   - Structured output from the contract's JSON schema. Length, pattern and count
     limits the output grammar cannot enforce are written into the field
     descriptions and checked afterwards.
3. The answer passes the same validators as the GPT bridge: exactly five films,
   none of them a reference, liked or excluded film. Light Table facets, Atlas
   lenses and catalogue identities are checked too. An answer that breaks a rule
   gets one more attempt, with the reason attached. Service, credential and
   catalogue failures do not. If the API ever rejects the request's shape (the
   schema or the fallback beta), that call is retried once without those
   optional features, with the schema stated in the prompt instead.
4. Jobs are stored durably, so a refresh resumes the reel. A failed job carries
   only a prepared explanation (`AUTH_REQUIRED`, `CLAUDE_UNAVAILABLE`,
   `CLAUDE_TIMEOUT`, `CLAUDE_DECLINED`, `METADATA_NOT_CONFIGURED`,
   `GENERATION_FAILED`), never a raw error.

Each call logs one JSON line with token counts, so you can see what a reel
costs. Request content is never logged.

## Deploy

`Dockerfile` builds a small Node 22 image with no Codex binary and no browser
sign-in. Run it as an always-on service with persistent storage mounted at
`/data/afterimage-generation-jobs`, TLS at the edge and the variables above in
the host's secret store. Point the Claude version of the site at it with
`AFTERIMAGE_BRIDGE_URL` and the same `AFTERIMAGE_BRIDGE_SECRET`.

## Tests

`npm test` runs 78 tests without network access or credentials:

- The bridge's contract suites, carried over.
- The Claude engine against a scripted client: request shape, retries,
  refusals, fallbacks, errors, deadlines and status.
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
