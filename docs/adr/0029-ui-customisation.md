# 0029. Interface customisation, after the rebuild

- Status: Accepted
- Date: 2026-10-09

## Context

People have different numbers of pools, use different screens most, and
work on both phones and desktops. During the redesign the maintainer asked
for several personal settings. They also asked that none of them land in
the first rebuild PRs, so that the fixed design ships and settles first.

## Decision

These features are accepted as the direction. They are built **after** the
fixed design from ADRs 0026–0028, and are marked "planned" in the interface
until then:

- **Tab order.** Tabs are reordered by dragging the tab itself (long press
  on touch), or with arrow buttons in Settings → app. Number keys follow the
  order.
- **Summary bar.**
  - Choose and order its items: on-budget total, pools, payday, bills set
    aside, free to spend. Left today stays first.
  - Choose which pools it shows. The pool grid fits any count.
- **Dashboard layout.**
  - A layout mode where tiles are dragged by their title bar.
  - Tile sizes: 1–3 columns or full width, 1 or 2 rows tall.
  - Tiles can be hidden and added back.
  - Column count: auto, 2, 3 or 4.
- **Where layouts are saved.** A setting stores them on this device only (the
  default) or with the account, the same on all devices.
- **Fonts.** A text font and an interface & number font, chosen separately.
  Choosing a mono face for both gives an all-monospace interface, and the
  reverse works too.
- **Currency display.**
  - Symbol (the default).
  - ISO code.
  - Symbol, with the code for amounts in other currencies.

## Consequences

- Account-wide layouts need an additive `/v1` settings resource for interface
  preferences. Per-device layouts stay in browser storage and never leave the
  device.
- Each feature gets its own PR with tests, after the rebuild is on `dev`.
- Until then the interface uses the defaults described in the UI reference.
