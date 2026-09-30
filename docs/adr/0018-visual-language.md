# 0018. Visual language: tonal surfaces, large radii, mono accents

- Status: Accepted
- Date: 2026-09-30

## Context

The M2 web app uses flat tinted "plots", a 4 px radius and a single ochre
accent. The redesign asks for a flat, tonal structure with a physical,
spring-driven feel, terminal palettes and a more natural, human look,
while keeping WCAG 2.2 AA. The earlier direction (2026-09-27) asked for
squircle cards. CSS `corner-shape` is Chromium-only, and SVG masking costs runtime and
complicates focus rings and borders.

## Decision

- **Depth** is tone only: `canvas → card → card-raised` plus `chrome` for
  persistent navigation. There's no `box-shadow`. Overlays use
  `card-raised`, a 1 px `outline-variant` stroke and a scrim.
- **Shape**: plain large radii (6/10/14/20/24/28 px, and pills for buttons,
  chips and indicators), with the nested-radius rule. No squircles.
- **Type**: Geist for the UI, Geist Mono for figures and the command bar,
  on a role-based type scale. The hero uses mono display-hero with tabular
  figures.
- **Layout**: window size classes (compact / medium / expanded / large /
  extra-large), a 4 px spacing grid, 48 px targets, bottom bar → rail →
  drawer.
- **State**: state layers (8/10/10/16 %) and press scale 0.97 on
  tappable cards and buttons.
- **Colour use**: warm accents in light schemes are fills, large text and
  containers, never small text. The hero's worst state is a soft rose, not
  alarm red.

## Consequences

- Every existing view is restyled. The M2 layout code is reused where the
  structure holds (shell, routes, a11y wiring).
- Dark mode needs no shadow tuning, and forced-colours mode keeps working
  because structure never depends on shadows.
- A hairline on overlays is the only border role with no contrast
  requirement. The validator treats `outline-variant` as decorative.
- Squircle cards can come back later as a progressive `@supports
  (corner-shape: squircle)` enhancement without changing tokens.
