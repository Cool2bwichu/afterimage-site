# AFTERIMAGE website

This repository is the production website source. The companion backend lives
in `Cool2bwichu/afterimage-subscription-bridge`; do not substitute its prototype
frontend for this site.

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
