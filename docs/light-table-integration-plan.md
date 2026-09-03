# Light Table V1 integration

Approved scope: implement the supplied Light Table experience in the actual AFTERIMAGE Site; no deployment or production merge. Execute inline with focused checkpoints.

Sources: Site v9 `fe2aaf342de323682c9bc8303fb55a6119f96ff5`; bridge `feat/light-table-v1` at `9a8ec75`; supplied implementation ZIP dated 2026-09-03. Both local checkouts use `codex/light-table-v1-integration`.

Visual direction: retain AFTERIMAGE typography, posters, dossiers and near-black/gold identity. Borrow the reference's four illuminated channel attachments and a fixed, ruled composer. Use readable labels, restrained transfer motion, responsive lanes and a collapsible mobile shelf.

- [x] Port and validate facet helpers. Extend `reel-state.ts` and `generation-state.ts` only for explicit `light-table-v1`. Keep legacy saved reels readable. Test malformed maps, normalized selections and completed job hydration.
- [x] Integrate fingerprint, facet buttons and composer with the existing recommendation cards. Own selection in the page, persist it with the reel, and retain selections on failed starts and conflicts. Clear only on accepted 202 responses. Keep the accepted input for blend retries and rerolls.
- [x] Preserve posters, dossier focus, exclusions, original inputs and existing protected routes. Use URL opt-in `?experience=light-table-v1`; `?experience=standard` returns to standard mode. No default rollout.
- [x] Run full Site and bridge tests, typechecking, lint and production build. Exercise real browser desktop/mobile, keyboard, reduced motion, failed starts, conflicts, refresh/resume, rerolls and old saved reels. Use a local fixture bridge for deterministic failures; separately run a real Codex blend through the local feature bridge when authentication permits.
- [x] Commit verified changes and supply reviewable patches, source provenance and validation evidence. Do not merge, deploy, change hosted settings or modify the production bridge.

Baseline: bridge 86/86 passing; Site 37/37 passing. The supplied integration notes disagree about when to clear selections; this implementation follows the approved branch contract: clear after a new job is accepted, preserve on failed creation or a resumable conflict.
