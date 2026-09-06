# Atlas

## Creative contract

The user's `Codex Image Sep 5, 2026, 01_00_25 AM.png` is the primary visual reference. Keep very close to its composition: perforated film rail, letterspaced masthead, narrow editorial film portrait, expansive gold-lit constellation, dense right-hand connection panels, and a horizontal programme of real film stills. The Forme project `da9254e192763924` records this brief; its starter reference library is not an alternative art direction.

Tokens: green-black `#080d0b`, warm ivory `#e8e3d4`, aged gold `#dab76e`, muted silver-green `#a2aaa2`; Cormorant Garamond display, DM Sans utility text; square frames, 1px subdued borders, an 8px spacing rhythm. Atmosphere comes from film imagery, a softly lit star field, fine orbital lines, and deliberate negative space. Avoid card dashboards and ornamental controls.

Three signature moments: the constellation develops into view; selecting a film sends light along its relationship; the editorial dossier changes while the map keeps its spatial arrangement. Reduced motion removes traveling light and entrance movement. Mobile keeps the complete map followed by readable, stacked film and relationship panels.

Connection clarity: within a selected lens, gold `#e4bd70` means **Close** (strongly shared), sea-glass teal `#87c9bc` means **Echo** (a related quality), and muted rose `#e2a0a2` means **Contrast** (a different approach). Solid, dashed and dotted strokes repeat these meanings without relying on color. Lines stay 2px across viewport sizes; selecting a film strengthens its line to 3px and its halo without changing the semantic color. Film rings, edge labels, explanation accents and the visible key use the same tokens. Whole-film paths remain neutral because individual lens readings do not constitute an overall similarity score; the key invites selection of a lens.

The former multi-film Aesthetic DNA matrix is replaced by **How they connect**, comparing only the explicitly selected neighbor with the labeled center film. The shared connection appears first. Four expandable rows use plain-language categories (World & setting, Mood & emotion, Visual language, Storytelling & dialogue); opening one reveals the actual lens evidence and selects the same map lens. Closing it returns to Whole film. Differences remain available in one disclosure. With the center film selected, a short invitation replaces the comparison. This removes the redundant Anchor column, other unselected films and duplicate relationship panel without removing any lens evidence.

## Product and data contract

An explicit Explore connections action develops a separate Atlas around one film. It preserves the current request, references, selected Light Table qualities, exclusions and background Likes. Eight candidate neighbors are considered; the first six with verified distinct identities form the map. They must satisfy the request and have specific, defensible relationships with the anchor. Likes remain subordinate and seen/excluded identities cannot be neighbors. Profiles and account features are deferred. The visible title is Atlas, as requested by the user.

Connections are editorial interpretations generated from film knowledge, not documented influence or measured similarity. No invented percentages, quotes, ratings, streaming availability, or Play buttons. Each relationship gives shared qualities, a meaningful difference, and four qualitative lens comparisons with explanations. All seven film identities must be verified by the metadata service before a map is accepted. Metadata verification does not independently verify the editorial interpretation.

The Atlas uses the existing authenticated generation service and serialized job gate, but a separate input/result contract and UI state. Opening, selecting, changing a lens, and returning to a cached map never redevelop a reel. A new map requires an explicit action. Failures preserve the previous map and current reel. Accepted jobs resume after reload. Borrowed qualities use the existing Light Table; Likes use the existing taste history.

The masthead Atlas button reopens the last map; Explore connections and the film dossier action explicitly develop a new anchor when needed. The last complete map is cached in `afterimage:atlas:v1`, separately from the reel and Likes. Start over clears the Atlas and current reel; Likes remain. On mobile, individual edge labels become a tap-to-read connection caption to avoid collisions. The film programme scrolls horizontally within its own strip.

## Implementation and limits

The Site adds `AtlasWorkspace`, `app/lib/atlas.ts`, `app/atlas.css`, and the private `/api/atlas/generations` proxy. The bridge adds the Atlas contract, eight-candidate prompt, identity verification and `/v2/atlas/generations`. Existing V2/V3 reel selection is unchanged; V2 remains the default.

The bridge requires `AFTERIMAGE_FILM_METADATA_URL` pointing at the existing HTTPS film enrichment endpoint. Verification retries a transient metadata failure without another model generation. Atlas responses have a separate 90,000-character ceiling because nine profiles plus comparisons exceed the ordinary reel's 20,000-character ceiling; the ordinary limit is unchanged. A generation is still bounded to five minutes. This first iteration caches one map and has no global film graph, saved route library, profile, calibrated similarity metric or documented-influence database.

New maps currently take several minutes. Three development runs took about 3–4 minutes; their original jobs failed at the old response-size boundary (and one early pool also contained an ambiguous catalogue match). After correcting the boundary, the saved 27,351-character real response was replayed through the current HTTP route, coordinator, parser, schema and live catalogue verification, completing with six films. That is replay verification of actual model output, not a claimed fresh model run after the fix. Evidence is under the parent workspace's `work/evidence/atlas/`.

## Validation

Check schema and identity enforcement, hard exclusions, retained input, generation routing, job resumption, and separate reel state. Inspect desktop and mobile against the supplied reference, actual generated film data, selection, lens explanations, keyboard dismissal, Like and quality borrowing. Record remaining limitations honestly.
