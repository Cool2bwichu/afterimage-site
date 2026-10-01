# Atlas film selection — 2026-10-01

## Safari follow-up

The first repair handled a missing blur destination but did not cover Safari
moving focus back to the enclosing modal dialog. On a freshly reloaded version
29, native Safari clicks on Paris, Texas and a Harry Potter release still
dismissed the results without selecting a film. The search field remained
unchanged and Develop Atlas stayed disabled.

Primary mouse-down on a result or retry button now preserves the input's focus
until click. Other pointer targets, keyboard focus, and touch scrolling keep
their existing behavior. This does not start generation on mouse-down or change
the selected release's canonical ID.

Sites version 30 published this follow-up from
`03316ef14922467030f0fbfc6d17a61853ac197b`. After reloading the live release,
a native Safari click selected Paris, Texas (1984): the query changed to its
canonical title, the status read "Ready to explore Paris, Texas (1984)", and
Develop Atlas became enabled. The existing Midsommar map, saved Atlas URL,
and nine-map trail remained intact. Generation was not started in this check.
Seven focused lookup/Atlas tests, TypeScript, focused lint (one existing image
advisory), and the production build passed. No physical touch-device test was
performed for this follow-up.

## Original repair and checks

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
