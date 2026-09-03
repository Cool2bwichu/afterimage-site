# AFTERIMAGE Light Table V1

This branch integrates the supplied Light Table design into the real AFTERIMAGE Site v9. It preserves the existing recommendation cards, poster enrichment, film dossier, ratings, exclusions and protected resumable generation routes.

## Source provenance

- Site base: `fe2aaf342de323682c9bc8303fb55a6119f96ff5` (saved Site version 9).
- Backend foundation: `Cool2bwichu/afterimage-subscription-bridge`, `feat/light-table-v1`, `9a8ec75a50e549d33699a69974be672017cc61f0`.
- Isolated local branch in both checkouts: `codex/light-table-v1-integration`.
- Supplied implementation ZIP SHA-256: `41b10d72dde9164d78c30a25c1373be9ef16e4f9a1fa9d750aab10aff6f89a14`.
- Supplied prototype HTML SHA-256: `3bec51193e192eae3555e272ee67909c41e0cfcb9b620b859c7f09908779d236`.
- Supplied preview ZIP SHA-256: `e68bfe10bad1d4170b0b247184d38d78674227e0ca2b451f5cdf616e3609215d`.

All three supplied files match the supplied integrity manifest. The later Site source was recovered from the authoritative Sites Git repository; the older local v1 project was not used as the implementation base.

## Activation

Open the local Site with `?experience=light-table-v1`. The choice is saved on this browser. `?experience=standard` explicitly returns to ordinary V2. A fresh browser without the opt-in uses standard V2.

The feature is not an authorization mechanism. Existing server-side authentication and bridge-secret forwarding remain unchanged. No public route, hosted setting, production deployment or main-branch merge is part of this implementation.

## Components and state

- `SearchFingerprint`: four named channels with normalized traits and distinct marks/colors.
- `FacetTab`: a semantic pressed button; full explanations, source-aware accessible names, keyboard activation and no nested dossier controls.
- `LightTable` / `BlendSummary`: a persistent four-lane composer with provenance, removal, clear, breadth and submission. The first mobile selection opens the composer; it can be collapsed explicitly. Controls are at least 44 pixels high.
- `light-table.ts`, `light-table-parse.ts`: adapted supplied selection helpers and bounded runtime parsing.
- `reel-state.ts`: opt-in extension parsing and additive V4 storage fields (`experience`, `selectedFacets`, `acceptedInput`). Legacy V4/unversioned results remain readable.
- `page.tsx`: owns selection and job lifecycle, keeping the component layer independent from transport.

Each channel holds one choice. A different choice in that channel replaces it; activating the same choice removes it. One channel is a Wide search, two or three a Guided search, and four a Precise blend.

## Generation lifecycle

The initial opted-in request includes the normal film/brief input plus `experience`. A blend sends `films: []`, `creativeBrief: ''`, and only the selected facets with source title/year. The source is provenance and an exact exclusion, never an implicit whole-film prompt.

Both use the existing Site `POST /api/generations` proxy to bridge `POST /v2/generations`, followed by the existing job-status polling route.

| Outcome | Behavior |
|---|---|
| Start fails or returns malformed data | Existing reel and selected facets remain; retry keeps the attempted intent. |
| Valid 202 acceptance | Composer clears, accepted input and job ID persist, and old results enter the existing loading flow. |
| 409 active-job conflict | Existing job resumes; unsubmitted selected facets remain. The unrelated job's input is not guessed. |
| Temporary polling failure | Existing backoff/reconnection behavior continues with the persisted job ID. |
| Background generation fails | “Develop again” reuses the accepted blend and the latest Not interested exclusions. |
| Refresh while running | Polling resumes from the saved job ID. |
| Completed blend | Extended fields survive parsing, and all five recommendations can be remixed again. |
| Recommend Different Films | Reuses the accepted blend and excludes the current five films. Unknown input from another session is never replaced with a guessed prompt. |

Persistent exclusions remain independent of facet provenance. Requests exceeding the bridge's 100-film exclusion limit fail visibly instead of silently discarding exclusions.

## Compatibility and presentation

Standard V2 does not gain facet fields from unsolicited response properties. In opted-in mode, an entirely legacy reel remains readable; an incomplete extension is rejected rather than rendering nonfunctional controls.

Poster handling and the existing dossier are reused. Ratings, verified IMDb links, keyboard focus restoration and Not interested behavior keep their original code paths. Missing metadata leaves the existing text fallback available.

The fixed composer reserves its measured height at the bottom of the document. Small screens use a collapsible shelf, responsive lanes and independent 44-pixel controls. Reduced-motion users retain all selection feedback without transfer animation or smooth result scrolling.

## Verification

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` in this Site. Run `npm run check` in the companion bridge.

Current deterministic results: 52 Site tests and 89 bridge tests pass. Type checking and production build pass. Lint has no errors; the three existing advisory warnings concern the established native poster/credit image elements.

Browser acceptance exercised all 20 facet controls, replacement/toggle/clear, persistence, failed start, 202 acceptance, 409 conflict, transient polling error, refresh/resume, failed-job retry, blend-aware reroll, dossier focus, verified ratings/posters, exclusions, mobile composition and reduced motion. A local fixture bridge injected failures while keeping the real Site proxy, bridge validation, durable job store and generation coordinator in the path. The fixture harness is outside production source.

Real acceptance also passed: an initial two-film Light Table request returned a complete extended reel, and a four-channel blend selected through the actual Site completed in 266 seconds through the protected asynchronous routes and refresh/resume flow. Its five recommendations were Driveways (2019), Mademoiselle Chambon (2009), Journey to the Shore (2015), Nowhere Special (2020) and Sweet Bean (2015). All four fingerprint channels and twenty facets survived, and none of the four selected source films returned. The original two-minute deadline failed the first attempt; the corrected five-minute deadline allowed completion. This is a latency limitation, not a speed improvement.

## Generation deadline

A real four-channel acceptance run exposed the original 120-second response deadline. Light Table turns now have a 300-second deadline; standard V2 retains 120 seconds. An expired Light Table wait requests turn cancellation before archive, and closes its dedicated Codex process if cancellation cannot be acknowledged. The existing resumable job remains the transport throughout. Three regression tests cover these boundaries.

## Local development

Use the existing development scripts and the supplied backend branch. Point the Site's local `AFTERIMAGE_BRIDGE_URL` and `AFTERIMAGE_BRIDGE_SECRET` at that local bridge. Do not point a Light Table-enabled client at the unextended production bridge.

No dependencies were added. TypeScript configuration now permits the `.ts` imports already used by the project's Node-based tests, and targets ES2022 to match its existing runtime features.

Production remains on its existing version. Deployment requires explicit owner approval after reviewing this branch.
