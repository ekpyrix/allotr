# Allotr

A self-hosted personal finance ledger that answers one question: **how much
can I spend today?**

> **Status: design phase.** The architecture is decided (see
> [docs/adr/](docs/adr/)), but there is no release to install yet.

The name comes from *allotment*: every unit of money has a job.

## The idea

Most budgeting apps compute "safe to spend" from your total balance, so money
you meant to save quietly becomes spending money. Allotr keeps spendable money
and savings apart:

```
daily usable = (on-budget balance − bills set aside) ÷ days until payday
```

Savings sit in off-budget accounts and never count toward the daily number.

You log spending in a line of text, from the web app or a chat app:

```
-12.50 food
✓ -$12.50 Food · Daily Card
Today left: $27.50 · $40.00/day for 24 days
```

## Planned features (v1)

- Double-entry, append-only ledger with integer money.
- Paycheck-based cycles, bill reservation, savings goals and reconciliation.
  Behaviour choices (leftover, overspending, payday rules and more) are
  per-user settings.
- Web app (PWA) for phone, tablet, desktop and wall displays, with light,
  dark and community themes.
- Optional chat gateways (Discord, Telegram) with one command set.
- Optional AI assistant: bring your own OpenAI-compatible or other provider,
  or run a local model. An MCP server lets AI agents use Allotr as a tool.
- Multi-user login with invites, OIDC and 2FA. No sharing between users.
- All ISO 4217 currencies, with a switchable default currency.
- Export to CSV and Beancount.
- One Docker image for amd64 and arm64.

## Privacy

- **No telemetry, ever.** No analytics, crash reporting or install counting
  ([ADR 0011](docs/adr/0011-no-telemetry.md)).
- Every outbound network call belongs to a feature you turn on (AI provider,
  exchange rates, chat platforms, OIDC, update check) and will be listed in
  the app's privacy settings.
- Your data stays on your server. Allotr is meant to be reached over a VPN or
  a reverse proxy, not exposed directly to the internet.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In short: branch from `dev`, use
Conventional Commits, sign off your commits (`git commit -s`), link an issue,
and never include real financial or personal data. AI coding agents should
start with [AGENTS.md](AGENTS.md).

Security issues: see [SECURITY.md](SECURITY.md).

## Name and brand

"Allotr" and its logo identify this project. You are welcome to fork the code
under the MIT license. If your fork changes behaviour and is distributed or
hosted for others, please give it a different name and logo so users can tell
the projects apart.

## License

[MIT](LICENSE)

The web app bundles the Geist and Geist Mono typefaces, licensed under the
SIL Open Font License 1.1.
