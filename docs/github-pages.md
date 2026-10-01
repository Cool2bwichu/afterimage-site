# AFTERIMAGE on GitHub Pages, with the Claude companion on Railway

The Claude version of AFTERIMAGE can run as a static site on GitHub Pages. GitHub
Pages serves files only; it has no server. So the Claude companion takes over
the server's work and runs as a small always-on service on Railway, as the GPT
bridge does.

```text
https://cool2bwichu.github.io/afterimage-site/          (static page, no secrets)
        │  every private call, with your passphrase
        ▼
Claude companion on Railway ──> Claude Code on your Claude plan (CLAUDE_CODE_OAUTH_TOKEN)
  /api/status, /api/generations,  └─> TMDB for film search and details (TMDB_READ_TOKEN)
  /api/films/search, …
```

- **The page holds no secrets.** It is compiled with the companion's public
  address only.
- **The companion holds everything private:**
  - your Claude token;
  - the TMDB token;
  - the passphrase.
- **The passphrase unlocks the companion.** The first time you develop a reel
  on a device, the site shows *Unlock AFTERIMAGE*. After you enter the
  passphrase, it is kept in that browser.
- **The companion answers only these requests:**
  - browser requests from your Pages address (`AFTERIMAGE_ALLOWED_ORIGINS`);
  - requests carrying the passphrase.

  After 10 wrong passphrases from one address within 10 minutes, it refuses
  that address until those attempts are 10 minutes old.

A GitHub Pages site is public, even when the repository is private. Anyone
with the link can load the page, but without the passphrase the companion
refuses every reel, Atlas and film search. Saved reels, Likes and afterimages
stay in each browser, as they do on the other version.

## 1. Create your Claude token (on your own computer)

1. Install Claude Code (`npm install -g @anthropic-ai/claude-code`, or the
   installer at code.claude.com).
2. Run `claude setup-token` and approve it in the browser. It prints a token
   that starts with `sk-ant-oat01-`, is valid for a year and draws on your Pro
   or Max plan.

Keep the token private. You will paste it into Railway only.

## 2. Deploy the companion on Railway

1. In Railway, create a project from the GitHub repository
   `Cool2bwichu/afterimage-site`.
2. In the service's settings, set the source branch to
   `claude/observatory-claude`. Railway reads `railway.json` at the repository
   root, which builds `companion/Dockerfile` and checks `/health`.
3. Attach a volume to the service, mounted at `/data`. Jobs are kept there, so
   a redeploy doesn't lose a reel in progress. The companion runs without one,
   but a reel that is developing during a redeploy is then lost.
4. Add these service variables:

   | Variable | Value |
   | --- | --- |
   | `CLAUDE_CODE_OAUTH_TOKEN` | The token from step 1. |
   | `AFTERIMAGE_SITE_PASSPHRASE` | A passphrase of your choice, at least 16 characters. A few unrelated words work well. |
   | `TMDB_READ_TOKEN` | Your TMDB credential from themoviedb.org under *Settings → API*: either the API Read Access Token or the shorter v3 API key. |

   The image already sets:
   - `NODE_ENV=production`;
   - the job folder;
   - `AFTERIMAGE_ALLOWED_ORIGINS=https://cool2bwichu.github.io`. Set that
     variable yourself only if the site moves to another address.

   Railway supplies `PORT`.
5. Under *Networking*, generate a public domain. Open
   `https://<that-domain>/health`. It should answer
   `{"ok":true,"service":"afterimage-claude-companion"}`.

The companion refuses to start in production if the passphrase is shorter than
16 characters, or if no allowed origin is set. The deploy logs say which.

## 3. Publish the site on GitHub Pages

GitHub Pages for a private repository needs a paid GitHub plan (Pro, Team or
Enterprise). On GitHub Free, make the repository public first, or keep the
site on another host.

1. Go to **Settings → Pages**. Under *Build and deployment*, set *Source* to
   **GitHub Actions**.
2. Go to **Settings → Environments → github-pages**. Under *Deployment
   branches and tags*, add `claude/observatory-claude`. By default, only the
   default branch may deploy.
3. The workflow already names the companion's address,
   `https://companion-production-2341.up.railway.app`. If the companion moves,
   go to **Settings → Secrets and variables → Actions → Variables** and add a
   repository variable named `AFTERIMAGE_COMPANION_URL`, set to the new
   address. Use no path and no trailing slash. It is an address, not a secret.
4. Start the deploy. Every push to `claude/observatory-claude` runs the
   *GitHub Pages (Claude version)* workflow. To deploy without a new push, open
   the latest run of that workflow in the *Actions* tab and choose **Re-run all
   jobs**. The workflow:
   1. runs the site and companion tests;
   2. builds the static page with the companion's address;
   3. publishes the page.
5. Open `https://cool2bwichu.github.io/afterimage-site/`, choose *Find my next
   film*, and enter the passphrase.

The workflow isn't on `main`, so GitHub doesn't show a *Run workflow* button
for it. Pushes and re-runs start it instead.

## Changing things later

- **New Claude token** (yearly, or after revoking one): replace
  `CLAUDE_CODE_OAUTH_TOKEN` in Railway. Railway redeploys the service.
- **New passphrase:** replace `AFTERIMAGE_SITE_PASSPHRASE` in Railway. Each
  device then asks for the new one.
- **New companion address:** set the repository variable
  `AFTERIMAGE_COMPANION_URL`, then re-run the workflow.
- **Custom domain for the site:** set it in *Settings → Pages*, then change
  `AFTERIMAGE_ALLOWED_ORIGINS` to that origin. The workflow picks up the new
  base path by itself.

## Try the Pages build locally

```sh
npm --prefix companion ci
# Terminal 1: the companion, with the passphrase and TMDB token from .env.local
AFTERIMAGE_SITE_PASSPHRASE=a-long-local-passphrase npm run companion
# Terminal 2: the static site, pointed at it
npm run dev:pages      # http://localhost:5173/afterimage-site/
```

Outside production, the companion accepts `localhost` and `127.0.0.1` origins
when `AFTERIMAGE_ALLOWED_ORIGINS` is empty. To check the built output instead,
run `AFTERIMAGE_COMPANION_URL=http://localhost:8788 npm run build:pages`, then
`npm run preview:pages`.

## Verification

- The static build was tested in Chromium against the companion, which ran real
  Claude Code 2.1.284 against a local stand-in API. The checks:
  - the page loads under `/afterimage-site/` and asks to be unlocked;
  - a wrong passphrase is refused and not kept;
  - the right one unlocks, and the site stays unlocked after a refresh;
  - the reel, a replacement and an Atlas all complete, with film search and
    details served by the companion;
  - every private call went to the companion;
  - the phone layout fits with no page errors.
- The companion's Docker image was built and run in production mode, with a
  local stand-in API and a stand-in TMDB. It:
  - answered `/health`;
  - refused the browser API without the passphrase;
  - searched films;
  - developed a complete reel through Claude Code inside the container.

  The build had one change: this environment blocks Debian's package mirror, so
  that build copied in a CA bundle where the Dockerfile installs
  `ca-certificates`. Railway's build runs the Dockerfile unchanged.
- Not verified here:
  - a live Railway deploy;
  - a live GitHub Pages deploy;
  - a live Claude request.
