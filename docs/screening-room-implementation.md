# Screening Room implementation — 27 September 2026

Base checkpoint: `8073db4`, reconciling published version 22 (`7950fe5`) with GitHub documentation.

Terra Medium remains the model. No further model trials or default switch are planned.

Creative direction: a selected film occupies a wide projection stage, with a five-film index beside it. Details open in a warm paper reading space. A compact, in-flow Light Table sits directly below the stage; expanding it moves content rather than covering it. Mobile stacks the image and caption and turns the index into a touch-friendly strip.

Tokens: charcoal #101211, ivory #F3EFE6, paper #EEE8DD, reading ink #20231F, ember #B7422C, secondary #AAA99F. DM Sans establishes film titles and controls; Cormorant Garamond adds reflective editorial passages. Left-aligned controls and text follow the image edge.

```text
AFTERIMAGE                                 Reel / Atlas / Library
Request in one editable line
[                           ][ 1 Selected film                 ]
[      Selected still       ][ 2 Film                          ]
[                           ][ 3 Film                          ]
[ Title + credits + actions ][ 4 Film                          ]
[                           ][ 5 Film                          ]
[ Light Table: four channels, compact until opened             ]
[ Why this film belongs          | What to watch for           ]
```

Review against the brief: paper and ember are deliberate parts of the approved projection/journal direction. They will not become generic dashboard cards. The defining feature is real film imagery and the changing relation between film, interpretation and borrowed quality. Numbering represents the five ranked recommendations. No new animation or component dependency is needed.

Preserve: saved reel/input identity, four-channel provenance, Likes, search, Atlas history, pending-job recovery, previous-reel display, reduced motion and focus return. Validate metadata ambiguity and release dates with behavior tests; inspect actual desktop/mobile compositions and keyboard flows.


## Implemented discovery improvements

- A five-film stage and index with a reason visible immediately; selected film survives refresh by identity.
- A paper dossier and two-film comparison. A shared comparison lens reveals only fit, world, feeling, image, or voice at a time; both films stay visible on mobile.
- Borrowing keeps source provenance and offers Undo. Borrowed qualities persist as a separately versioned blend draft, with their labeled source, including Atlas discoveries and films subsequently replaced. Legacy selections still use reel/Atlas validation.
- A separate local watchlist, library search, JSON backup/import, and existing Likes. Saving for later does not silently imply that the film has been seen or liked.
- One-film replacement uses one model response, verifies the candidate and canonical duplicates, and retains four cards and reel framing. The accepted request and job survive refresh; the previous reel remains visible on failure. An immediate Undo restores the prior reel.
- Atlas has a mobile film-list presentation alongside its existing map, lenses, connections, and saved trail. Opening the Atlas library does not automatically launch generation.
- Catalog IDs now survive film search and Atlas requests. Adjacent release years are accepted only when the catalog corroborates that year, and ambiguous matches require a user choice.
- Terra Medium remains the production choice. Prompt changes prioritize explicit positive/negative constraints, useful variation only along open dimensions, and distinct concrete explanations. V3 stays opt-in.

## Evidence and limits

The design references and engine reviews are in the task's research outputs. Mobbin was attempted but its connector requires a paid plan, so no Mobbin screens are represented as inspected. The local visual review uses real Terra pilot recommendations and verified existing film images. No calibrated confidence or fabricated fit percentages are shown. The film hash links restore records from the saved reel in the same browser; they are not public shared reels.

Automated validation: 85 site tests, TypeScript, and lint (native-image advisory warnings only); 134 bridge tests plus syntax checks. Native image tags use TMDB's sized image URLs; no new package dependency was introduced. Desktop and mobile behavior is checked in the browser. Physical-device performance and comparative preference quality are not established by these checks.

Deferred follow-ons: provider/region availability, optional after-watch feedback, public shareable programs, and an on-demand detail generation contract. These require their own data/lifecycle work; this release preserves the existing complete five-film contract.
