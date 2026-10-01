# Atlas film selection — 2026-10-01

The search form previously dismissed its results on every blur outside the form,
including a blur with no focus destination. A browser that does not focus a
clicked result button can remove that button before its click is delivered.

Dismissal now uses outside pointer events and explicit keyboard focus departure.
A missing focus destination leaves the result mounted for its click. Escape,
result buttons, canonical release IDs, and the Develop Atlas action are preserved.
No click delay or touch-scroll prevention is introduced.

Focused verification used real TMDB Harry Potter lookup results in an isolated
local browser. The non-focusing mouse sequence failed before the change and
selected the correct release afterward. Full-title selection, keyboard
ArrowDown/Enter, outside dismissal, and a 390px layout also passed; no horizontal
overflow appeared. Seven relevant lookup/Atlas tests and TypeScript passed.
This browser check is not a physical Safari or touch-device test.

Sites version 29 published the repair from `bbb582f`. A subsequent real selection
of Harry Potter and the Goblet of Fire (2005) submitted canonical TMDB ID 674 and
developed a new Atlas with six verified connections on GPT-6.1 Sol/medium/V2.
The resulting map rendered and received its own saved Atlas URL. A separate
five-film request also completed on Sol 6.1. Both results passed the frontend
parsers. The Atlas took 265.634s and the reel 113.782s in these single checks;
this release does not establish faster generation than Terra.
