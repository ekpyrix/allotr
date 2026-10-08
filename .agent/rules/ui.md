# Rule: web UI

Accepted in [ADR 0026](../../docs/adr/0026-visual-language-v3.md),
[0027](../../docs/adr/0027-navigation-v3.md) and
[0028](../../docs/adr/0028-ui-foundation-v2.md). The full spec is
[docs/ui.md](../../docs/ui.md). Read it before you touch `apps/web`.

## Always

- Build components on **React Aria Components**, styled from theme role
  tokens (docs/ui.md §2.1). Do not add Radix, cmdk, Recharts, Motion or
  lucide-react.
- Use **only theme roles** for colour. No hex values, no alpha or `opacity`
  on surfaces, no `box-shadow` for depth, no `border-radius`.
- **Interface text is monospace** (`--font-num`, default Geist Mono): buttons,
  tags, titles, headers, tabs, labels, menus, numbers. Only content text
  (names, detail values, notes) uses `--font-ui` (default Geist).
- Size everything in `rem` from the design px in docs/ui.md §2.3. The root is
  `font-size: 85%`. Never use CSS `zoom`.
- Lay out with **container queries** on the app frame (600 / 1000 for the
  shell, 720 / 1100 / 1500 for tile grids), not viewport media queries.
- **Tiles run edge to edge.** Seams come from each tile's 1 px outline, and
  empty cells show `canvas`. Never put margins or gaps between tiles.
- **One line per row.** Truncate with an ellipsis. At narrow widths hide
  columns through the row's column template.
- **Every choice is an in-app menu** (popover at ≥ 600, bottom sheet below).
  Never render a native `<select>`, date, time or colour input.
- **No visible drag handles.** Reorder by dragging the item itself (long press
  on touch), with keyboard drag-and-drop and arrow buttons or menu items as
  alternatives.
- Format every amount with the one money formatter (symbol by default).
  **Never sum, convert or derive money in the web app.** If a screen needs a
  total, add it to the API (docs/ui.md §8).
- Charts come from the in-house SVG kit: monotone curves, exact bars, HTML
  labels, `role="img"` with a text summary.
- Motion is CSS only: instant tab switches, `snappy` for press feedback and
  floating panels, all respecting reduced motion.
- Icons are Remix Icon 4.5.0, compiled from the pinned package. Category icon
  keys stay as stored, mapped as in docs/ui.md §7.
- Customisation features from ADR 0029 (tab order, top bar, dashboard
  layout, layout sync, fonts, currency display) are **not** part of the
  rebuild PRs.

## Tests for any UI change

- Playwright at 390, 820 and 1440 px with axe, plus a keyboard path for the
  change.
- Update screenshot baselines on purpose only, and say why in the PR.
- Unit or property tests for any new pure helper (chart maths, column
  templates, formatter).
