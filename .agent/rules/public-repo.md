# Rule: public repository hygiene

allotr is public (MIT) and handles personal finance. Anything that reaches
GitHub — files, git history, commit messages, branch names, PR and issue text,
screenshots — is world-readable and cannot be reliably un-published.

## Never commit

- Secrets: API keys, bot tokens, passwords, connection strings, private keys.
- Real financial data: balances, transactions, income, account or card
  numbers, bank export files, real merchant histories.
- Personal data: real names, emails, phone numbers, handles or identities
  beyond the public GitHub account `fnnyx`.
- Local runtime artifacts: databases (`*.db`, `*.sqlite*`), `logs/`, LLM
  prompt/response dumps, `.env*` (except `.env.example`),
  `.claude/settings.local.json`.

## Do instead

- Configuration comes from environment variables; document every variable in
  `.env.example` with a placeholder value.
- Test fixtures, examples, golden files, eval sets, docs and screenshots use
  synthetic data. Keep the shape of real data, never the values.
- Git identity uses the GitHub noreply address; do not change it.
- Describe prior art and inspiration as **patterns** ("the envelope-budgeting
  pattern", "popular self-hosted apps"), not by naming other products or
  companies, and avoid "just like X" phrasing. Name things only when they do
  a job: dependencies, standards and formats, integration targets, providers,
  and licence credits for bundled assets.

## Shipped palette names

[ADR 0017](../../docs/adr/0017-third-party-palettes.md) makes a scoped
exception: bundled theme palettes keep their original names (e.g. Catppuccin
Mocha). Those names may appear as theme names, in `credit` fields, in
`THIRD_PARTY_NOTICES.md` and in the theme picker. Never use them as
comparisons or endorsements ("like X", "better than Y"), and never add a
family whose licence does not allow redistribution and modification.

## Checklist before every commit

- [ ] `git diff --cached` reviewed for keys, tokens and personal data.
- [ ] No new file matching the "never commit" list above.
- [ ] Amounts, names and accounts in fixtures/examples are made up.
- [ ] Commit message and PR text contain no personal or financial details.
- [ ] Other products are described as patterns, not named as comparisons.

## If something leaks

1. Stop and tell the maintainer immediately.
2. Rotate or revoke the secret — rewriting history is **not** enough once
   pushed.
3. Only then clean history, if the maintainer asks.

GitHub secret scanning with push protection is enabled as a backstop, not a
substitute for this checklist.
