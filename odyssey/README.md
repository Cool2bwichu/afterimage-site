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
- **Temper.** How a film treats you, read from the chart: dread, cruelty,
  irony, ambiguity and how broken its telling is, each with its reason, for
  1,541 films. Shown at every star, and any one can be bent: "like Heat, with
  less cruelty" (`src/engine/temper.mjs`).
- **Tonight's seeing.** Say what tonight can hold (how long, which language,
  how much dread or cruelty, told straight or as a puzzle) and whatever does
  not fit fades into haze, offered nowhere (`seeing.mjs`).
- **Take a bearing.** Six quick choices between two well-known films, each
  pair splitting what is left of the sky in two; then three films for tonight,
  each with why it fits (`bearing.mjs`).
- **Watching together.** A few films the other person loves, or a sky they
  sent as a link, and the films where the two skies meet, with what each of
  you will find in them (`together.mjs`).
- **Wormholes.** At a star, a film far across the sky that is yet one of its
  nearest in story, feeling or idea, in a few rare things they share. Shown in
  the star's page, as a window beyond its system, and as a thread across the
  sky; going through is a passage of its own (key J, `wormhole.mjs`).
- **Rays and star systems.** From any star, one ray per light leads to the film
  nearest it under that light, with the reason said plainly. Arriving at a film
  draws its system: six orbits, one per light, with its nearest films circling
  it. Move away across the sky and the system folds; a button takes you back.
- **Moving about.** Seen whole, from far out, the universe is a thing in the
  hand: one finger (or a drag) turns it and tilts it, and a flick sets it
  spinning. Nearer, among the galaxies, the sky moves like a map: one finger
  takes hold of it and moves it across, and a flick glides on. Anywhere, two
  fingers pinch about the point between them, twist to turn, and slide up or
  down together to tilt; a double tap comes closer there. With a mouse,
  Shift-drag always moves across (Shift may be pressed or let go mid-drag),
  and the right button (or Alt) always turns and tilts; the wheel and a
  trackpad pinch come nearer what is under the pointer, and the arrows move
  across (Shift with them turns); two fingers swiped sideways on a trackpad
  move the sky across with them. The universe is deep, not flat, so a hand
  takes hold of the stars it actually touches, as deep as they lie (at a star,
  the star and its system, for as long as it is in view), and slides the view
  across the screen with them: up is up, nothing grows or shrinks while it
  moves, and what was taken hold of stays under the hand. The edges of the
  sky, above and below as well as around, give like elastic and spring back
  instead of stopping dead (`src/cosmos/camera.mjs`).
- **A constellation, framed.** Choosing a constellation flies it into the open
  sky that is left: above the list on a phone (which lies lower for it), beside
  the panels on a computer. It is drawn as bright threads while the other lines
  step back, and it stays in the open sky as the list is pulled taller, until a
  hand moves the view.
- **Drawn to be smooth.** The galaxies wind into arms of light around bright
  hearts, and far galaxies too distant to chart lie in the deep background. On
  a device that cannot keep up while the sky moves, the moving sky is drawn a
  step coarser (its lights are soft, so it hardly shows) and sharp again the
  moment it is still; a device that holds its frames back anyway, as a phone
  saving its battery does, is noticed and left sharp (`src/cosmos/sharpness.mjs`).
  On a phone the instruments are a deeper glass with nothing blurred behind them.
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

**Readings, one star at a time.** A star is read by Claude the moment someone
with a Navigator arrives at it: a line on what the film is, and a sentence for
each of its six rays. The reading is kept (in that browser, and by the companion
for everyone it serves), so each film is read once, and nothing is ever read in
bulk: what Claude spends follows what people actually look at. Until Claude has
read a star, and wherever no Claude is connected, the chart speaks in its own
words (`src/engine/plain.mjs`): the film's kind from its encyclopedia entry, how
it treats you, where it is set and what it turns on, and for each ray what the
two films share and where they part. Those words are marked as the chart's, and
a remembered moment is only said where it does not sound as if it gives the
story away. Readings can still be written ahead of time and shipped in
`public/data/readings/` (see the end of this file), but none are, by choice.

**Finding a film by describing it.** Typed into the threshold or the find box,
a description ("a heist goes terribly wrong and the thief falls in love", "a
slow sad film about grief set in Japan") is read by the chart into the parts it
knows (`describe` in `src/engine/search.mjs`): moods, turns of plot, places,
themes and decades, in everyday words as well as the chart's own, and any word
no trait answers to is looked for in what is written about the films. The films
that carry the most of it are lit, the closest brightest, and listed with the
parts each one carries. Turns the chart keeps veiled count toward a match but
are never named. With the Navigator connected, the same words go to Claude as a
course, and Claude reads them itself, on the chart or beyond it.

## Run it

```sh
cd odyssey
npm ci
npm run dev        # http://localhost:5199
npm test           # 178 tests: the chart, the engine, voyages and lists, Lookback, the comet, temper, seeing, bearings, together, wormholes, the hands, the open universe, the brain, the pilot, journals, readings, the chart's own words, descriptions
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
| `src/engine/` | Likeness, search (titles, kinds of film and moods in everyday words), gravity (sequels kept behind), the chart's own words (`plain.mjs`), passages, voyages and ranked lists (`journey.mjs`), Lookback (`time.mjs`), tonight's comet (`comet.mjs`), temper (`temper.mjs`), tonight's seeing (`seeing.mjs`), bearings (`bearing.mjs`), watching together (`together.mjs`), wormholes (`wormhole.mjs`), and the open universe (`addStars` is append-only, so charted films never move). Runs in the browser and in the companion. |
| `src/cosmos/` | The WebGL sky: renderer, shaders, the camera and the hands that move it (`camera.mjs`), labels, star systems, the comet. |
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

## Read the chart ahead of time (optional, not used)

The site reads stars live, one at a time, and this is not needed. It is kept
for a deployment that wants every star read before anyone arrives. The pre-read goes through a running companion, exactly as a browser would, so
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
