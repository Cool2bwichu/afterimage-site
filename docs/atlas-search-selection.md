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
