# 0017. Shipping third-party palettes under their names, with credit

- Status: Accepted
- Date: 2026-09-30

## Context

The launch theme families (Catppuccin, Nord, Solarized, Gruvbox, Dracula,
Tokyo Night, Rosé Pine) are published by their authors under permissive
licences. The repository rule says to describe prior art as patterns, not
product names. That rule exists to avoid product comparisons, not to
rename works we redistribute. Renaming a palette ("Pastel Night") would hide
its origin, weaken attribution and confuse users searching for it.

Options: ship them under their original names with credit; ship them under
descriptive names with credit only in a NOTICE file; ship none and support
import only.

## Decision

- Ship them under their **original names**. Each file carries `credit`
  (`author`, `licence`, `url`), and a `THIRD_PARTY_NOTICES.md` holds each
  licence text.
- Before adding a family, confirm that its licence permits redistribution
  and modification (fitting changes colours), and record the licence id.
  Families under non-permissive or unclear licences are not shipped.
- These names are a **scoped exception** to the no-product-names rule.
  They may appear as theme names, in credit fields, in the notices file and
  in the theme picker. They may not be used as comparisons or endorsements
  anywhere else ("like X", "better than Y").
- The UI says "Catppuccin Mocha, by Catppuccin (MIT)" in the picker's
  details view. It doesn't use any family's logo.

## Consequences

- `.agent/rules/public-repo.md` needs a short note on this exception.
- Upstream palette changes are pulled deliberately, never automatically.
  Golden tests pin the shipped hexes.
- A family can be removed if its authors ask. Stored appearance ids for it
  then fall back to the default pair.
