# Encounters — the experimental Claude edition, 1 October 2026

This branch (`claude/observatory-claude`) is an experimental route for AFTERIMAGE.
The GPT version and its branches are untouched. The rule behind every change here:
**every feature starts from a film**. There are fewer forms and no new menus. The
things you can do live on the films themselves.

| What | Where you meet it | Code |
| --- | --- | --- |
| [One question](#one-question) | The entrance | `app/components/landing.tsx`, `app/lib/one-question.ts` |
| [The Eye Test](#the-eye-test) | *Take the Eye Test* on the entrance | `app/components/eye-test.tsx`, `app/lib/eye-test.ts` |
| [A reel that develops on screen](#a-reel-that-develops-on-screen) | While a reel, Atlas, replacement or collision develops | `companion/lib/partial-json.mjs`, `companion/lib/drafts.mjs`, `app/components/charting.tsx` |
| [Collisions](#collisions) | Drag one star onto another, or *Collide with…* on any film | `companion/lib/collision-contract.mjs`, `app/components/collision-chamber.tsx` |
| [A film's verbs](#a-films-verbs) | Press and hold, right-click, or the menu key on a film | `app/components/film-verbs.tsx` |
| [The room takes the film's light](#the-room-takes-the-films-light) | The reel | `app/lib/film-light.ts`, `app/encounters.css` |
| [Ticket stubs](#ticket-stubs) | *Watched it?* on any film | `app/components/ticket-stub.tsx` |
| [One sky](#one-sky) | Moving between your sky, a reel and an Atlas | `app/components/zoom.ts` |

## One question

The entrance asks one thing: *What stayed with you?*

- **The answer.** Type a film, a scene or a feeling. Once the companion is
  unlocked, films from the catalogue are suggested as you type. A chosen film
  becomes the reel's reference film. Anything else you type becomes its written
  guidance ("What stayed with me: …"). *This one stayed with me* in the aperture
  chooses the film shown there.
- **The sentence.** *Something [mood] to watch [with whom], [when].* Tap a word
  to try the next option. A blank adds nothing. Shift-click steps back, and the
  arrow keys work too.
- **Developing it.** *Develop my reel* starts the reel straight away. On GitHub
  Pages it starts as soon as the companion is unlocked.

The four-chapter tour is gone. *Use the full composer* still opens the full
request form, with several films, the Light Table and written guidance. Its
behaviour and copy are unchanged.

## The Eye Test

A way in without typing. There are five pairs of film frames, and you tap the
one that pulls you in.

- **The pairs.** Each pair sets two looks against each other along one axis:
  warm or cold light, vast or close, saturated colour or black and white, a city
  at night or nature by day, composed or restless framing, amber past or
  glowing future, dreamlike or close to life. Each test draws five different
  axes from a fixed, editorial deck of real films.
- **The reel.** The five films you chose become the reel's reference films. Its
  brief records each choice, for example "warm, golden light (Days of Heaven
  over Fargo)". It also says these are frames you picked, not necessarily films
  you have seen.
- **No waiting.** Claude is asked nothing until you develop the final reel.
- **The frames.** Frames are TMDB stills where the catalogue can be reached.
  Elsewhere, as in the Artifact or before the companion is unlocked, each film's
  look is painted from its colours and described in a line.

## A reel that develops on screen

Claude's answer streams as it is written, so the waiting screen fills in:

1. the sensibility's name;
2. its palette, tinting the room;
3. its one-line insight;
4. each film, resolving from a bright blur once Claude has finished its title
   and year, with its poster fetched as it arrives.

An Atlas shows its idea and then its neighbouring films in the same way. A
collision shows the film between the two as soon as its title is written.

**How it works:**

- **Where the text comes from.**
  - On your subscription: Claude Code runs with `--include-partial-messages`, and
    the text is the `StructuredOutput` tool's input as it streams.
  - In API mode: the Messages stream's text deltas. A server-side fallback
    starts the text again.
  - In the Artifact: `sample`'s `onText`.
- **From text to draft.** A tolerant partial-JSON reader turns the text so far
  into a *draft*. A draft holds only finished, bounded display fields: no
  half-written strings, timecodes or watch notes. Parsing happens at most every
  400 ms.
- **What the site sees.** The draft lives in memory on the running job and
  appears as `draft` in `GET /…/generations/:id`. It is never written to disk.
  The site checks it again with `parseJobDraft` and polls about once a second
  while a draft is developing.
- **The validators still decide.** If an answer fails them, the second take
  starts a new draft (`take: 2`) and the screen says so. The screen also says
  plainly that the draft is provisional.

## Collisions

Drag one star of the reel's constellation onto another, or choose *Collide
with…* on any film. Claude looks for the one real film that lives between the
two.

**What you get:**

- the new film;
- a reason;
- what it takes from each of the two films;
- something to watch for.

From there you can save it, like it, explore its Atlas or collide it again. While
Claude works, the two films circle each other, then merge into the new one;
that merge is the screen's one large motion.

**On the companion:**

- **Routes.** `POST /v2/collisions/generations` (bridge secret) and
  `POST /api/collisions/generations` (passphrase). The job is polled at the usual
  `/generations/:id`.
- **Request.** Two films; optionally your exclusions, Likes, the current mood and
  the films already in the reel.
- **Rules.** The new film may not be either of the two, a film already in the
  reel, an excluded film or a liked one. It must be found in the film catalogue.
- **Effort.** Collisions think at medium effort, or at the configured effort if
  that is lower, so they answer quickly.
- **One job at a time.** A collision shares the one-job-at-a-time slot with reels
  and Atlases. It keeps developing if you close it, and the notice offers a way
  back.

In the Artifact edition the same content rules apply, without the catalogue
check.

## A film's verbs

Press and hold a film to see what you can do with it. A right-click, the
ContextMenu key or Shift+F10 does the same. This works on the stage, the reel's
list and the constellation's stars.

The verbs:

- *Collide with…*
- *Explore its connections*
- *Borrow its qualities*, which opens the film's Light Table qualities
- *Watched it?*
- *Like*
- *Save for later*
- *Replace this film*

Every existing button stays where it was; the verbs are a faster path, not a
replacement. In your sky, a selected star offers *Collide it with another film*.

## The room takes the film's light

The page takes its light from the film on screen:

- **A colour per film.** Each film of a reel lends the room one colour of the
  reel's palette. A colour too dark to read as light is lifted toward the
  palette's brightest one. The change glides over about a second.
- **Warmth.** The room warms a little for a film you have liked.
- **The projector.** A soft beam and a little film grain fall across the
  stage's image.

The beam and grain stop when motion is paused or reduced, and are hidden on
phones. The Lobby carries the same colour into the cinema, behind the film's still (see
[the picture palace](picture-palace.md)).

## Ticket stubs

Logging a new afterimage (*Watched it?*) prints a ticket stub. It carries:

- the film;
- the qualities that stayed;
- your line;
- the night you watched it;
- a stable six-digit number;
- which film this is in your journal ("your 3rd film").

Stubs collect in your sky, beside each film's star. Stubs are drawn from the
afterimage journal that already exists, so nothing new is stored.

## One sky

Moving between depths zooms instead of cutting:

- opening a film's Atlas zooms in from the film you chose;
- opening your sky from a reel zooms out;
- choosing a reel or Atlas in your sky zooms back in.

The zoom uses view transitions where the browser has them. Otherwise, when
motion is paused, or for reduced motion, the view simply changes.

## In each edition

| | Server routes | GitHub Pages + Railway companion | claude.ai Artifact |
| --- | --- | --- | --- |
| One question | Film suggestions | Film suggestions once unlocked | Typed answers and the sentence |
| Eye Test frames | TMDB stills | TMDB stills once unlocked | Painted from each film's colours |
| Developing reel, Atlas, collision | Yes | Yes | Yes |
| Collisions | Catalogue-verified | Catalogue-verified | Content rules only |
| Verbs, room light, stubs, zoom | Yes | Yes | Yes |

## Validation

- **Tests.** Site tests: 146. Companion tests: 124. They include:
  - the partial-JSON reader on every prefix of a real answer;
  - drafts in the job store (never persisted);
  - Claude Code's stream events, including thinking and subagent events, which
    are never read as the answer;
  - the API stream with a fallback;
  - the collision contract, prompt, effort cap, routes and in-page answers;
  - the entrance, Eye Test, room light and ticket helpers.
- **Builds.** TypeScript, lint (no errors), `npm run build`, `npm run
  build:pages` and `npm run build:artifact` all pass.
- **Claude Code versions.** The stream events were checked with Claude Code
  2.1.286 and with 2.1.284, the version the Railway image pins. Both stream the
  structured answer as `input_json_delta` events of the `StructuredOutput`
  tool.
- **In Chromium, Pages build.** At desktop and phone sizes, against the
  companion running real Claude Code 2.1.286 with a local stand-in API that
  streams its answers:
  - the entrance and its suggestions;
  - the Eye Test;
  - a reel developing film by film;
  - collisions by dragging and through the verbs;
  - right-click, Shift+F10 and long-press verbs;
  - the room's light and warmth;
  - a printed ticket stub;
  - the zooms;
  - an Atlas developing.

  No page errors.
- **In Chromium, Artifact build.** With a streaming stand-in for `sample`:
  - painted Eye Test frames;
  - a streamed reel;
  - a collision from the verbs.
- **Not verified here.** A live Claude answer streaming through Railway, and
  the zoom in browsers without view transitions (they change views without
  animation).
