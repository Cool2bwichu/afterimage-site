# Cinematic landing page

The entrance extends the existing Atlas palette and typography: green-black, ivory, aged gold, Cormorant Garamond and DM Sans. A verified After Yang still leads into a clear start action, optional mood prompts, and a user-controlled introduction to reels, the Light Table and Atlas. Supporting illustrations use verified Columbus and In the Mood for Love stills. All examples are explicitly illustrative; they never become a user's reel or trigger generation.

Reference observations and image provenance are recorded in the parent workspace's `docs/design/landing/research-and-direction.md`. References: [Siena Film Foundation](https://siena.film/), [/nk.studio](https://www.nk.studio/), [The Cinema in the Power Station](https://www.olympicstudios.com/pages/the-cinema-in-the-power-station). Their visual principles informed the direction; no reference-site assets or implementation were copied.

## Behavior

- Fresh visitors see the welcome page. Saved reels, requests and accepted jobs reopen directly.
- Begin opens the existing composer. Mood starters prefill the prompt and focus it without sending a request. For an empty request, this entry uses Light Table unless `experience=standard` is explicitly selected. Existing requests and the default V2 recommendation engine remain intact.
- The AFTERIMAGE title is an in-page home control: return to the current reel if one exists, otherwise to the landing page. Unfinished inputs are retained. Atlas's brand closes to the reel using its established Back behavior.
- Start over clears the current work and returns to the welcome page, preserving Likes.
- `welcome=1` is an explicit way to inspect the landing page while a reel exists. Its primary button returns to that reel and removes the query flag. It never replaces saved work; active generation continues to take precedence.
- Interactive examples use isolated component state. Tabs support arrow keys and Home/End. Reduced motion suppresses the content fade. Real stills have text fallbacks; supporting images load lazily.

## Validation

71 existing Site tests, TypeScript and the final production build passed. Lint has zero errors and six native-image advisories (one added for the new shared still renderer). Browser checks in an isolated session verified prompt starters without generation, tab/quality/connection interactions, keyboard controls, reduced motion, focus, draft preservation, saved-request reload, Start over with Likes retained, and both brand return paths. No actual recommendation was requested by these UI checks.

Fresh 1440px desktop and 390px mobile images are under the parent `output/playwright/landing-*.png`; additional 320/768/1440 width checks cover horizontal overflow and primary touch targets. The temporary development Link import was removed after a preview dependency/HMR error; final browser checks recorded no application runtime errors. Native home controls keep the operation within the existing stateful page.

This landing-page checkpoint is local for review. Published Site version 17 contains the approved Atlas trail, line styling and connection-prompt refinements.
