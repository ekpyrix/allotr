# 0027. Navigation v3: summary bar, sub-tabs, command line and in-app menus

- Status: Accepted
- Date: 2026-10-09
- Supersedes: 0023 (navigation v2 and calmer motion)

## Context

ADR 0023 set up five destinations, a floating pill tab bar on phones and a
round add button. Three problems came out of daily use:

- The key figures were only on the Dashboard.
- Sections such as bills and IOUs were buried in long pages.
- Choices were made with the browser's own pickers, which differ by platform
  and do not suit a keyboard-driven terminal look.

## Decision

- **Shell, top to bottom**
  1. **Summary bar**: the on-budget figures, on every screen.
  2. **Title strip**: the screen name and its sub-tabs, or the screen's own
     controls, on one 36 px line.
  3. Content.
  4. **Command line**: logging entries and **+ new**.
  5. On phones, a square tab bar fixed to the bottom edge.
- **Navigation by width**
  - Phones use the bottom tab bar.
  - From 600 px, an icon rail.
  - From 1000 px, a sidebar.
  - The sidebar rows line up with the shell: the logo block is as tall as the
    summary bar, nav rows are as tall as the title strip, and the settings row
    is as tall as the command line.
  - A status line runs along the bottom from 600 px.
- **Summary bar**, in this order:
  1. **Left today**, always first and the most prominent.
  2. **On-budget total** (what is left of this cycle's on-budget money).
  3. **Pools**, a grid that fits however many pools there are.
  4. Payday, from 1000 px.

  Each part opens the screen it summarises.
- **Destinations** stay Dashboard · Accounts · Transactions · Budget ·
  Reports, with Settings from the gear or the sidebar foot.
- **Sub-tabs**, each its own route:

  | Screen | Sub-tabs |
  |---|---|
  | Accounts | all · on-budget · off-budget · credit |
  | Budget | budgets · pools · bills · goals · IOUs · cover order |
  | Reports | summary · trends · plan · calendar · cycles |
  | Settings | money · categories · policies · app · account · data |

- **Adding**
  - The command line on every screen takes the typed grammar.
  - Beside it, a filled **+ new** menu opens structured forms: expense,
    income, transfer, split, payday, bill, IOU.
  - Beside that, a menu sets the account new entries go into.
  - The round add button is removed.
- **Lists and details**
  - Transactions and Accounts show a list and a detail pane side by side from
    1000 px.
  - Below 1000 px the detail opens in a bottom sheet.
- **In-app menus everywhere**
  - Every choice (filter, sort, group, period, account, currency, palette and
    so on) opens an in-app menu. Native pickers are never used.
  - From 600 px the menu is a popover with key hints; below that it is a
    bottom sheet.
  - Filters show as removable chips.
- **Keyboard**
  - `1`–`5` open the destinations.
  - `[` and `]` step through sub-tabs.
  - `/` focuses the command line.
  - `,` opens Settings.
  - `f` opens the filter menu on Transactions.
  - `Esc` closes the top menu or sheet.
- **Moving things**
  - There are no visible drag handles.
  - Items are dragged by the item itself, with a long press on touch.
  - Arrow buttons or menu items do the same job without dragging.
- **Old addresses** redirect: `/today`, `/ledger`, `/cycle`, `/history` and
  `/savings` (as in 0023), and `/settings#bills` to `/budget/bills`.

## Consequences

- Routes, nav items and shell tests change. Sub-tab paths are new and are
  linkable.
- The summary bar needs per-pool "left of" figures from the server (see the
  UI reference, API additions).
- Settings gains a categories section and moves appearance under "app".
- The motion rules from 0023 (instant tab switches, animation only for direct
  feedback and floating panels) carry over, and are restated in ADR 0028.
