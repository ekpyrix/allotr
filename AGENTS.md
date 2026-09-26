# AGENTS.md

Instructions for AI coding agents working in this repository. Humans should
read [CONTRIBUTING.md](CONTRIBUTING.md); the rules here are consistent with it.

## Project

allotr is a self-hosted, natural-language personal expense tracker. It is a
**public MIT-licensed repository**. The tech stack is not chosen yet; check
`docs/adr/` for accepted decisions before assuming any language, framework or
tool.

## Hard rules

These always apply. Details are in `.agent/rules/`.

1. **Everything committed is public and permanent.** No secrets, tokens,
   personal data or real financial data in code, fixtures, docs, commit
   messages, PR or issue text. Use made-up amounts, accounts and names.
   → [.agent/rules/public-repo.md](.agent/rules/public-repo.md)
2. **Never push to `dev`, `staging` or `main`.** Branch from `dev`, open a PR.
   Feature PRs are squash-merged into `dev`; promotions use merge commits.
   → [.agent/rules/git-workflow.md](.agent/rules/git-workflow.md)
3. **Conventional Commits** for commit messages and feature PR titles.
   → [.agent/rules/git-workflow.md](.agent/rules/git-workflow.md)
4. **Drafts stay out of git.** Proposals, specs, plans and scratch notes go in
   `docs/drafts/` (git-ignored). Only accepted ADRs go in `docs/adr/`.
   → [.agent/rules/design-docs.md](.agent/rules/design-docs.md)
5. **Do not read `docs/drafts/` content into public output.** Drafts may
   contain the maintainer's real data; never copy from them into tracked
   files, commits or PRs without the maintainer accepting and sanitizing it.

## Layout

```
AGENTS.md            this file — entry point for agents
.agent/rules/        detailed rules, one topic per file
docs/adr/            accepted Architecture Decision Records (public)
docs/drafts/         proposals, specs, plans, scratch (git-ignored)
.github/             issue forms, PR template, CODEOWNERS, dependabot
.gitmessage          commit message template
```

## Before you finish a task

- Diff contains no secrets or real data (see public-repo rule checklist).
- Work is on a feature branch, not `dev`/`staging`/`main`.
- Commit messages follow Conventional Commits.
- PR description follows `.github/PULL_REQUEST_TEMPLATE.md` and links an issue.
- If you made a hard-to-reverse decision, it is proposed as an ADR draft in
  `docs/drafts/` for the maintainer to accept — not committed as accepted.
