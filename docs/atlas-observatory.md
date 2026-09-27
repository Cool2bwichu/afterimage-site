# Atlas observatory — 27 September 2026

Checkpoint: published screening-room version 23, source `6966524`.

Direction: a film observatory, with actual film images as the objects of attention and sparse chart lines as orientation. One map, one selected connection, one route forward. Avoid the former tiny portrait orbs, three competing reading columns, repeated seven-film strips, and decorative pulses.

Primary references inspected: NASA Eyes (selected Earth becomes the scene's focus and exposes related destinations); Cosmos (a film-space image opens to a generous image/detail layout and connected collections); Rijksmuseum Art Explorer (one theme reveals a collection dominated by imagery). The parallel agent followed Music-Map's Cibo Matto → Miho Hatori and Radio Garden's Homestead → Krestena path. Take orientation and progressive reveal, not dense orbital clutter, ads, hidden controls, or unsupported similarity geometry.

The new signature interaction is an explicit lens change. Six films move from an unranked constellation into adaptive Close, Echo, or Contrast regions according to their existing categorical affinity for that lens. Position within a group does not rank films. Only anchor-to-neighbor edges are drawn: there is no evidence for neighbor-to-neighbor links.

Selecting a film highlights its link and reveals one reading at a time: the connection, the difference, or film notes. Exploring onward is explicit and only promotes a new anchor after a complete verified map arrives. Saved trail, selections, lenses, pending jobs and Back remain intact. Search and visited maps move to secondary controls. Borrowing and a separate Save action are available from the selected film.

Palette: observatory ink #0c1119, atmosphere #17222d, ivory #f1eee6, steel #a8b5c5, warm light #e0c89c; Close #e0c89c, Echo #9fc9c3, Contrast #c6aec8. Existing DM Sans carries film identity and controls; Cormorant carries selected editorial passages. Film imagery retains its own color. Borders mark actual regions and selected paths.

Layout: full-width restrained masthead, compact trail, an approximately two-thirds-width chart beside one contextual film reading. Mobile keeps the same selected state with a compact chart/list switch and the reading immediately below; categorical lists provide the same information when a spatial arrangement would be too tight. Keyboard arrows traverse films, controls use visible focus, and reduced motion removes travel while preserving state changes. Transitions use a 240ms selection family and a 520ms layout family, with no continuous background animation.

Validation targets: real six-film map, lens regrouping, all six in one category, long titles, keyboard selection/return, explicit follow-on request identity, saved trail reload, mobile horizontal overflow, and reduced motion. Reuse existing generation and catalog contracts; no additional model stage or production dependency.

## Research sources

- [NASA Eyes](https://eyes.nasa.gov/apps/solar-system/): firsthand Earth selection; use object focus and retained orientation.
- [Cosmos](https://www.cosmos.so/e/239729477): firsthand film-space image detail; use generous imagery and contextual routes outward.
- [Rijksmuseum Art Explorer](https://www.rijksmuseum.nl/en/collection/art-explorer): firsthand image discovery around a theme; make the content the primary visual material.
- [Radio Garden](https://radio.garden/): agent followed an actual station journey; retain a clear center and reversible movement.
- [Music-Map](https://www.music-map.com/): agent followed artist connections; useful relationship interaction, but its spatial distance semantics are not supported by Atlas data.

## Implementation and validation

The chart uses populated affinity groups only, avoiding empty regions when all six films share a quality. Counts retain the full Close/Echo/Contrast picture. The same film nodes and paths interpolate between layouts. Keyboard arrows use spatial neighbors; Home/End use the six-film order. Mobile selection scrolls to a focused reading and offers a return to the same film on the map. A grouped List exposes the same connections without spatial navigation.

Artwork uses an independently validated, bounded seven-day snapshot cache; the renderer rejects canonical-ID mismatches. Watchlist saves contain only title, year, and canonical ID. A shared parser repairs reading the original request from saved Atlas keys that include a canonical ID. No engine or model changes.

Validation: 98 site tests pass; TypeScript passes; lint has no errors (10 existing image-element advisories). Browser checks at 1280×720 and 390×844 used a real verified Still Walking Atlas, covering six films in one affinity, mixed affinities, long titles, selection, spatial keyboard movement, save, borrow provenance, reading modes, search disclosure, reload restoration, and reduced motion. The mobile dialog has no horizontal overflow. Frame samples confirmed intermediate film positions and path shapes; reduced motion gives zero-duration transitions. Production build and release are recorded in the accompanying release report.

Generation remains asynchronous. A new Atlas keeps the current map usable until the complete verified map arrives. This UI change does not claim faster generation or measured improvement in recommendation quality.
