# Persistence of Vision, 10 November 2026

AFTERIMAGE tracks what stays with you. Until now it never showed it: a film with no
catalogue image was an empty orb, a reel was a list, and a history of reels, Likes and
afterimages said nothing back. These three additions give what stays a picture. All of
them are drawn in the browser from what the site already holds, so they work in every
edition and ask nothing new of the bridge.

| What | Where you meet it | Code |
| --- | --- | --- |
| [Plates](#plates) | The reel's stage and index, the one-sheet, the notes | `app/lib/plate.ts`, `app/components/film-plate.tsx` |
| [The one-sheet](#the-one-sheet) | *See the one-sheet* on a reel's constellation | `app/lib/one-sheet.ts`, `app/components/one-sheet.tsx` |
| [Notes on a viewer](#notes-on-a-viewer) | *Notes on a viewer* in your sky and at the end of a reel | `app/lib/notes.ts`, `app/components/viewer-notes.tsx` |

The styles for all three are in `app/vision.css`. The room keeps the observatory's night;
these are the things in it that have colour.

## Plates

A plate is a film's afterimage, drawn: a small piece of poster art in flat shapes, grain
and a soft ghost in the complementary colour.

- **What it is made from.** The film's title and year seed the drawing, so the same film
  always develops the same plate. The reel's five colours colour it, and each film of a
  reel leads with a different one. A reel in black and white keeps its plates black and
  white.
- **What it shows.** One of eight motifs: a sun on a horizon, an eclipse, a city, rings, a
  duet, shards, a window, an iris. The words of the film's four qualities choose the
  motif (a film of neon streets draws a city; a film of family rooms draws a window). A
  film with no telling words takes the motif its title lands on.
- **Siblings differ.** Films chosen together share their words, so `reelMotifs` gives each
  film its best motif that no earlier film of the reel has taken.
- **Where it appears.** On the stage when the catalogue has no image for a film (always,
  in the Artifact edition), where it also leaves a ghost when the film changes; as a
  small seal beside each film in the reel's index; in the one-sheet; behind the lines in
  the notes.
- **What it is not.** It is not the film's artwork and never claims to be: the stage
  labels it *Plate · drawn from this film's qualities*. The markup holds only numbers and
  validated colours, never the film's title or words.

## The one-sheet

Every reel gets a cinema poster, 1080 × 1620. The picture is the plate of its first film;
the title is the reel's name; the line beneath is its insight; the three laurels are its
sensibilities; the five films run along a strip of frames; and the foot carries a billing
block set the way a poster's credits are, with small words leading into tall, narrow
names. *Save the one-sheet* saves a PNG (or opens the share sheet on a phone), through the
same path as the star chart. The picture has a full description as its text alternative.

## Notes on a viewer

A film-magazine reading of your own history, in seven sections:

1. **What you ask for, and what stays.** The qualities you borrowed for reels against the
   qualities you marked as having stayed after watching.
2. **The words that return.** Words from your reels' sensibilities and fingerprints that
   have turned up in two or more reels. A word counts once per reel.
3. **Your light.** Every reel's palette as a frame on a strip, in order, read as warm or
   cold, with any drift over time.
4. **The directors in the room.** The directors your reels were named in the spirit of.
5. **What grew, what faded.** The latest half-life answer for each film.
6. **Your decades.** The films you kept (loved or logged) against the films you were
   offered.
7. **The reel of what stayed.** Your own journal lines, in the order you watched, played
   back like the intertitles of a silent film.

The cover line joins the two strongest findings. *Develop a reel from these notes* sends
them as an ordinary reel request: the returning words, what stays, the director who keeps
being named and the films that grew as references, asking for four films that deepen the
pattern and one that argues with it.

**Nothing is guessed.** Each section has a floor, and below it says how much more it
needs instead of making a claim: what stays needs three films with something marked; a
returning word needs two reels; a colour drift needs four reels; decades need five kept
films; a leading quality or decade is named only when it leads outright.

**Privacy.** The notes are counted in the browser each time they open and are stored
nowhere. Nothing leaves the page unless you ask for the reel at the end, and that request
is shown to the bridge like any other, within the 1,200-character brief.

## Validation

- **Tests.** `tests/plate.test.ts`, `tests/one-sheet.test.ts` and `tests/notes.test.ts`
  add 27 tests to the site's 204. Lint has no errors, and `npm run build`,
  `npm run build:pages` and `npm run build:artifact` all build.
- **In the browser.** The Artifact build was walked through in Chromium on desktop
  (1440 × 900) and phone (390 × 844) against a stand-in for Claude, with a seeded
  history of four reels, seven Likes, six afterimages and four half-life answers: plates
  on the stage and in the index, the ghost between films, the one-sheet, every section
  of the notes and the montage playing.
- **Not verified here.** The site with its server and the real bridge, where films have
  catalogue images and plates appear only in the index, the one-sheet and the notes; and
  saving the one-sheet on a real phone.
