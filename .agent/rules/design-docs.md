# Rule: design documents

Accepted in [ADR 0001](../../docs/adr/0001-record-architecture-decisions.md).

| Status | Location | In git? |
|---|---|---|
| Scratch, draft, proposed | `docs/drafts/` | No (git-ignored) |
| Agent specs, plans, brainstorming output | `docs/drafts/` | No (git-ignored) |
| **Accepted** | `docs/adr/NNNN-title.md` | Yes (public) |
| Superseded / deprecated | stays in `docs/adr/`, status updated | Yes |

## Rules

- Write any design exploration, spec or implementation plan to
  `docs/drafts/`. Never write it elsewhere in the tracked tree. If a tool or
  skill defaults to another path (e.g. `docs/superpowers/`), redirect it.
- Treat `docs/drafts/` as private: it may contain the maintainer's real data.
  Do not copy its content into tracked files, commits, PRs or issues.
- Only the maintainer accepts a decision. When they do:
  1. Copy `docs/adr/0000-template.md` to the next number.
  2. Rewrite the content in sanitized form (made-up numbers, no personal
     details), status `Accepted`.
  3. Add it to the index in `docs/adr/README.md`.
- Never edit the decision of an accepted ADR. Write a new ADR and mark the old
  one `Superseded by NNNN`.
- An ADR is required for hard-to-reverse choices: stack, database, data model,
  ledger rules, API contract, storage/export formats, licensing, branching.
- Do not assume anything from drafts is decided. If `docs/adr/` does not cover
  it, ask the maintainer.
