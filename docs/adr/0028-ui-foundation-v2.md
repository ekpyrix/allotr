# 0028. UI foundation v2: React Aria Components, in-house SVG charts, CSS motion, Remix Icon

- Status: Accepted
- Date: 2026-10-09
- Supersedes: 0019 (motion system), 0020 (UI foundation)

## Context

The terminal interface (ADR 0026) and navigation v3 (ADR 0027) need
components that the current foundation either lacks or fights:

- category, account and filter trees
- reordering with keyboard, mouse and long press
- menus with checkbox and radio sections and nested groups
- the same content as a popover or a bottom sheet
- long virtualised lists
- small, exactly drawn charts in a flat style

In the current build, Recharts weighs about 100 KB gzipped and Motion about
50 KB. The interface no longer uses springs or gestures that need them.
Lucide icons do not match the new look.

## Decision

- **Behaviour and ARIA: React Aria Components** (Apache-2.0)
  - It replaces Radix, the shadcn setup and cmdk. We use its menus,
    popovers, modals (as bottom sheets), list boxes, grid lists, trees,
    drag-and-drop with keyboard and screen-reader support, long press,
    virtualizer and autocomplete (for the command palette).
  - All styling is our own, from theme tokens.
- **Charts: an in-house SVG kit**
  - It replaces Recharts. It provides line and area charts with monotone
    cubic smoothing, columns, exact bars with a pace tick, stacked share bars,
    sparklines, the bills timeline and the calendar heat grid.
  - Marks are SVG scaled to the plot. Every label is HTML text, so it stays
    crisp at any size.
  - Path and scale maths are pure functions with property tests.
  - The web app still never computes money. Charts plot series the server
    returns.
- **Motion: CSS transitions and same-document View Transitions only**
  - The Motion library is removed.
  - The motion tokens (`snappy`, `smooth`, `gentle`, `bouncy`, `ease-exit`)
    stay as generated CSS easings.
  - Tab switches are instant. Animation is kept for direct feedback (press,
    toggles, selection) and floating panels (sheets, menus), on `snappy`.
  - Swipe rows, rolling digits and celebrations are dropped.
  - Reduced-motion settings work as in 0019: System, Full, Reduced, Off.
- **Icons: Remix Icon, pinned to 4.5.0** (the last Apache-2.0 release)
  - A build script compiles only the icons we use into SVG React components.
    There is no icon font and no runtime icon package.
  - Category icons keep their stored keys (the current Lucide names in
    `@allotr/shared`), so the `/v1` API and stored data do not change. The web
    app maps each key to a Remix glyph, as listed in the UI reference.
- **Fonts**: Geist Mono (interface and numbers) and Geist (content text),
  self-hosted as today.
- **Scrollbars**
  - Native scrollbars are hidden in the main area, menus and sheets.
  - A drawn overlay bar takes no width, so content never reflows when it
    appears. Scrolling with the keyboard and assistive technology is
    unchanged.
- **Layout**: Tailwind v4 with container queries on the app frame, using the
  breakpoints in the UI reference.
- **Kept from before**
  - React 19, Vite, TanStack Router and Query.
  - Tailwind with generated role tokens.
  - CVA, clsx, tailwind-merge.
  - Zod and the shared schemas, and the API client.
  - The custom i18n, the service worker and PWA build.
  - Vitest, fast-check, Playwright and axe.
- **Testing**: Playwright screenshot tests at 390, 820 and 1440 px for the
  shell and each destination, in addition to the axe checks.

## Consequences

- One accessibility layer covers what Radix and cmdk did, plus trees,
  drag-and-drop, long press and virtualisation. Its API is wordier, and its
  core is heavier than Radix. Removing Recharts and Motion more than makes up
  the bundle size.
- We own the chart code. It stays small because the interface uses a fixed
  set of chart types.
- Some 0019 features go away (springs in JS, swipe rows, rolling digits,
  celebrations, haptics on swipe). Haptics remain for long press where the
  device supports them.
- The strict CSP is unaffected. React Aria and our components set styles
  through the DOM, not inline style attributes in the HTML.
- `THIRD_PARTY_NOTICES.md` gains Remix Icon (Apache-2.0) and React Aria
  Components (Apache-2.0), and loses Lucide and Recharts when they are
  removed.
