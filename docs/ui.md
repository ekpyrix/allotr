# Allotr — UI reference

The web app's design system, components, patterns and screens. Decisions:
[ADR 0026](adr/0026-visual-language-v3.md) (visual language),
[0027](adr/0027-navigation-v3.md) (navigation),
[0028](adr/0028-ui-foundation-v2.md) (foundation),
[0029](adr/0029-ui-customisation.md) (customisation, later),
[0016](adr/0016-palette-themes.md) (themes).

The core promise shapes the whole layout: **left today** is the first thing
on every screen, and savings never count toward it.

## 1. Principles

1. **Terminal, not toy.** Flat, square, opaque. A monospace interface on the
   user's terminal palette.
2. **No dead space.** Tiles run edge to edge and stretch to fill. Empty cells
   are blank tiles, never gaps showing the seam colour.
3. **First things first.** The summary bar (left today · on-budget total ·
   pools) is on every screen.
4. **One line per row.** Truncate with "…" and hide columns at narrow widths.
   Never wrap a row.
5. **Mouse-first, touch-friendly, keyboard-complete.** Every action has a
   pointer target, a touch path (long press for moving things) and a key.
6. **Menus, not pickers.** Every choice opens an in-app menu. Native
   `<select>`, date and colour pickers are never used.
7. **Draw the data exactly.** Real axes, exact bar widths, monotone curves,
   and labels in HTML.
8. **The server owns money.** The web app formats amounts, but every sum,
   balance, projection and series comes from the API (architecture §4).
9. **Colour is never the only signal.** Amounts carry a sign and an arrow.
   Status carries text.

## 2. Tokens

### 2.1 Colour (theme roles, ADR 0016)

The interface uses only existing roles, so the theme format does not change.

| Use | Role |
|---|---|
| Tile and content background | `canvas` |
| Title bars, top bar, sidebar, status line, menus, sheets | `chrome` |
| Hover, selected row, bar tracks, raised controls | `card` |
| Seams between tiles and rows (1 px) | `outline-variant` |
| Strong lines: axes, chart borders, control borders, decorative glyphs (tree lines, `[ ]` brackets) | `outline` |
| Primary text | `text` |
| Secondary text, labels, axis labels, units | `text-muted` |
| Accent: selection fill, links, bracket-button labels, focus ring, primary action | `primary` (+ `on-primary` for text on it), `ring` |
| Money in / out / transfer | `positive` / `negative` / `text` (text); `success` / `danger` / `info` (fills and marks) |
| Warnings, bills set aside (borders, marks and fills, never text) | `warning` |
| Left-today edge and figure | `positive` (`hero-tight` / `hero-over` when tight or over) |
| Category, pool and chart series colours | `series-1` … `series-8` |
| Calendar heat | `negative` mixed into `canvas` at 0–55 % (an opaque mix, never transparency) |

Text may use only roles fitted for text (4.5:1): `text`, `text-muted`,
`primary`, `positive`, `negative` and the `on-*` roles. `info`, `success`,
`warning`, `danger`, `outline` and the series roles are fitted for non-text
contrast (3:1), so they colour borders, marks, bars and fills, never text.

Do not use translucency (`opacity` or alpha) for surfaces. Use opacity only
on an item while it is being dragged.

### 2.2 Type

| Face | Default | Used for |
|---|---|---|
| Interface & numbers | Geist Mono | Everything by default: buttons, tags, titles, headers, tabs, labels, menus, amounts, times, axes, command line, status line |
| Text | Geist | Content text only: names in rows (payees, accounts, bills, people, budgets), detail values, paragraphs, notes, the log result line |

Numbers use `font-variant-numeric: tabular-nums`.

### 2.3 Scale and sizes

The root is `font-size: 85%` and every size is in `rem`. The table lists
design sizes in px at 100 %; divide by 16 for `rem`. The rendered size is
85 % of these.

| Token | Desktop / tablet | Phone (< 600) |
|---|---|---|
| Base text | 13 | 12 |
| Small text (labels, sub-lines) | 11–12 | 10–11 |
| Top bar figure: left today | 34 (≥ 1000) / 26 (≥ 600) | 18 |
| Top bar figure: other | 23 / 19 | 15 |
| Stat figure (primary / other) | 32 / 26 (≥ 1000) | 20 / 16 |
| Big figure in tiles | 26 | 20 |
| Title strip height | 36 | 34 |
| Tile title bar height | 32 | 28 |
| Row min height | 30 (46 for tall lists) | 38 |
| Command line height | 42 | 40 |
| Tab bar button | — | 46 |
| Rail button / sidebar row | 58 / 36 (= title strip) | — |
| Top bar height | 82 (600–999) / 104 (≥ 1000) | auto (two rows) |
| Tile padding | 0 12 10 | 0 12 10 |
| Seam | 1 | 1 |
| Bar height (exact / "left of" / pool) | 8 / 4 / 2–3 | same |

The rendered minimum interactive size must stay ≥ 24 × 24 CSS px (WCAG 2.2
target size).

### 2.4 Breakpoints (container queries on the app frame)

| Width | Navigation | Notes |
|---|---|---|
| < 600 | bottom tab bar | top bar on two rows; extra columns hidden; menus are bottom sheets |
| 600–999 | 72 px icon rail | status line on; menus are popovers |
| ≥ 1000 | 212 px sidebar | list + detail split; top bar shows payday and extras |

Tile grids: 1 column below 720, 2 from 720, 3 from 1100. With the "auto"
column setting, 4 from 1500.

## 3. Shell

```
┌ sidebar ┬ summary bar: left today │ on-budget total │ pools ⊞ │ payday ┐
│ logo    │ (height = logo block)                                         │
├─────────┼ title strip: icon name │ sub-tabs │ … actions │ ⚙ (phone)      │
│ nav row │ (nav rows = title strip height)                               │
│ nav row │ content: tiles                                                │
│ …       │                                                               │
├─────────┼ command line: › input … hints │ [account ▾] │ [+ new] (filled) │
│ settings│ (settings row = command line height, same top edge)           │
└ status line: MODE │ cycle │ payday │ currency │ key hints │ ● synced ───┘
```

- **Summary bar.** Items in order: left today (fixed first) · on-budget total ·
  pools · payday (≥ 1000).
  - **Left today:** `$36.80 / $55.20`, a sub-line with spent and days to
    payday, and a "left" bar. It has a `positive` edge on its left and sits on
    `canvas`.
  - **On-budget total:** "left of" the cycle's on-budget start, with bills
    set aside and free money in the sub-line.
  - **Pools:** a grid of cells, each with icon, name, balance, a ● if it
    counts toward the daily number, and a "left of" bar for on-budget pools.
    From 600 px they form two rows when there are more than two pools. Below
    600 px they form one row, four visible, and the rest scroll sideways.
  - Each item links to its screen.
- **Title strip.**
  - The screen's icon and name, then either its sub-tabs (selected = filled
    `primary`) or the screen's own controls: search, period, filter (with a
    count badge), layout.
  - On phones the label is hidden and a gear opens Settings.
- **Command line.**
  - `›` prompt and an input for the grammar ([grammar.md](grammar.md)).
  - Key hints (≥ 600).
  - An account menu ("into Daily card").
  - A filled **+ new** menu: expense, income, transfer, split with people,
    payday, bill, IOU.
  - After logging, a result line slides up over the content with the amount,
    category, account, "left today" and **undo**.
- **Navigation.** Phone: square bar fixed to the bottom, five equal buttons,
  icon and short label, selected = filled. Rail: icon and short label.
  Short labels: Dash, Accts, Txns, Budget, Reports, Settings; each link is
  still named in full for assistive technology. Sidebar: icon, full label
  and key number, selected = filled full width.
- **Status line** (≥ 600): mode block (filled), cycle day, payday, currency
  code, key hints, sync state.
- **Overlay scrollbar.** Hide the native bar. Draw a 4 px thumb (7 px on hover
  or drag) over the right edge, which can be dragged, and clicking the track
  scrolls a page. It takes no width.

## 4. Components

| Component | Spec |
|---|---|
| **Tile** (`pane`) | `canvas` background. A title bar on `chrome` with an icon, title, muted subtitle and actions on the right. Focused or primary tiles get a 3 px `primary` inset on the title bar. Seams come from each tile's own 1 px outline, so empty grid cells show `canvas`. |
| **Grid / Stack / Split** | Grid: fixed column counts as in §2.4, `dense` flow, tiles stretch per row, the last row fills to the bottom. Stack: vertical, the last child grows. Split: list + 400 px detail (≥ 1000). |
| **Row** | One line, `min-height` per §2.3, 1 px seams. Hover and selection span the full tile width. Selection = `card` fill plus a 3 px `primary` inset. Columns come from a per-row template with tablet and phone variants. Hidden columns are removed, not wrapped. |
| **Tree row** | A 24 px lead column: a fold handle (▾ / ▸, keyboard expandable) on parents, or `├` / `└` in `outline` on children. Parents are bold and show the sum of their children. React Aria `Tree`. |
| **Amount** | Number font, tabular. `↓ −$14.00` `negative`, `↑ +$2,140.00` `positive`, `↔ $150.00` `text`. Always one formatter (§5.1). |
| **Bracket button** | `[pay]`. Brackets in `outline`, label in `primary`. Destructive actions in `negative`. An icon goes before the label. Minimum target 26 design px. |
| **Primary button** | Filled `primary` with `on-primary`. One per strip (for example **+ new**). |
| **Menu button** | Bordered, with label · value · ▾. Opens a menu. |
| **Toggle group** | Bordered segments. The pressed segment is filled `primary`. |
| **Tag** | Bordered, number font, 11 px: `3d`, `9d late`, `✓ paid`, `review`. Colour by meaning: `negative`, `positive` and muted colour the label; `warning` colours the border and keeps a `text` label. |
| **Chip** | A filter chip with a remove (×) button. Lives in the chip bar above a list. |
| **Menu** | React Aria `Menu` inside a `Popover` (≥ 600) or a `Modal` bottom sheet (< 600) with a title and a close button. Sections with uppercase headers, radio and checkbox items, nested groups with fold handles, key hints on the right. Rows are 30 px in popovers and 44 px in sheets. Arrow keys move, → / ← fold, Esc closes. A menu re-anchors to the same control after a re-render. |
| **Sheet** | A bottom sheet on `chrome` with a 2 px `primary` top edge and up to 84 % of the height. Used for menus and for details below 1000 px. |
| **Bar** | Exact width on a `card` track. A 1 px `text` tick at even pace (days elapsed ÷ cycle length). Over budget fills `negative`. |
| **"Left of" bar** | 2–4 px, showing what remains. Used in the top bar, stats, pools and bills. |
| **Share bar** | Stacked flex segments with 1 px gaps. Used for pools, categories and IOUs. |
| **Allocation** | Stacked bar of the cycle's on-budget money: bills paid · to savings · spent · bills set aside · free to spend. A bracket under the last two reads "on-budget left $X of $Y". A legend grid below (5 columns, 3 on phone) shows the amount and the share. |
| **Stats** | 4 tiles (2 × 2 on phone): label with icon, figure, sub-line, optional "left of" bar. The primary stat gets a 3 px edge (`positive`, or `primary` when neutral). |
| **Key figures** | One line of up to 4 label-over-figure pairs, each truncated with "…". |
| **Formula line** | The daily number as a sum: `on-budget $1,240.00 − bills $412.00 = free $828.00 ÷ 15 days = $55.20/day`. One line ending in "…" on phone. |
| **Chart** | A y-axis label column, then a plot with 1 px gridlines, then x labels. SVG marks in a 0–100 viewBox with `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`. Lines use monotone cubic interpolation. An area fill mixes the series colour into `canvas` at 16 % (opaque). The end point is a square marker with an HTML value label. An optional dashed reference line (even pace) and a vertical "today" line. Base heights grow ×1.75 at ≥ 1000 and ×2 at ≥ 1400 px, and charts fill their tile. |
| **Columns** | Bar columns with value labels above, x labels below, and a 1 px baseline. |
| **Sparkline** | 20–28 px tall, monotone line, no axes. |
| **Timeline** | A cycle-day axis with ticks and date labels. Events alternate above and below on two levels: bills (`warning`, paid ones muted), payday (`positive`). A "today" marker and an elapsed fill (`primary`). Labels are hidden on phone. |
| **Calendar** | A 7-column month grid. Day cells show the day number, marks (b bill, i IOU, $ payday) and the spent amount over a heat fill. Each sits on a small opaque `canvas` chip so the text keeps its contrast at any heat. Blank `canvas` cells pad the first and last weeks. Today is outlined in `primary` and the picked day in `text`. Every day has a text label and there is a table view. |
| **Summary line** | `14 entries · spent $1,201.60 · income $2,140.00 · net +$938.40`. The figures come from the server. |
| **Result line** | After logging: ✓, category icon, amount, account, "left today", **undo**. Stays for 5 s. |
| **Skeleton** | Content-shaped skeleton tiles while loading, never page spinners (kept from 0022). |
| **Category icon** | A Remix glyph (§7) in the category's series colour, 16 design px. |

## 5. Patterns

- **Primary action** sits in the tile title bar (`[+ budget]`) or the command
  line (**+ new**). Rare actions go in a `⋮` menu. Actions on one item go in
  the detail pane or sheet, with icons.
- **Truncation.** Names, labels and subtitles end in "…". Amounts never
  truncate. Columns drop instead, in this order: account, then category,
  then time.
- **List + detail.** Selecting a row updates the detail pane (≥ 1000) or opens
  a sheet (< 1000). The selection is in the URL (`?entry=`, `?account=`).
- **Filters.** A filter menu with type (radio), category tree (checkbox, where
  a parent sets all its children) and accounts (checkbox). Active filters
  show as chips and in the button's count badge. Period, group by and sort
  are separate menus.
- **Moving items.** No visible handles. Drag the item itself (a row, a tab,
  a tile's title bar) with a mouse. On touch, long-press for 400 ms (with a
  short vibration where supported), then drag. Arrow buttons or "move
  earlier / later" menu items do the same without dragging. Use React Aria
  drag-and-drop for keyboard and screen readers.
- **Empty states** say what will appear and how to add the first one, in a
  blank tile.
- **Focus** is a 2 px `ring` inset outline on every interactive element.
- **Motion** (ADR 0028): instant tab switches. Press and toggle feedback and
  sheet or menu entry on `snappy`. Reduced motion turns these into short
  crossfades or nothing.
- **Keyboard map.** `1`–`5` destinations (in tab order), `[` `]` sub-tabs,
  `/` command line, `,` Settings, `f` filter (Transactions), `Esc` closes.
  Menus use arrow keys, Enter, → / ←.

### 5.1 Money and currency display

All amounts go through one formatter. It takes the amount's own currency and
the display setting: symbol (default, `$12.50`, `€18.00`), ISO code
(`USD 12.50`), or symbol with the code for other currencies. Axis labels use a
short form (`$1.5k`). The formatter only formats. It never adds, converts or
rounds amounts for display totals.

## 6. Screens

Data sources are `/v1` paths. Items marked **(API +)** need an additive API
change (§8).

### Dashboard `/`

Default tiles, in order: this cycle (2 × 2) · needs attention · today's
entries · cycle allocation (full width) · budgets · next 7 days · pools ·
emergency fund · net worth (2 wide).

| Tile | Content | Data |
|---|---|---|
| this cycle | Key figures (spent, even pace, under pace, days over), a spent-vs-even-pace chart with a today line, the formula line | `/v1/today`, `/v1/cycles/{openedOn}/days` |
| needs attention | Tag, text, action, ⋮ | `/v1/today` attention items, `/v1/reminders` |
| today's entries | Time, icon, payee, category, amount | `/v1/transactions?on=today` |
| cycle allocation | Allocation component | **(API +)** |
| budgets | Category tree with bar, spent and left | `/v1/budgets` |
| next 7 days | Day, icon, item, amount | `/v1/reports/calendar` |
| pools | Pool rows with a daily checkbox, plus a share bar | `/v1/pools` |
| emergency fund | Figure, bar, covers, this cycle, at this rate | `/v1/insights/emergency-fund` |
| net worth | Figure, change, area chart | `/v1/insights/net-worth` |

### Accounts `/accounts[/on-budget|/off-budget|/credit]`

- Stats: net worth (primary) · savings & invest · credit owed (a "left of"
  limit bar) · reconcile (accounts needing a look).
- A list tile with a tree: pools → accounts. Credit is its own group.
- Each account row: icon, name, sparkline, reconciled date, balance, ⋮
  (reconcile, transfer from here, rename, move to another pool, archive).
- Detail: name and balance, a balance chart, pool, type, reconcile state,
  recent entries, actions.
- Data: `/v1/accounts`, `/v1/pools`, `/v1/accounts/{id}/history`,
  `/v1/transactions?account=`.

### Transactions `/transactions`

- The title strip holds search, a period menu and a filter menu.
- Chip bar for active filters.
- The list tile has a summary line **(API +: totals for the filtered set)**
  and day headers with day totals **(API +)**, or groups by category, or none.
- Rows: time, icon, payee (with a `bill` tag), `parent › category`, account,
  amount.
- Detail: icon and payee, amount, date, category path, account, budget after
  this entry (bar), cover, source, history, other entries from the same
  payee, then edit · split · cover · delete.
- Lists over 200 rows are virtualised.

### Budget `/budget/…`

| Sub-tab | Content |
|---|---|
| budgets | Allocation (full width) · budget tree with spent, left, `[+ sub]` and ⋮, and a total row (2 wide) · cover this period with what's next in line |
| pools | One tile per pool (daily checkbox, balance, "left of" bar for on-budget pools, accounts with sparklines), plus "how the daily number works" |
| bills | Timeline tile with set aside, paid and next · upcoming (with a "set aside of" bar) · paid this cycle |
| goals | One tile per goal: figure, bar, plan line, progress chart |
| ious | People list (owes you, you owe, settled, with tags) + person detail (history; repay, due date, write off) |
| cover order | Ordered list (drag or ↑ ↓) + "what happens next", which previews where an overspend would take money from **(server preview: `/v1/budgets/cover-preview`)** |

### Reports `/reports/…`

A period menu (this cycle · last cycle · this month · last month · custom) in
a toolbar.

| Sub-tab | Content |
|---|---|
| summary | Stats (spent, income, saved, daily average) · by category (share bar + tree with bar, spent, budget, share; 2 wide) · top payees **(API +)** · spending per day (columns, over the daily number in `negative`) |
| trends | Category spending across cycles (multi-line chart, 2 wide) · this cycle against the average per category, plus total spent per cycle **(API +: per-category series across cycles)** |
| plan | Budget against actual · savings rate per cycle · net worth over time |
| calendar | Layer toggles (spending heat, bills & dues) · month grid + picked-day list |
| cycles | Spent and saved per cycle (columns) · table of past cycles |

### Settings `/settings/…`

money (default currency, display mode **(planned, 0029)**, payday rule,
budget period, daily number, exchange rates) · categories (a tree with fold,
drag, `[+ sub]`, rename, icon & colour, move under, merge, archive) ·
policies · app (palette, interface: density, fonts **(planned)**, motion, key
hints; tabs, top bar and layouts **(planned)**) · account (sign-in, two-factor,
sessions, invites) · data (export, import, delete account).

Every value row opens a menu or form. There are no inline native controls.

## 7. Category icon map

Stored keys (`categoryIcons` in `@allotr/shared`) stay unchanged. The web app
renders these Remix Icon 4.5.0 glyphs (`-line` variants):

| Key | Remix | Key | Remix | Key | Remix |
|---|---|---|---|---|---|
| banknote | money-dollar-box | baby | parent | beer | beer |
| bike | riding | book-open | book-open | briefcase | briefcase-4 |
| bus | bus | car | car | circle-dollar-sign | money-dollar-circle |
| coffee | cup | credit-card | bank-card | dumbbell | run |
| film | film | fuel | gas-station | gamepad-2 | gamepad |
| gift | gift | graduation-cap | graduation-cap | hand-coins | hand-coin |
| heart-pulse | heart-pulse | house | home-4 | landmark | bank |
| laptop | macbook | lightbulb | lightbulb-flash | music | music-2 |
| paw-print | bear-smile | percent | percent | piggy-bank | safe-2 |
| pill | capsule | plane | plane | receipt | bill |
| repeat | repeat | scissors | scissors-cut | shirt | t-shirt |
| shopping-bag | shopping-bag | shopping-basket | shopping-basket | smartphone | smartphone |
| sparkles | sparkling | tag | price-tag-3 | ticket | ticket |
| train-front | train | tree-pine | tree | trending-up | line-chart |
| umbrella | umbrella | utensils | restaurant-2 | utensils-crossed | restaurant |
| wallet | wallet-3 | wifi | wifi | wrench | tools |

Interface icons (destinations, tile titles, actions) are chosen from the same
set and compiled with them.

## 8. API additions the screens need

Each is an additive `/v1` change ([ADR 0013](adr/0013-api-versioning.md)),
with the figure computed in `packages/core` as a pure function and covered by
property tests:

1. **Cycle allocation**: the cycle's on-budget start split into paid bills,
   moved to savings, spent, bills set aside and free (on `/v1/today` or
   `/v1/cycles/{openedOn}`).
2. **Pool cycle figures**: per on-budget pool, its cycle start and what is
   left (on `/v1/pools`).
3. **Transaction totals**: count, spent, income and net for the filtered set,
   plus per-day (or per-group) totals (on `/v1/transactions`).
   Shipped as `totals` and, with `group=day|category`, `groups`: per currency,
   never converted or summed across currencies.
4. **Top payees** for a period (count and total) (`/v1/reports/payees`).
5. **Category series across cycles** for trends (on `/v1/reports/categories`
   with a range).
6. **Interface preferences** for account-wide layouts (planned, ADR 0029).

## 9. Accessibility

- WCAG 2.2 AA. Every role pair is fitted by the theme resolver.
- Charts have a text label (`role="img"` with a summary) and a table
  alternative where there are many values (the calendar has a table view).
- Trees, menus, lists and drag-and-drop use React Aria semantics. Reordering
  works by keyboard.
- Truncated text has its full value available (a title or the detail view).
- Reduced motion and forced-colours mode keep everything usable. Structure
  never depends on colour or shadow.

## 10. Testing

- Playwright at 390 × 844, 820 × 1180 and 1440 × 900 for the shell and each
  destination: axe checks, keyboard paths, and screenshot comparisons.
- Alignment checks: the logo block bottom equals the summary bar bottom, nav
  rows equal the title strip height, the settings row top equals the command
  line top, and no grid cell shows the seam colour.
- Unit and property tests for the chart maths (scales, monotone paths never
  overshoot), the money formatter, and the column templates per breakpoint.
- Synthetic data only.
