# Observatory with the ChatGPT companion

Integrated on 1 October 2026 into `feat/screening-room` from the latest
`claude/observatory-claude` commit, `34d418b9556fbf403d898c93891e6bd8166162f3`.
The original ChatGPT checkpoint is `e74c920c622176a0a9a3a6dc54fbe45b05b5ea63`,
also retained as `checkpoint/chatgpt-before-observatory-20261001`.

The imported experience includes the living night sky, landing orrery,
reel constellation and image export, charting room and opt-in ready notification,
Your sky with map/list views, and after-watch journal. Existing Atlas, reels,
film search, Light Table, comparison, replacement, Likes, saved films, and
collection navigation remain available. See `observatory.md` for their visual
grammar and the meaning of the map.

## Companion boundary

The Sites build uses same-origin `/api` routes. Those routes still proxy to the
existing ChatGPT subscription bridge using server-only URL/secret values.
No backend request contracts or model settings are changed by this integration.
On 2026-10-01 the user selected GPT-6.1 Sol at medium effort for reels and Atlases.
The ChatGPT companion remains on V2; its live status reports the actual model.
Model credit comes from the companion's status, never from a guessed model.
ChatGPT's device code and secure sign-in link are shown when reconnection is
needed; the page checks status until the sign-in completes.

Claude's companion, Pages and Artifact build tools are retained as optional
editions. Remote/Artifact editions default to Claude; a valid companion model
status supplies the actual provider and readable model name. Exported star
charts and developing copy credit AFTERIMAGE so they remain accurate across
editions. The Claude branch and its deployment are untouched.

## Persistence and release

The current reel, reel archive, Atlas trail, artwork cache, Likes, watchlist,
journal and sky registry keep their established keys and parsers. The journal
is local, never submitted for recommendations; only an explicit Like affects
taste input. The sky reads the existing collections without replacing them.

Publish to the existing Sites project and preserve its current audience and
runtime secrets. GitHub synchronization alone does not publish the site.

## Validation

- 133 site tests and TypeScript pass; lint has no errors and 11 existing image warnings.
- A real Terra Medium/V2 reel completed through the updated site and resumed after
  reload. Its five-film constellation supports arrow-key selection; the exported
  1080 × 1350 PNG was inspected.
- Desktop 1440 × 900 and mobile 390 × 844 checks covered the landing orrery,
  sky map/list, keyboard selection, pause/reduced motion, and saved Atlas reload.
  A saved Atlas retained its Feels lens and selected Still Life connection.
- A journal entry persisted after reload with Like unchecked. Existing reel,
  Atlas, watchlist and Like fixtures appeared in the sky without replacing them.
- An isolated local response check displayed the ChatGPT device code and secure
  sign-in link, then reconnected automatically when real status resumed. The real
  account was never signed out. Production browser collections were untouched.
- All 106 optional Claude companion tests pass, including a corrected macOS
  temporary-path assertion. No Claude service or credentials were changed.

Local metadata configuration has no TMDB credential, so the real new reel used
the designed artwork fallback; existing verified artwork fixtures were used for
visual compatibility checks. Site production metadata secrets are unchanged.
