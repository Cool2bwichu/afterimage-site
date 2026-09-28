# The Observatory — 28 September 2026

Base: `feat/screening-room` at `e74c920` (published screening-room version 23 plus the collection navigation checkpoint). This iteration takes the celestial identity from framing device to the organizing idea of the product: films are stars, reels are constellations, Atlases are star charts, and everything a viewer has met gathers into a sky of their own. It is local work for review; nothing here is published.

## Creative direction

A film leaves an afterimage: the light that persists after you look away. The interface now behaves like a night sky that develops as you use it. The palette, typography and tokens are unchanged (ink `#080d14`, starlight `#dec6a0`, ivory `#f4efe5`, steel `#a7b6c5`; Cormorant Garamond and DM Sans; channel colors from the Light Table). New motion is ambient and slow, always paused by the existing Motion control, and absent under the device's reduced-motion setting.

```text
Landing:   invitation + an orrery: the aperture, three film planets on its inclined orbit
Reel:      request / the reel as a named constellation / screening stage / notes
Waiting:   the charting room: turning rings, the references in orbit, five dark stars
Your sky:  every film met here, charted; a reading panel; Map or List
Journal:   "What stayed with you?" — the afterimage of a watched film
```

## What changed

- **Living sky.** `NightSky` renders a deep field and a tilted Milky Way once per size, then draws twinkling stars, diffraction spikes and an occasional meteor whose path lingers faintly — an afterimage. It sits behind the landing, reel, Atlas chart and Your sky, with gentle pointer and scroll parallax. It pauses off-screen, in hidden tabs, with Motion off and under reduced motion, where one still frame is drawn.
- **The orrery.** The landing aperture now has the three editorial films as planets on its drawn orbit. Far-side planets pass behind the lens. When a pointer or keyboard focus reaches the instrument, the films glide to the near side of the ring, clear of the lens and its credit, and rest there until the pointer or focus leaves. Every film is always in reach, and nothing drifts while you aim. The same arrangement is the still view under reduced motion. Choosing a planet opens it in the aperture with an iris transition. A fourth chapter, *Your sky*, demonstrates Likes, afterimages and saved films on an illustrative constellation.
- **Your reel as a constellation.** Above the screening stage, the five films are drawn as a thread in ranked order and named by the reel's persona. Stars select films (arrow keys, Home/End), and the thread draws itself on arrival. *Save star chart* produces a 1080×1350 image from the reel's own words and palette — no film artwork, so nothing is redistributed — shared through the system sheet on touch devices and downloaded elsewhere.
- **The charting room.** The developing state became an orrery: the reference films or borrowed qualities orbit, five dark stars wait at the centre, and the only numbers shown are the real status and elapsed time. The tab title says a reel is developing and, when one arrives while the tab is hidden, that it is ready. An opt-in browser notification is offered; blocked or unsupported notifications fall back to the title.
- **Your sky** (`#sky`, masthead and collection menu). A pan/zoom star map of every film in saved reels, Atlases, Likes, the watchlist and the afterimage journal. Reels are gold threads; Atlases are silver orbits around the film they began with. A film met twice is one brighter star that bridges both. Liked and remembered films shine brighter; saved films are hollow until seen; afterimages wear a ring in the colors of the qualities that stayed. The reading panel filters stars, lists constellations (selecting one flies to it), and opens a film's reel or Atlas, Like, Save, Log an afterimage or Explore its Atlas. List view presents the same content without spatial navigation. Keyboard: arrows travel between stars, +/− zoom, 0 shows the whole sky.
- **Afterimages** (`#afterimages`, library tab, screening stage, dossier, sky). After watching: the date, which of the four qualities stayed (labelled with the film's own facet labels when known), and one private line. Logging offers to Like the film and to move it out of the watchlist; both are explicit and on by default only when applicable.
- On phones, a first visit with an empty sky keeps the landing header on one line; the sky link appears once there is something in it.
- **Composer** restyled as a dark instrument panel, which also fixes the unreadable *+ Add* label on the paper composer. The standard/Light Table mode link moved from the masthead to the footer to make room for *Your sky*; its behavior is unchanged.
- **Motion control** now reads the provider's rendered `data-motion` state and toggles through a document event, so the pause control works even when the development server loads the celestial module twice (previously a dev-only failure; production was unaffected).

## Data and honesty

- New browser keys: `afterimage:afterimages:v1` (versioned journal, ≤500 entries, each validated alone) and `afterimage:sky:v1` (first-seen dates for Atlases, so the sky keeps its shape). Existing reel, Atlas, Likes and watchlist storage is read, never rewritten by the sky.
- The journal never leaves the browser and is not sent to the bridge. Only an explicit Like changes recommendation input, exactly as before. No request contract, route or engine behavior changed.
- Sky layout is deterministic. Position records when and where a film was met: fresh constellations take the next clear slot of a spiral outward from your first reel; an Atlas grown from a film already in the sky blooms around that star, turning and widening its ring to clear existing stars and names. Distance never measures similarity, and only anchor links are drawn for Atlases, consistent with the Atlas contract. The panel and footer say so.
- No invented ratings, scores, progress percentages or availability. The star chart carries the persona, insight and palette only.

## Validation

- 122 site tests (17 new: journal parsing, revision and limits; sky determinism, one shape per reel across views, figures, bridges, blooms around an existing anchor, spacing at full history, taste brightness, registry stability, keyboard travel, routes). TypeScript, production build and lint pass; lint reports no errors and the existing native-image advisories (one more for the sky's poster).
- Browser checks against both the dev server and the production build, with a seeded history (two reels, two Atlases, Likes, watchlist, three afterimages) and placeholder imagery because TMDB is not reachable from the cloud environment: landing orrery, iris transition and sky chapter; composer; reel constellation and star-chart download (1080×1350 PNG inspected); afterimage log from the stage, dossier and sky; library journal tab; charting room with tab title; Your sky map, selection, constellation fly-to, list view and empty state; Atlas.
- Functional checks passed: `#sky` opens from the masthead; Escape and browser Back close it and return focus; logging from the sky saves quality and note and adds the Like; the sky reflects it immediately; a constellation link opens its Atlas and Back returns to the sky with the selection kept; a constellation opens its saved reel; dossier logging stacks above the dossier and Escape closes only the log. Reduced motion shows the complete sky at once with no page errors. Captured at 1440×900 and 390×844.

## Limits and follow-ons

- Real film imagery, real generated reels and physical-device performance were not exercised from the cloud environment. The canvas layers are sized per viewport and capped at 1.75× device pixel ratio; weaker phones should be checked before release.
- The sky and journal live in this browser only, like Likes and the watchlist. The existing JSON backup covers the watchlist; extending it to the journal is a small follow-on.
- A journal-informed taste signal (qualities that stayed) would need a bridge contract change and is deliberately not sent.
