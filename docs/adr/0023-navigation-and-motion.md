# 0023. Navigation v2 and calmer motion

- Status: Superseded by 0027
- Date: 2026-10-01
- Amends: 0019 (motion system) — tab switches; supersedes nothing else

## Context

Today is the home view, the phone has four tabs, bills sit in Settings, and
reports are reached from Today. Logging is the most frequent action but has
no fixed home. Tab switches fade, which feels slow when moving between views
many times a day.

## Decision

- Destinations, in order: **Dashboard · Accounts · Transactions · Budget ·
  Reports**. Settings opens from a gear in the header (phone) or the foot of
  the sidebar (desktop).
- **Dashboard** is the home view (`/`). Top to bottom: today card (left
  today, pace, covered this cycle, needs attention), weekly review card
  (shown once a week), budgets, next 7 days, pools, emergency fund, net worth,
  today's entries. Two columns on wide screens. `/today` redirects to `/`.
- **Transactions** is the ledger (`/transactions`; `/ledger` redirects).
- **Budget** holds pools, budgets and the cover order, bills, goals and IOUs.
- **Reports** holds category summaries, budget vs actual, savings rate, net
  worth over time, cycle history and the calendar (one month grid with two
  layers, spending heat and bills & dues, both on by default).
- **Add** is a round button beside the phone tab bar on every tab; desktop has
  a header button and the command palette.
- **Settings** sections: Money · Policies · App · Account and security · Data.
- **Motion**: tab switches are instant (no fade-through). Animation is kept
  for direct touch feedback (press, toggles, tab bar indicator) and floating
  panels (sheets, menus, the add sheet), all on the `snappy` spring. Rolling
  digits and swipe rows stay; reduced-motion settings still apply.

## Consequences

- Routes, nav items, shell tests and view-transition types change.
- Bills move out of Settings; deep links to `/settings#bills` redirect.
