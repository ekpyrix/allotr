# 0019. Motion system: spring tokens across CSS, View Transitions and Motion

- Status: Superseded by 0028
- Amended by: 0023 (tab switches)
- Date: 2026-09-30

## Context

The app should feel physical: a fast ramp, a long gentle settle and
interruptible gestures. It must also stay calm for a money app and respect
reduced motion. Architecture already names CSS/View Transitions plus Motion.
It doesn't say how to keep one feel across three engines.

## Decision

- Springs are **tokens** defined as (perceptual duration, bounce):
  `snappy 250/0`, `smooth 400/0`, `gentle 550/0`, `bouncy 450/0.15`, plus
  `ease-exit` (a cubic-bezier, 150–200 ms).
- One generator in the web build turns each spring into a CSS `linear()`
  easing and a Motion spring config, so CSS transitions and JS springs match.
- CSS transitions handle state changes. Same-document View Transitions
  handle route changes and shared elements. Motion (lazy-loaded features)
  handles gestures, sheets, rolling digits and list layout.
- Bounce is kept to small controls. Exits are about 70 % of entrance
  duration. Top-level tab switches use fade-through, not slides. Only
  `transform`, `opacity` and `clip-path` are animated.
- The signature motions are: rolling digits for the hero figure (a
  CSS-only component, so Today does not load Motion); bottom sheets with
  detents; swipe rows, where destructive actions never commit on a full
  swipe; and small celebrations for real wins only (never on spending, no
  streaks).
- `prefers-reduced-motion` and an in-app setting (System / Full / Reduced /
  Off) reduce motion to short crossfades. Haptics (Vibration API) and
  celebrations each have their own setting. Celebrations are off whenever
  motion is reduced.

## Consequences

- A small build-time module and a test that asserts the CSS and JS curves
  agree.
- Motion becomes a runtime dependency. It's loaded lazily, so it adds to the
  bundle on first gesture, not on first paint.
- Browsers without `linear()` or View Transitions get the cubic-bezier
  fallback or no transition. Behaviour is otherwise identical.
