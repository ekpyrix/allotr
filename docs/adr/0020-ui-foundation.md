# 0020. UI foundation: owned shadcn primitives, custom sheets, charts from server series

- Status: Accepted
- Date: 2026-09-30

## Context

shadcn/ui (new-york, Radix, Tailwind v4) is set up, but only three
primitives are in use. The redesign needs many more components with a
distinctly non-default look: bottom sheets with detents, swipe rows, charts
and a command palette. The web app must never compute money (architecture
§4). New charts need series the API does not return yet.

## Decision

- shadcn components are **owned source**: copy them in, then restyle them to
  the redesign tokens. Radix supplies behaviour and ARIA. Upstream styles are
  not tracked.
- Bottom sheets are built on Radix Dialog + Motion drag, not on a drawer
  library. This keeps one focus-management model and avoids depending on an
  unmaintained package (check the drawer library's status again when this
  is implemented).
- The command palette uses shadcn Command (cmdk).
- Charts: Recharts for axis charts, lazy per route. Custom SVG for sparks,
  sparklines, the hero and the waterfall on Today.
- New projections go in `packages/core` as pure functions, exposed as
  additive `/v1` changes: `/v1/today` gains `onBudget` and `reserved`, and
  there are new endpoints for cycle day series, cycle category totals and
  account balance history.

## Consequences

- More owned component code to maintain, with full control over look and
  a11y.
- The new endpoints need OpenAPI updates, property tests on the
  projections, and golden fixtures with made-up amounts.
- Today stays free of Recharts, which keeps its bundle within the
  budget in the spec (§13).
