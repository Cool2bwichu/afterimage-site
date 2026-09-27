# Your AFTERIMAGE collection

The top-right **Your reel** dropdown is shared by the landing page, reel workspace, and Atlas. It links to the current reel, My Atlases, My reels, Saved films, Liked films, the last visited Atlas, and the beginning. It uses ordinary links, supports modified clicks, closes on outside click or Escape, and supports Tab and arrow-key navigation. Native collection dialogs retain focus and browser Back navigation.

## Saved destinations

- `#atlases`: searchable Atlas collection. `#atlas=<saved-map-id>` opens that exact map, retaining its lens and selected connection. The older `#atlas` link still opens the active map. Missing maps show the collection with an explanation; they never start generation automatically.
- `#reels`: searchable completed reels. `#reel=<saved-reel-id>` restores an existing reel and its original accepted request, editable inputs, borrowed qualities, verified metadata, and selected film. Switching reels is blocked while a generation or film lookup is active.
- `#library` and `#likes`: existing watchlist and taste collections. Import/export and exploration remain available.
- `#current` and `#home`: current workspace and landing page.

## Persistence and limits

Atlases remain in `afterimage:atlas:trail:v1` (12 recent maps). The Atlas workspace owns this state; the page receives a read-only snapshot for navigation. Starting over now leaves the Atlas collection intact.

`afterimage:reels:v1` keeps up to 20 completed reels locally. The existing current reel is captured on first load. Subsequent completed results are retained automatically; metadata, selections, and input edits update the same record. The result and its accepted input define a reel's identity, so changing a draft does not rewrite recommendation provenance. Pending jobs are never archived or restored. Existing reel parsers validate all records. Writes merge with the latest local history; storage failures are reported.

History stays in this browser, not a cloud account. Reels overwritten before this feature existed cannot be recovered. “Start over” clears the current workspace while preserving Atlases, archived reels, saved films, and Likes.

## Validation

Six focused tests cover migration, original-request provenance, selected-film reload, cross-reel borrowed qualities, deduplication, corrupt/pending record rejection, bounded history, and link parsing. The full suite has 104 passing tests. Browser checks cover desktop and mobile navigation, reopening a non-active Atlas by ID, reload, Saved/Liked tabs, restoring a different reel, retaining collections after Start over, arrow-key focus, and Escape dismissing the dropdown without closing Atlas. A local pending-job check confirmed that an archived-reel link opens the collection with switching disabled and preserves the active job.
