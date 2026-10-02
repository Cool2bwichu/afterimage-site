# AFTERIMAGE mobile

AFTERIMAGE is a private, phone-first cinematic instrument. It preserves the original reel input, film chips, loading leader, cinematic persona, insight, palette, sensibilities, spirit director, recommendation cards, and device-local persistence.

This is the **ChatGPT version**, incorporating the Observatory interface from `claude/observatory-claude` through `34d418b`. Reels, Atlases and single-film replacements use `Cool2bwichu/afterimage-subscription-bridge`, with ChatGPT device sign-in and the companion's configured model. The browser never receives model credentials. See [docs/observatory-chatgpt.md](docs/observatory-chatgpt.md) for the integration and [docs/observatory.md](docs/observatory.md) for the visual design.

The optional Claude companion and static build tools are retained from the Claude branch. They are separate editions: see [docs/claude.md](docs/claude.md), [companion/README.md](companion/README.md), and [docs/github-pages.md](docs/github-pages.md). They do not replace the ChatGPT companion or the Sites production configuration.

This branch is also an experimental route for the interface itself: the entrance asks one question, the Eye Test finds a reel without typing, reels and Atlases develop on screen while Claude writes them, two films can be collided to find the one between them, a long press shows a film's verbs, the room takes each film's light, and watched films leave ticket stubs. See [docs/encounters.md](docs/encounters.md).

It also runs as a claude.ai Artifact (`npm run build:artifact`). There the page asks Claude directly on your claude.ai account, with no companion, but without TMDB posters, film details or film search. See [docs/claude.md](docs/claude.md#claudeai-artifact).

## Local development

For working between this Mac and Codex Cloud, see [Local and cloud development](docs/local-and-cloud.md).

1. Start `afterimage-subscription-bridge` on port 8788.
2. Copy `.env.example` to `.env.local` and set the matching bridge URL and secret. Keep the bridge model at the approved Terra baseline unless explicitly changing it.
3. Run `npm run dev` and open `http://localhost:3000`.

## Production

The site is built with `npm run build` and published to the existing OpenAI Sites project in `.openai/hosting.json`. Production environment values are managed by Sites, not committed here. The ChatGPT companion runs in an always-on container with HTTPS and persistent encrypted Codex authentication and job storage. Do not point this deployment at the optional Claude companion.
