# 0022. Visual language v2: compact, flat, hairlines and value colour

- Status: Accepted
- Date: 2026-10-01
- Supersedes: 0018 (visual language)

## Context

The palettes and the structure from ADRs 0016 and 0018 work. The look reads
as a Material-style app: tinted cards everywhere, large radii, pill
selectors, many boxed highlights, and rarely used actions shown as buttons.
The maintainer wants it simpler and denser, closer to a terminal UI, with
the restraint of native phone design, and with colour that carries meaning.

## Decision

- **Surfaces**: flat. Grouped lists with 1 px hairline separators
  (`outline-variant`) replace most tinted cards; a card tone is kept only for
  the hero and for overlays. Still no shadows, and no translucency or blur.
- **Shape**: radii 4/6/8/12 px; pills only for the tab bar, the add button
  and chips.
- **Density**: compact by default (40 px rows on desktop, 44 px touch targets
  on phones, which still meets WCAG 2.2 target size). Mono figures with
  tabular numbers for every amount.
- **Controls**: shadcn toggle groups replace pill segmented selectors;
  switches, not chips, for settings. Rarely used actions (rename, move to
  another pool, archive) go into an overflow menu.
- **Value colour**: negative amounts use `negative`, positive `positive`,
  transfers `info`. The sign and an arrow are always shown as well, so meaning
  never depends on colour alone. Categories get a colour (from the palette's
  accents, so contrast is fitted) and a Lucide icon. Charts colour series by
  category.
- **Phone navigation**: a floating pill tab bar, flat (card-raised tone and a
  hairline), with a separate round add button beside it. Desktop uses a
  sidebar.
- **Loading**: skeletons shaped like the content, never spinners for a page
  or a card.

## Consequences

- Every view is restyled again; structure and routes from the M2 shell and
  the redesign stay.
- The hero's worst state may use `negative` (no longer limited to a soft
  rose), always with the sign shown.
- Category colour and icon need a migration and API fields.
