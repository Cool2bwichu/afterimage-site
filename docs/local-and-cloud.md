# Working locally and in Codex Cloud

The same AFTERIMAGE website can be developed on the Mac or in Codex Cloud.
GitHub carries the committed changes between the two. The Mac does not need to
be running for a cloud task.

## Repositories and environments

- Website: `https://github.com/Cool2bwichu/afterimage-site` (private).
- Cloud environment: [Afterimage Website](https://chatgpt.com/codex/cloud/settings/environment/6a9f9048d1dc81918cd3e5a607685eae).
- Local checkout: the `site` folder containing this file's repository.
- The backend is a separate repository and cloud environment, **Afterimage Bridge**.
- Production remains on the existing OpenAI Sites project.

`origin` points to GitHub in both the Mac and cloud checkouts. The existing Mac
checkout also retains `sites`, the original Sites source repository used by the
publishing workflow. Always inspect `git remote -v` before pushing.

## Move work between devices

1. Before leaving the Mac, commit the intended changes and push the working
   branch to `origin`. Uncommitted edits stay on the Mac.
2. On the phone, open Codex Cloud in the browser, choose **Afterimage Website**,
   and select the relevant branch. Ask for the desired changes and review the
   result. Save the changes to GitHub using the task's branch/PR controls.
3. Back on the Mac, check for local edits first. Fetch `origin` and check out
   the cloud branch, or pull `main` after its pull request has been merged.
   Resolve divergent work deliberately; do not overwrite local files.

For a clean local `main`, after a GitHub PR is merged:

```sh
git fetch origin
git pull --ff-only origin main
```

For a local branch that should be available to cloud work:

```sh
git push -u origin HEAD
```

## Runtime and validation

Use Node.js 22.13+ and `npm ci`. Run `npm run dev -- --host 0.0.0.0` for the
development server. The cloud environment installs the locked dependencies.
`npm test`, `npm run lint`, and `npm run build` provide validation without
production credentials.

Live recommendations require `AFTERIMAGE_BRIDGE_URL` and
`AFTERIMAGE_BRIDGE_SECRET`; film metadata/search may require TMDB configuration.
The cloud development environment does not automatically inherit the Mac's
ignored `.env.local` or the production host's secrets. Configure an appropriate
development connection separately when live service testing is needed.

## Publishing

Committing, pushing, or merging on GitHub does not publish the website.
Integrate and validate the chosen changes, then explicitly request a Sites
release. Keep the existing `.openai/hosting.json` and Sites source connection.

## Setup verification

On September 8, 2026, the cloud setup test cloned this repository and installed
647 packages with Node.js 22.22.2. In that cloud container, all 73 tests passed
and `npm run build` completed successfully. Production service credentials were
not configured or exercised by this check.
