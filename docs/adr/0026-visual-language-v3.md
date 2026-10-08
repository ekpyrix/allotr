# 0026. Visual language v3: a terminal interface on the user's palette

- Status: Accepted
- Date: 2026-10-09
- Supersedes: 0022 (visual language v2)

## Context

ADR 0022 made the web app flat and compact. In daily use it still had
problems:

- The phone top bar was mostly empty space.
- Desktop had wide margins and a centred column.
- Resizing the window did not reflow cleanly.
- The rounded floating dock looked out of place.
- Translucent layers were hard to tell apart.
- Long pages (Budget) mixed several sections in one scroll.
- Report rows wrapped onto a second line on phones.

Themes are already terminal palettes (ADR 0016). The maintainer wants the
interface itself to read like a terminal application, while staying
mouse-first, touch-friendly and WCAG 2.2 AA.

A clickable prototype went through eight review rounds before this
decision. The [UI reference](../ui.md) describes the result.

## Decision

- **Shape**
  - Flat and square. No radius anywhere, no shadows, no blur.
  - Nothing is translucent. Every surface is an opaque fill from the theme.
- **Tiles**
  - Content sits in edge-to-edge tiles split by 1 px `outline-variant` seams.
    There are no outer margins or gutters.
  - Each tile has a solid title bar (`chrome`).
  - Tiles in a row stretch to the same height, and the last tile fills to the
    bottom.
  - Any grid cell left empty reads as a blank tile in the canvas colour, never
    as the seam colour.
- **Type**
  - The interface is set in a monospace face (default Geist Mono): buttons,
    tags and indicators, titles and subtitles, headers, tabs, labels, menus,
    every number, and the command line.
  - A proportional face (default Geist) is used only for content text: names
    in rows, values in detail panels, paragraphs and notes.
  - Numbers use tabular figures.
- **Scale**
  - The interface renders at 85 % of the browser's default size. The root is
    `font-size: 85%` and every size is in `rem`, so the user's own browser
    text size still applies.
  - Phones use smaller type and shorter rows, and truncate text with an
    ellipsis rather than wrapping.
- **Density**
  - One-line rows. Columns that do not fit at a width are hidden rather than
    wrapped.
  - Long labels end in "…".
- **Selection and emphasis**
  - Selected navigation, sub-tabs, toggles and menu rows use a solid
    `primary` fill with `on-primary` text.
  - The primary action of a strip (for example **+ new**) is a filled button.
  - Other actions are bracketed text buttons (`[pay]`), and rare actions sit
    in a `⋮` menu.
- **Value colour** (kept from 0022)
  - Negative amounts are `negative`, positive amounts `positive`, transfers
    `info`.
  - Amounts always show a sign and an arrow as well, so the meaning never
    relies on colour alone.
- **Data is drawn, not approximated**
  - Bars are drawn to their exact width, with a 1 px tick for even pace.
  - Charts have real axes and are smoothed with a monotone curve, so the line
    never shows a value outside the data.
  - "Left of" progress bars show what remains.
- **Categories**
  - Each category has an icon and a series colour.
  - Parent categories fold with a handle and add up their subcategories.
- **Currency**
  - Every amount shows its currency symbol by default ($12.50, €18.00).
- **Theme roles**
  - The look is built only from the existing ADR 0016 roles, so the theme
    file format does not change.

## Consequences

- Every view is rebuilt again. The routes, data layer and draft and model
  modules carry over.
- No new theme roles. Text that was "faint" in the prototype uses
  `text-muted`, so it still passes AA. Purely decorative strokes (tree lines,
  bracket glyphs) use `outline`.
- Phone targets shrink with the 85 % scale. The smallest interactive rows stay
  above the WCAG 2.2 minimum target size (24 × 24 CSS px).
- Screenshot tests at phone, tablet and desktop widths guard the seams and the
  lined-up rows, because these break silently.
