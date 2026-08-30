# AFTERIMAGE mobile

AFTERIMAGE is a private, phone-first cinematic instrument. It preserves the original reel input, film chips, loading leader, cinematic persona, insight, palette, sensibilities, spirit director, recommendation cards, and device-local persistence.

The browser never receives a model credential. Its three server routes forward protected requests to the companion subscription bridge, which uses OpenAI's Codex app-server device sign-in and structured output support with the owner's ChatGPT account.

## Local development

1. Start `afterimage-subscription-bridge` on port 8788.
2. Copy `.env.example` to `.env.local` and set the matching bridge URL and secret.
3. Run `npm run dev` and open `http://localhost:3000`.

## Production

The site is built with `npm run build` and hosted privately on OpenAI Sites. Production environment values are managed by Sites, not committed here. The companion bridge must run in an always-on container with HTTPS and a persistent encrypted `/data/codex` volume.
