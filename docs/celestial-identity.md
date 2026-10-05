# AFTERIMAGE — cinema in orbit

The experience should feel like entering a quiet observatory where films, rather than planets, carry the light. The landing page introduces the aperture; the reel opens it into a screen; Atlas makes its connections navigable. Film imagery supplies the richest color. The interface supplies darkness, warm light, and a precise viewing frame.

## Visual commitments

- Ink `#080d14`, chamber `#101923`, ivory `#f4efe5`, starlight `#dec6a0`, blue-grey `#a7b6c5`, oxidized silver `#9cbbb9`.
- Cormorant Garamond for film titles and editorial statements, DM Sans for navigation and controls. Keep the same wordmark and orbital emblem throughout.
- One large film aperture dominates the entrance. Its rings are a framing device, not a data visualization. Actual Atlas links alone encode relationships; relationship categories remain explicit.
- An intentional, fixed star plate establishes depth. Slow orbital light supplies atmosphere; selecting a film and changing a lens supplies purposeful motion. All controls stay spatially stable and motion has a visible pause control plus an operating-system reduced-motion fallback.
- Details appear beside the selected film. Existing notes, comparison, borrowing, saved films, Likes, trail and list navigation remain available.

```text
Entrance:  quiet header / editorial invitation + luminous film aperture
           three real films to look through / discovery examples
Reel:      same header / cinema screen + five-film index / contextual notes
Atlas:     same emblem / selected film constellation + connection reading
Mobile:    invitation / aperture / action; chart / selected reading
```

## Reference principles and limits

- [Lusion](https://lusion.co/): a sculptural visual center gives the page identity; typography and navigation are deliberately simpler. Its home was visually inspected. We borrow the compositional discipline, not its 3D objects or heavy rendering stack.
- [Roden Crater](https://rodencrater.com/celestial-events/): darkness becomes a viewing chamber around a small, luminous subject. Home and Celestial Events were visually inspected by the research agent.
- [Hello Monday / Star Atlas](https://www.hellomonday.com/work/staratlas): the studio's case text describes a portal and solar-system navigation. Live motion could not be inspected, so this is a conceptual reference only.
- Mobbin was requested and queried, but the connector returned a paid-plan requirement. No unavailable Mobbin imagery is claimed as evidence.

## Self-critique and acceptance

A star texture alone would be cosmetic. Small circular thumbnails alone would repeat the previous failure. The change must be immediately visible in the scale, framing, lighting and shared composition of the landing page, reel and Atlas. Avoid a decorative sci-fi dashboard, neon borders, arbitrary numerical coordinates, hidden navigation and moving targets. Missing artwork must still look intentionally designed without pretending to be film imagery.

Validate real existing data at desktop and phone widths, first-visit Atlas without matched artwork, selection/lens motion, paused/reduced-motion states, keyboard access, and existing tests/build. Keep Terra Medium and the recommendation contracts unchanged.

## Validation checkpoint

- 98 existing tests pass; TypeScript passes; lint has no errors and 10 existing image-element warnings.
- Inspected at 1440 × 900 and 390 × 844: landing, real five-film reel, whole-film Atlas, three-group lens, and the first-visit Atlas without matched artwork.
- Featured-film selection updates the aperture. Atlas keyboard navigation updates the selected film and its reading. Mobile selection brings the reading into view, with an explicit way back to the map.
- Observed the selected-connection animation running at 192 ms of its 650 ms duration. Corrected bottom-node clearance; no film labels extend beyond the desktop chart.
- Pause stops ambient motion. Emulated operating-system reduced motion disables the animated trace and keeps content fully visible. Test data was isolated to the local preview; production film data was not replaced.
