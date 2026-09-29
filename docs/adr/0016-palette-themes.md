# 0016. Themes are terminal palettes with a role map (theme file v2)

- Status: Accepted
- Date: 2026-09-30

## Context

Today a theme is 16 semantic role tokens (`allotr-theme` v1), validated for
WCAG 2.2 AA. The redesign puts terminal colour palettes first: users should
be able to pick or import a palette they already use elsewhere and get a
coherent, accessible app. The redesign also adds tonal surface tiers,
containers, status and chart roles, which the 16 tokens cannot express.
The theme file is an import/export format and part of the `/v1` settings
API, so changing it is hard to reverse.

Options considered:

1. **Palette + role map.** A theme stores a palette (12-slot neutral ramp +
   named accents + canonical hue index) and a partial role map. Missing
   roles come from a default map per scheme. Roles are resolved with optional
   contrast fitting.
2. **Palette only, fixed mapping.** Simple, but a palette that fails AA
   cannot be rescued except by editing its colours.
3. **Keep semantic tokens, ship palettes as presets.** Smallest change, but
   import becomes a lossy one-way conversion, and adding roles later means
   another format bump.

## Decision

Option 1.

- New file format `{ format: "allotr-theme", version: 2, name, family?,
  scheme, credit?, palette: { neutrals, accents, hues }, roles? }`.
- Neutral slots: `crust, mantle, base, surface0–2, overlay0–2, subtext0–1,
  text`. Accents: an open map of 8–24 named colours. `hues` maps the
  canonical `red, orange, yellow, green, cyan, blue, purple, pink` to accent
  names.
- Role entries: `{ slot, alpha?, over?, fit? }`. `fit: "auto"` (the
  default) shifts OKLCH lightness in 0.005 steps, keeping the hue and
  clipping chroma, until the role passes its contrast kind on every surface
  in its set. `fit: "off"` uses the slot as is and rejects the theme on
  failure (`theme_contrast`).
- The resolver, the fitter and neutral-ramp derivation are pure functions in
  `packages/shared`, shared by the server (validation) and the web (paint).
- v1 files stay importable forever. They convert to v2 by building a
  palette from their tokens, with the roles pinned to the original colours.
  Stored v1 custom themes are upgraded lazily on read and written back as v2
  on the next save.
- Import reads theme files (v1 and v2), multi-flavour palette JSON,
  base16/base24 YAML and ANSI-16 terminal colour configs. Terminal configs
  are recognised and named by file shape, never by the program that
  writes them. Every import produces a draft through the same resolver.
- Import from a URL is a server-side fetch, **off until an admin allows
  it** (ADR 0011). It accepts https only, blocks private, loopback,
  link-local and CGNAT addresses with the resolved IP pinned, follows no
  redirects, and has a 5 s timeout, a 64 KB cap and a per-user rate limit.
  The browser's CSP is not loosened.
- Appearance keeps `{ mode, light, dark }`. Shipped theme ids gain family
  prefixes (`catppuccin-latte`), and the old ids `light`/`dark` stay as
  aliases of Allotr Classic.

## Consequences

- Any palette produces a usable theme. Imports can't fail on contrast unless
  the user opts out of fitting.
- Fitted colours differ from the palette author's. The editor must show the
  difference (original | fitted, ΔL).
- The validator, `theme-init.js`, the localStorage cache and
  `styles.test.ts` all move to resolved roles, which is a larger test
  surface. A property test must assert that every palette resolves to a
  passing theme.
- URL import adds an outbound-request path to the server. It is guarded,
  and it's opt-in, so a default install makes no new outbound calls.
- The export bundle and `/v1/settings/themes` accept v2 bodies. v1 bodies
  keep working under ADR 0013's deprecation policy.
