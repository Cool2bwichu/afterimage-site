# AFTERIMAGE website

This repository is the production website source. The companion backend lives
in `Cool2bwichu/afterimage-subscription-bridge`; do not substitute its prototype
frontend for this site.

`main` combines the Observatory interface and encounters from Claude with the
ChatGPT subscription bridge. Preserve ChatGPT device sign-in, GPT-6.1 Sol at medium
effort (explicitly selected on 2026-10-01),
the existing Sites project, and saved reel/Atlas compatibility. `companion/` and
the static Claude editions are optional; do not switch production to them.

On the Claude branches, `companion/` is the Claude-backed replacement for that
bridge. It answers the same contract; run its tests with `npm run test:companion`
and keep `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` out of the repository.
The same branches can build a static GitHub Pages site (`npm run build:pages`)
whose private calls go to the companion behind a passphrase; see
`docs/github-pages.md`, and keep the passphrase out of the repository too.
`npm run build:artifact` builds the claude.ai Artifact edition, which asks
Claude inside the page instead of through the companion (see `docs/claude.md`).
`claude/observatory-claude` is also an experimental route for the interface
(one question, the Eye Test, developing reels, collisions, film verbs); see
`docs/encounters.md` before changing those experiences.

## Development

- Use Node.js 22.13 or newer and `npm ci`.
- Start the website with `npm run dev -- --host 0.0.0.0`.
- Validate behavior changes with the relevant tests in `tests/`; use `npm test`,
  `npm run lint`, and `npm run build` for broader changes or release checks.
- Preserve the established Atlas, Light Table, Likes, film search, and mobile
  interactions. Inspect the affected interface for visual changes.
- Live recommendation requests need the private bridge configuration. Missing
  credentials must not be disguised with mock success. Unit tests and builds
  should work without production secrets.

## Local and cloud continuity

- GitHub `Cool2bwichu/afterimage-site` is the shared development repository.
  Cloud work uses its own checkout; local uncommitted files are not synced.
- Work on a branch for cloud changes and return a reviewable diff or pull
  request. Commit and push local work before continuing it in the cloud.
- Before changing local files, inspect Git status and fetch the GitHub remote.
  Preserve uncommitted work; never force-push or reset it to synchronize.
- See `docs/local-and-cloud.md` for the two-remote workflow.

## Publishing and secrets

- Preserve `.openai/hosting.json` and the existing OpenAI Sites project.
- GitHub pushes are development synchronization, not a Sites deployment.
  Publish only when requested, using the Sites workflow and applicable approval
  requirements. Cloud changes should be reviewed and integrated before release.
- Do not commit `.env.local`, bridge secrets, TMDB credentials, or authentication
  files. Keep production configuration in the existing hosting secret stores.
