# AFTERIMAGE mobile

AFTERIMAGE is a private, phone-first cinematic instrument. It preserves the original reel input, film chips, loading leader, cinematic persona, insight, palette, sensibilities, spirit director, recommendation cards, and device-local persistence.

This branch is the **Claude version**: reels, Atlases and single-film replacements are programmed by Claude through `companion/`, a private service that answers the same protected contract the GPT subscription bridge does. Like the GPT version's ChatGPT sign-in, it runs on your own Claude subscription: the companion drives Claude Code with a token from `claude setup-token`, so reels draw on your plan's usage limits instead of an API bill. An Anthropic API key remains an option. The browser never receives a model credential; the site's server routes forward protected requests to the companion with a shared secret. See [docs/claude.md](docs/claude.md) and [companion/README.md](companion/README.md).

## Local development

For working between this Mac and Codex Cloud, see [Local and cloud development](docs/local-and-cloud.md).

1. Run `claude setup-token` (Claude Code, with your Claude Pro or Max plan), then copy `.env.example` to `.env.local` and set the token, bridge URL, shared secret and film metadata URL.
2. Install the companion once with `npm --prefix companion ci`, then start it with `npm run companion` (port 8788).
3. Run `npm run dev` and open `http://localhost:3000`.

## Production

The site is built with `npm run build`. The published AFTERIMAGE site on OpenAI Sites is the GPT version; `.openai/hosting.json` still names that production project, so do not publish this branch through it unless you intend to replace the GPT version. Host the Claude version separately, with its own environment values. The Claude companion runs as an always-on service with HTTPS, persistent job storage, Claude Code installed and `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) in the host's secret store (`companion/Dockerfile`).
