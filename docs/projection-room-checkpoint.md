# Projection Room local checkpoint

Based on authoritative Site version 12, commit 059e1e1c70a15e8185b24810d8f5c66619ec01aa. Changes remain local and undeployed.

- Cormorant Garamond / DM Sans, charcoal-green surfaces, warm ivory, restrained amber.
- Compact request surface and fingerprint; the full persona, palette, sensibilities, and spirit-director material remains accessible.
- Featured-film backdrop from the existing TMDB details response when available; verified poster fallback, including failed-image fallback. No generated imagery is embedded in the app.
- Readable companion films, contextual dossier, accessible facet selection, and collapsible Light Table on desktop/mobile.
- Honest generation state and elapsed time, with the previous reel retained while a replacement develops.
- The displayed reel's original request is stored separately from a pending request, preventing a failed replacement from contaminating its reroll.
- Safe optional V3 program-note parsing/persistence/display. V2 and existing Light Table behavior remain compatible.

Verification: 62 tests, TypeScript, production build, and diff checks pass. Lint has no errors and the same three native-image advisory warnings. Native browser checks cover 360/390/768/1440 CSS widths, all five cards, no horizontal overflow, dossier focus, selection/replacement/removal, four-channel refresh persistence, mode disable/re-enable, Escape return, reduced motion, and 200%-equivalent layout emulation. Native browser-menu zoom itself was not exercised.

Visual baseline and after-captures use a frozen editorial fixture plus verified TMDB metadata; they are not claims about a newly generated production reel. Some original baseline captures used a different browser zoom, so compare composition rather than treating every capture as a pixel-identical viewport pair. The local fixture uses TMDB's 2022 catalogue release year for After Yang and a verified backdrop path. Actual metadata fetching remains server-side.

Local preview harness and evidence are outside this repository in the parent project's work directory. No harness routes or fixture injection are part of the production app. Final visual approval and the V3 taste/latency promotion decision remain outstanding.
