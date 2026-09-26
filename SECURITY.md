# Security Policy

## Supported versions

| Version | Security fixes |
|---|---|
| Before 1.0 | Latest release and `main` only |
| 1.0 and later | **Latest minor release only.** Upgrade to receive fixes |

Upgrades from any version to the latest release within the same major version
are supported in one step, with an automatic backup before migrations run.

## Reporting a vulnerability

Please **do not** open a public issue. Report privately through
[GitHub private vulnerability reporting](https://github.com/fnnyx/allotr/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect.
You should get an acknowledgement within 7 days. Once a fix is released, it is
announced in a GitHub Security Advisory and the release notes, with credit to
you unless you prefer otherwise.

## Threat model summary

Allotr stores personal financial data on a server its owner controls. The
design (see [docs/adr/](docs/adr/)) addresses these threats:

| Area | Threat | Planned controls |
|---|---|---|
| Web sessions | Account takeover, CSRF, XSS | Local accounts with TOTP 2FA, login rate limiting and lockout, `HttpOnly`/`Secure`/`SameSite` cookies, origin checks, strict Content-Security-Policy |
| API and MCP tokens | Token theft or over-broad access | Tokens stored hashed and shown once; scopes (`read`, `propose`, `write`, `kiosk`); revocable |
| Chat gateways | Impersonation, cross-user leaks | Identities linked by one-time code; per-user sessions; replies with personal figures are private in shared channels |
| Gateway ↔ server | Spoofed internal calls | Gateways use only the public API with a per-install secret |
| User-supplied URLs (webhooks, exchange-rate sources, notifications, OIDC, themes) | Server-side request forgery | One hardened HTTP client: private, loopback, link-local and metadata addresses blocked, re-checked after redirects; admin allowlist |
| AI features | Prompt injection, wrong entries | AI is off by default; model output is schema-validated and never commits by itself; minimal context sent |
| Data at rest | Stolen disk or backup | Encrypted backups; host full-disk encryption recommended. The live database is not encrypted in v1 ([ADR 0015](docs/adr/0015-encryption-at-rest.md)) |
| Instance admin | Reading other users' data | Not protected: anyone who controls the host can read the database. Multi-user means separate accounts, not protection from the admin |
| Privacy | Data leaving the server | No telemetry; outbound calls are opt-in and disclosed ([ADR 0011](docs/adr/0011-no-telemetry.md)) |

## Scope notes

Allotr is designed to be self-hosted and not exposed directly to the internet.
Reports about deployments that ignore the documented setup are still welcome,
but may be treated as documentation fixes.
