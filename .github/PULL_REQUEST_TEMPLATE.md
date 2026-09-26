<!--
Feature PRs target `dev` and are squash-merged. The title must follow
Conventional Commits — it becomes the commit:
  feat(parser): accept Thai numerals
  fix(core)!: round satang half-even   (! = breaking change)
Promotion PRs (dev→staging, staging→main) use a merge commit, never squash.
-->

## Summary

<!-- What changes and why. Link design context if any. -->

Closes #

## Type of change

- [ ] `feat` — new capability
- [ ] `fix` — bug fix
- [ ] `refactor` / `perf` — no behavior change / faster
- [ ] `docs` / `test` / `build` / `ci` / `chore`
- [ ] **Breaking change** (title has `!`, migration notes below)

## How was this tested?

<!-- Commands run, new tests added, manual checks. -->

## Definition of Done

- [ ] Tests added or updated; ledger invariant tests are not skipped
- [ ] Docs updated (README, `docs/`, OpenAPI) where behavior changed
- [ ] ADR added in `docs/adr/` if this makes a hard-to-reverse decision
- [ ] DB migrations are forward-only and documented (or N/A)
- [ ] No secrets, tokens, or real financial/personal data in code, fixtures, screenshots, or this description
- [ ] CI is green

## Screenshots / notes for reviewers

<!-- UI changes: phone and desktop screenshots with fake data. -->
