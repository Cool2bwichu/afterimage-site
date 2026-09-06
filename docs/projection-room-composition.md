# Projection Room composition — September 6, 2026

Implements the user's three supplied desktop/mobile mockup compositions using existing real provider imagery and the established black/ivory/amber identity. All matched backdrops can lead film rows; posters and text remain graceful fallbacks. The featured film has a large still and dedicated reading column, followed by full-width image/text rows. Request and reference summaries sit above the four-channel fingerprint.

The dossier uses a large image, title/facts, adjacent notes and quality controls, sibling-film navigation, and an embedded functional Light Table. Quality explanations remain available in a disclosure rather than filling the compact selection tiles. Like stays close to the title. Native dialog Escape/focus return and shared selections are preserved; switching siblings does not close the dialog. Only one Light Table is mounted.

Mobile recomposes the image, notes, and controls; poster-only content retains a compact poster layout. No fake Saved reels, Compare, or exploration controls were added. Generated mockup artwork is not used as actual film imagery.

Verification: 1440 desktop, 768 tablet, 390 and 360 phone layouts; no horizontal overflow; real stills and simulated image-failure poster fallback; sibling switching, borrowing across films, selected-quality persistence, and Escape returning to original opener. Frontend tests (63), TypeScript, build and lint (zero errors, four native-image optimization warnings). Companion bridge tests (112). The new taste feature is described in taste-profile.md.

Local review: http://127.0.0.1:3001/?experience=light-table-v1 . Evidence is in the parent project's work/evidence/composition-likes. Publication remains separate from this local implementation checkpoint; V2 remains the default engine.
