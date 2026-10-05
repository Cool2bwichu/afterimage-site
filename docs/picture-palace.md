# The picture palace: seven rooms and a new look, 5 October 2026

Other recommenders track what you click. AFTERIMAGE tracks what stays with you. The
rooms below came from the proposals page "Six New Rooms", and they were then folded
together with the best parts of two later proposals, "The Living Cinema" and "Beyond the
Frame". They all use the bridge the site already has: each room writes an ordinary reel
request, so there is no new backend contract.

| Room | Where you meet it | Code |
| --- | --- | --- |
| [The Lobby](#the-lobby) | *Watch it tonight* on any film | `app/lib/screening.ts`, `app/components/lobby.tsx` |
| [Half-life](#half-life) | On returning to the site, and in your sky | `app/lib/half-life.ts`, `app/components/check-in.tsx` |
| [The credits question](#the-credits-question) | *Ask the credits question* on the entrance | `app/lib/credits-question.ts`, `app/components/credits-question.tsx` |
| [Blind screening](#blind-screening) | *Blind screening* on the entrance, or *Develop the next one blind* at the end of a reel | `app/lib/blind.ts`, `app/components/blind-table.tsx` |
| [Terra incognita](#terra-incognita) | *Unexplored* in your sky | `app/lib/terra.ts`, `app/components/terra.tsx` |
| [The film between us](#the-film-between-us) | *Choose for two* on the entrance, or an invitation link | `app/lib/between.ts`, `app/components/between-us.tsx` |
| [Keep one, lose one](#keep-one-lose-one) | The end of a reel | `app/lib/keep-lose.ts`, `app/components/keep-lose.tsx` |
| [The evening's length](#the-evenings-length) | The credits question and the film between us | `app/lib/evening.ts`, `app/components/evening-picker.tsx` |

## The look

The observatory became a picture palace for one: a warm-black auditorium under a starry
ceiling, one screen where the film is the only light, and the small print of a cinema
for everything else. `app/palace.css` owns type, colour and light; `app/rooms.css` holds
the rooms built with them.

- **Type.** Big Shoulders is the billing block (titles, the marquee). Newsreader is the
  voice (reasons, questions, the usher). Archivo is for controls. IBM Plex Mono is the
  booth's typewriter (kickers, running times, timecodes).
- **Colour.** Void `#0c0a08`, gold `#dec6a0`, velvet `#7a1d24`, marquee `#f2b55c` and
  screen white `#f8f1e4`. Film imagery supplies everything brighter.
- **House lights.** The page is lit, at half while a reel develops or you wait in the
  Lobby, and dark while a film plays (`data-house` on the world).
- **Motion.** Every animation stops when motion is paused or the system asks for reduced
  motion.

## The Lobby

*Watch it tonight* walks you into a cinema:

- The film's still fills the back of the room. The room takes the film's colour from the
  reel's palette, as the reel itself does.
- The Lobby gives the time the credits will roll if the lights go down now, a short
  ritual (the room, the sound, your phone, what to watch for), and an optional double
  feature with a 10-minute intermission.
- After *Lights down* the site goes quiet under a projector beam. *Step out* and you come
  back to your seat. When the credits roll, the usher asks what stayed, and each film
  can keep a ticket in the afterimage journal.

The screening is kept in this browser (`afterimage:screening:v1`) and is let go 18 hours
after its credits would have rolled. Nothing assumes you watched a film because a timer
ran out: the usher asks.

## Half-life

A day, a week, a month and a season after a film enters the journal, one tap says
whether it is gone, still there or stronger. The answers brighten or dim the film's star
and draw its half-life in your sky. Check-ins appear when you come back to the site, with
an optional calendar reminder (`.ics`), because there is no push server. Stored in
`afterimage:half-life:v1`.

## The credits question

Not "what do you like?" but "where do you want to be when the credits roll?" You place
two lights on a map of moods (where you are now, and where you want to end up) and say
whether it's one film or a double feature. The route is written into the brief, and the
reel shows it above the films. For a double feature, films I and II are the pair, and the
Lobby can screen them together.

## Blind screening

The reel arrives veiled: titles, years and names are drawn out of its own words, so you
choose on what a film is like. The veil lifts on the film you choose, or all at once if
you lift it. Stored in `afterimage:blind:v1`.

## Terra incognita

Your sky charts where it hasn't reached, by region, decade and form, from the
catalogue's records of the films you know. A decade with one film doesn't stand as tall
as one you know well. Each blank is a door to a reel. The catalogue lookups are cached in
`afterimage:terra:v1`. Where the catalogue can't be reached (as in the Artifact edition),
it charts the films whose records are already known and says the rest can wait.

## The film between us

Three films each, on one screen, or through a link that carries only the inviter's name
and three films in the address itself. The brief says whose films are whose, and it
judges each film by **whichever of the two it suits less**. So a perfect fit for one
person never makes up for a poor fit for the other. Each reason says what each person
will find in the film. Long titles are shortened in the brief (the films themselves are
sent in full), so the instructions always fit.

## Keep one, lose one

At the end of a reel, its four qualities (where it lives, how it feels, how it looks, how
it speaks) each get a light. If the reel has no fingerprint, its sensibilities stand in.
Mark one to keep, and it lights up. Mark one to lose, and it goes into eclipse. *Turn the
reel* asks for five new films that hold on to the first and leave the second behind,
without simply swapping in its opposite. The five films just seen are left out, and the
new reel's heading says what was kept and what was lost.

## The evening's length

The credits question and the film between us can say how long the evening is: any
length, 1½, 2, 3 or 4 hours. A double feature needs three hours or more, so the shorter
lengths are ruled out, and choosing a double stretches a short evening to three hours.

The bridge can only be asked, so the site checks the answer. Once the catalogue's
running times arrive, a film that runs more than five minutes past the evening says so
on the screen and in the reel's index. For a double feature, the route strip gives films
I and II's running time together with the intermission, and says whether it fits.

## The bridge

Every room sends what the bridge already accepts:

| Room | Endpoint | Request |
| --- | --- | --- |
| Credits question | `/api/generations` | No films; the route (and evening) in the brief |
| Film between us | `/api/generations` | Up to six films; names, fairness and evening in the brief |
| Keep one, lose one | `/api/generations` | No films; the turn in the brief; the reel's five films excluded |
| Terra incognita | `/api/generations` | No films; the unexplored region in the brief |
| Half-life | `/api/generations` | Films that grew stronger, as references |
| Blind screening | `/api/generations` | The usual request; the veil is drawn in the browser |
| The Lobby, Terra | `/api/films/enrich` | Running times, stills, regions |

Each brief stays within the 1,200-character limit whatever is typed. Tests check the
worst cases. Missing credentials surface as the site's usual connection errors, never as
a pretend reel.

## What was folded in, revised or left out

- **From "The Living Cinema":** the film's still in the Lobby, the room taking the
  film's colour, the projector beam, an evening length the films must fit, and the
  fairness rule for two. Its navy-and-serif look was not adopted. The picture palace
  stays.
- **From "Beyond the Frame":** Taste Eclipse ("keep what matters, lose a habit") became
  keep one, lose one. Two of its ideas were left out:
  - The Unmade Film shows an imagined scene, then hands you different real films.
  - Continuity Doors needs hand-authored hotspots on licensed stills.
- **Revised from "Six New Rooms":**
  - Blind screening hides names instead of showing a timecode.
  - Half-life check-ins appear when you return, instead of as notifications.
- **Scrapped from "Six New Rooms":**
  - "Where tonight, honestly", because there is no streaming-availability data.
  - Sound and haptics.

## Validation

- **Tests.** Site tests: 206, including the evening, fairness and keep one, lose one
  helpers, and every room's brief limit.
- **Builds.** TypeScript, lint (no errors), `npm run build`, `npm run build:pages` and
  `npm run build:artifact` pass.
- **In Chromium, Pages build.** Every room was checked at 1440×900 and 390×844 against a
  mocked bridge. This included the Lobby with photographic stills, the dark room,
  intermission and usher, both evening pickers, the long-film flags and keep one, lose
  one.
- **Not verified here.** Live answers from the bridge, which needs the private bridge
  configuration.
