# AFTERIMAGE, the Odyssey

One universe of films. Every film is a star, and the same stars re-form into
different galaxies depending on the light you look by. Looking for something to
watch this weekend becomes a voyage: arrive at a film you love, follow a ray to
its nearest kin under one light, change the light and watch the whole sky
rearrange around you.

This folder is a self-contained static site. It does not replace or touch the
existing AFTERIMAGE site, its hosting, or its deployments.

## The idea

- **Six lights, and white.** Story (what happens), feeling (how it feels), image
  (how it looks and sounds), idea (what it is about), world (where and when) and
  hands (who made it). White light is all six together. Under each light the
  2,204 charted films gather into different galaxies with different arms, so
  two films that sit far apart by story can be neighbours by feeling.
- **Lookback, a universe of time.** The same films placed by when they were
  made: the present at the centre, a ring for each decade, the silent years at
  the horizon. Each kind of film (a galaxy of white light) keeps one direction,
  so looking outward from a film is looking back along its line. At a star, its
  line of sight runs back to the horizon and forward to the present, each step
  the film most like the last at least four years away, and its star system
  holds the films before it, after it and of its time. Key 7, or the ring beside
  the lights. Computed in the browser from the chart (`src/engine/time.mjs`).
- **Tonight's comet.** Once a night a comet crosses the sky carrying a film the
  chart thinks you are missing: near a film you love, or, before you love any,
  a film few have found beside one everyone knows. Catch it to see the film and
  why it came; the comets caught are kept in Your sky and travel in the journal.
- **Rays and star systems.** From any star, one ray per light leads to the film
  nearest it under that light, with the reason said plainly. Arriving at a film
  draws its system: six orbits, one per light, with its nearest films circling
  it.
- **Setting out.** A voyage from any film, one door at a time. Three doors open
  from each stop, each under its own light, each saying what the two films share
  and how much of home it keeps. Land when one feels like tonight's film: the
  way there is kept, and has an address of its own to share.
- **Lists.** Any set (a current, a galaxy, one of its star systems, a nebula, a
  constellation) opens as a list, ranked by how typical each film is of it, by
  the pull of the films you love, or by how little known it is.
- **Constellations and nebulae.** Sixty-four constellations are pairs of traits
  that only a handful of films share. They wait faintly in the sky, unnamed,
  each with a clue; visit three of a figure's stars and it tells you its name.
  Twenty-eight nebulae are the registers carried over from ATLAS.
- **What you keep.** Films you love, your watchlist, what you have watched, what
  you set aside (never offered again as somewhere to go next), and the voyages
  you landed. A journal file carries all of it to another browser; it is the
  same format (`afterimage-odyssey`, version 3) the other edition of the Odyssey
  writes, so each reads the other's.
- **Gravity.** The films you love bend the sky toward what they have in common.
  Nothing leaves your browser.
- **Voyages.** A passage between two films along charted roads, a course the
  Navigator plots from what you ask for, and the film that sits between two
  others.
- **The Deep Field.** The chart is a starting point, not a boundary. The
  Navigator can chart any film it knows from memory, and that film takes its
  place among the stars it is most like. A found star is a star like any other:
  it can be searched for, travelled to, loved, and read.

## The chart and the Navigator

The site has two halves, kept honest about which is speaking.

**The chart** is compiled ahead of time from the ATLAS corpus
(`universe/compile.mjs`) into `public/data/universe.json` and `depth.json`. The
browser recomputes likeness with the same engine, so everything on screen that
is marked as charted works with no model at all.

**The Navigator** is Claude (Opus 5.5 by default), reading behind every step:
what an arrival means, what lies beyond the chart, a course, a collision, a
reading of your own sky. It is reached one of two ways, and when it cannot be
reached the site says so rather than pretending.

| Edition | How Claude is reached | Films beyond the chart |
| --- | --- | --- |
| The site with the companion | The browser calls `/api/odyssey/*` on the AFTERIMAGE companion, which asks Claude with its owner's credentials | Kept by the companion in a commons every visitor shares (up to 8,000 stars), with posters when the companion has a TMDB token |
| The claude.ai Artifact | The page asks Claude itself, on the viewer's own Claude account | Kept in that browser only (up to 1,500), without posters |
| Neither | Nothing answers | The chart alone |

The same code in `brain/` writes every prompt in both editions. With the
companion, the browser never sends a prompt: it names an operation and names
films by their slugs, and the few things a viewer types go into the prompt as
data. See [../companion/README.md](../companion/README.md#the-odyssey).

**Readings written ahead of time.** The Navigator can also read every star of
the chart once, before anyone arrives (see below). Those readings ship beside the
chart in `public/data/readings/`, a shard at a time, and every visitor hears
Claude at every star whether or not a Navigator is connected. They are marked
as read ahead of time, and a connected Navigator can read any star afresh. Until
the pre-read has been run, the index there is empty and nothing changes.

## Run it

```sh
cd odyssey
npm ci
npm run dev        # http://localhost:5199
npm test           # 78 tests: the chart, the engine, voyages and lists, the open universe, the brain, the pilot, journals, readings
npm run build      # the static site, in dist/
```

To bring the Navigator aboard locally, start the companion from the repository
root (`npm run companion`, see its README) with `AFTERIMAGE_SITE_PASSPHRASE`
set, and give its address and passphrase in the site's Navigator panel. They
are kept in that browser only. Outside production the companion answers pages
on `localhost` without further setup; a deployed companion must list the
site's origin in `AFTERIMAGE_ALLOWED_ORIGINS`. A deployment can also set
`window.ODYSSEY_COMPANION = { url }` before the page loads.

## Layout

| Path | What it holds |
| --- | --- |
| `universe/` | The compiler: loads ATLAS, builds likeness under six lights, forms galaxies and arms, finds constellations, lays out each sky. `authored/` holds the hand-written names and vocabulary. |
| `public/data/` | The compiled chart. Deterministic: the same corpus gives the same bytes. |
| `src/engine/` | Likeness, search, gravity, passages, voyages and ranked lists (`journey.mjs`), Lookback (`time.mjs`), tonight's comet (`comet.mjs`), and the open universe (`addStars` is append-only, so charted films never move). Runs in the browser and in the companion. |
| `src/cosmos/` | The WebGL sky: renderer, shaders, camera, labels, star systems, the comet. |
| `src/ui/` | The interface: entrance, dossier, panels, posters, and what the browser remembers (`store.mjs`) and carries in a journal (`archive.mjs`). |
| `src/nav/pilot.mjs` | Finds the Navigator (in the page, through the companion, or not at all) and places what it returns. |
| `src/nav/readings.mjs` | Finds the readings written ahead of time, a shard at a time. |
| `brain/` | The Navigator: vocabulary, prompts, answer contracts, the reader for answers still being written, and how a reading becomes a star. |
| `scripts/` | `build-artifact.mjs` (the claude.ai edition), `fetch-posters.mjs` (a local poster cache for it) and `pre-read.mjs` (the readings written ahead of time). |
| `tests/` | The test suite. `chart.mjs` opens the shipped chart for the others. |

## Recompile the chart

```sh
npm run universe -- --atlas /path/to/film-atlas
```

Without `--atlas` it looks for `film-atlas` beside this repository, or at
`ATLAS_ROOT`.

## Read the chart ahead of time

The pre-read goes through a running companion, exactly as a browser would, so
the companion writes every prompt and Claude answers on the companion's
credentials. Run the companion from this checkout (so it holds the same chart),
then:

```sh
export ODYSSEY_COMPANION_URL=http://localhost:8788        # or a deployed companion
export ODYSSEY_COMPANION_PASSPHRASE=...                    # its AFTERIMAGE_SITE_PASSPHRASE
node scripts/pre-read.mjs --limit 50    # try the fifty best-known stars first
node scripts/pre-read.mjs               # then the rest, two at a time
node scripts/pre-read.mjs pack          # write public/data/readings/, then commit it
```

Every reading uses the Claude plan behind the companion. All 2,204 stars take
many hours and will likely meet a usage limit on the way: the script stops
cleanly when it does, and carries on where it left off when run again. What has
been read is kept in `.cache/readings/` (never committed) as it arrives; a star
the companion has already read for a visitor is answered from its own memory and
costs nothing. Stars are read best-known first, so a partial pre-read covers the
stars visitors reach most. `npm run artifact` carries the packed readings into
the claude.ai edition too.

## Posters

The site shows each charted film's poster straight from Wikimedia, where the
chart recorded one (2,129 of 2,204 films). No poster images are stored in this
repository. Films found beyond the chart get a poster from the companion's
catalogue lookup when it has a TMDB token.

A claude.ai Artifact cannot load outside images, so that edition carries small
thumbnail sheets instead. `node scripts/fetch-posters.mjs` fills a local cache
in `.cache/` (ignored by git) slowly and politely, and resumes where it stopped.
`npm run artifact` then writes `dist-artifact/` (also ignored).

## Limits worth knowing

- The companion's commons holds up to 8,000 found stars; a browser remembers up
  to 1,500 of its own.
- If Claude names a known film under a different title, or a year more than one
  out, it can appear as a near twin of a star already there.
- In the claude.ai edition, found stars have no posters.
- Nothing here is deployed. Publishing the Odyssey anywhere is the owner's
  decision.
