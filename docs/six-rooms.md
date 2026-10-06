# Six New Rooms, as the page drew them, 6 October 2026

Other recommenders track what you click. AFTERIMAGE tracks what stays with you. The six
rooms below come from the proposals page "Six New Rooms", and each one now works the way
its mockup did. They keep the observatory's own look and use the bridge the site already
has: every request is one the bridge already answers, so there is no new backend contract.

| Room | Where you meet it | Code |
| --- | --- | --- |
| [Blind Screening](#blind-screening) | *Blind screening* on the entrance | `app/lib/blind.ts`, `app/components/blind-table.tsx` |
| [The Credits Question](#the-credits-question) | *Ask the credits question* on the entrance | `app/lib/credits-question.ts`, `app/components/credits-question.tsx` |
| [Half-life](#half-life) | On returning to the site, and in your sky | `app/lib/half-life.ts`, `app/components/check-in.tsx` |
| [Terra Incognita](#terra-incognita) | *Unexplored* in your sky | `app/lib/terra.ts`, `app/components/terra.tsx` |
| [The Film Between Us](#the-film-between-us) | *Choose for two* on the entrance, or an invitation link | `app/lib/between.ts`, `app/components/between-us.tsx` |
| [The Lobby](#the-lobby) | *Watch it tonight* on any film | `app/lib/screening.ts`, `app/components/lobby.tsx` |

## The look

The rooms keep the observatory's night, as the page drew it: ink and chamber navy
(`#080d14`, `#101923`), starlight gold (`#dec6a0`) and silver (`#9cbbb9`), Cormorant for
what is said and DM Sans for what is done, pills for choices, and DM Mono only for clocks
and counts. `app/rooms.css` holds every room. Each animation stops when motion is paused
or the system asks for reduced motion.

## Blind Screening

The reel arrives as moments, one at a time, with every title, year and name drawn out of
them, so you choose on what a film is like. *I'd go in* opens the iris on what it was;
*Show me another moment* moves on. *Lift the veil* shows the rest at once. Stored in
`afterimage:blind:v1`.

## The Credits Question

Not "what do you like?" but "where do you want to be when the credits roll?" Two lights
sit on a map of moods that runs heavy to light and still to charged: *Now* and *At the
credits*. Drag them, tap the map, or move them with the arrow keys (Shift for bigger
steps); the nearest word is the one Afterimage hears. Four common journeys are one tap
away. Choose one film or a double feature, and the programme says what each film does
for the evening, with an intermission between the two. The route is written into the
brief, and the reel shows it above the films. For a double feature the first two films
are the pair, and *Watch the double feature tonight* takes both into the Lobby.

## Half-life

A day, a week, a month, three months and a year after a film enters the journal, one tap
says whether it is gone, still there or stronger. The answer is thanked and shown on a
*Still with you* chart of every film in the journal, answer by answer, with a line on
what the latest answer means. Answers brighten or dim the film's star in your sky. The
check-ins appear when you come back to the site, and can go in your calendar as one
reminder each (`.ics`), because there is no push server. A year's question waits up to
425 days, then the film has settled. Stored in `afterimage:half-life:v1`.

## Terra Incognita

Your sky as a map, with the films you know as stars and up to five dark places at its
edges: a region, a decade and a form you haven't reached, taken in turn from the
catalogue's records of your films. Choose one and it opens a door: one film to start
with, found through a film you love (or one that stayed with you), so the first step
never feels like homework. *Find the door* draws an Atlas around that film with the dark
place as its request; back in your sky, the door shows the film it found and *Open the
map*. *A whole reel from there* asks for a reel instead. *The whole chart* keeps the full
map of regions, decades and forms. Lookups are cached in `afterimage:terra:v1`; where
the catalogue can't be reached, as in the Artifact edition, it charts what is already
known.

## The Film Between Us

Three films each, on one screen or through a link that carries only the inviter's name
and three films in the address itself. Your films make a gold constellation and theirs
a silver one; *Bring your skies together* draws them in. Where they meet, the one film in
the overlap comes into focus, with what it takes from each sky and one thing to watch
for. *Watch it together* takes it into the Lobby. *Or a whole reel between you* asks for
five films for both of you instead.

Finding the one film is an ordinary collision. A collision holds two dated films, so one
from each side stands for its sky; the brief names all six and says whose is whose, and
the other dated films are passed as films already shown, so none of the six can be the
answer. A side needs one film with its year: chosen from the suggestions, or typed, like
*Aftersun 2022*. Change a film and the skies part again. Close the room while it looks,
and a note at the foot of the page leads back to it.

## The Lobby

*Watch it tonight* walks you into a cinema. The Lobby gives the time the credits will
roll if the lights go down now, and can add a second film after an intermission. After
*Lights down*, a short ritual sets the room (the lights, the sound, your phone, one thing
to watch for that spoils nothing), then the site dims to a quiet clock for the film's
running time. *Step out* and you come back to your seat. When the lights come up, the
usher asks what stayed while the feeling is warm, and *Print my stub* keeps a ticket in
the afterimage journal and starts the film's half-life. The screening is kept in this
browser (`afterimage:screening:v1`) and let go 18 hours after its credits would have
rolled. Nothing assumes you watched a film because a timer ran out: the usher asks.

## The bridge

| Room | Endpoint | Request |
| --- | --- | --- |
| Blind Screening | `/api/generations` | The usual request; the veil is drawn in the browser |
| Credits Question | `/api/generations` | No films; the route in the brief |
| Half-life | `/api/generations` | Films that grew stronger, as references |
| Terra Incognita | `/api/atlas/generations`, `/api/generations` | The door: an Atlas around a film you love, with the dark place as its request; or a reel from there |
| Film Between Us | `/api/collisions/generations`, `/api/generations` | Two stand-in films, all six in the brief, the others ruled out; or a reel for two |
| The Lobby, Terra | `/api/films/enrich` | Running times, stills, regions |

Each brief stays within the 1,200-character limit whatever is typed, and tests check the
worst cases. Missing credentials surface as the site's usual connection errors, never as
a pretend answer.

## What changed on the way back

The site had grown into a "picture palace" and taken in four ideas from two later
proposals. Mick preferred the original page, so the observatory look came back, and the
additions went: the Lobby's film still and projector beam, an evening length for the
credits question and for two, the fairness rule for two, and keep one, lose one at the
end of a reel. Each room was then reworked to match its mockup: Blind Screening's
moments and iris, the Credits Question's draggable lights, the Half-life chart and its
year, Terra's map and doors, the two skies of the Film Between Us, and the Lobby's ritual
after the lights go down.

## Validation

- **Tests.** 204 site tests and 125 companion tests pass. `npm run lint` has no errors,
  and `npm run build`, `npm run build:pages` and `npm run build:artifact` all build.
- **In the browser.** Every room was walked through on desktop (1440 × 900) and phone
  (390 × 844) against a stand-in for the bridge. Live answers from the real bridge are
  still untested; the Film Between Us in particular relies on the bridge reading the
  brief to know whose films are whose.
