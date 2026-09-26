# allotr

Public MIT repository — treat everything committed as public and permanent.
No secrets, personal data, or real financial data in code, fixtures, docs,
commit messages or PR text.

## Design documents

- Accepted decisions: `docs/adr/NNNN-title.md` (see `docs/adr/README.md`).
- Proposed ADRs, drafts, scratch notes, and brainstorming/spec/plan output from
  skills: write to `docs/drafts/` (git-ignored). Never write them elsewhere in
  the tracked tree.
- Promote a draft to `docs/adr/` only when the user accepts it, and sanitize it
  first.

## Git conventions

- Conventional Commits (`type(scope): subject`), see `CONTRIBUTING.md` and `.gitmessage`.
- Branches: feature → `dev` (squash) → `staging` (merge commit) → `main` (merge commit).
  Branch from `dev`; never squash a promotion PR. All three are protected — PRs only.
- The feature PR title must be a valid Conventional Commit.
- Fill in `.github/PULL_REQUEST_TEMPLATE.md` and link an issue.
