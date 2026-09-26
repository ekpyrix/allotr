# 0013. API versioning and deprecation policy

- Status: Accepted
- Date: 2026-09-27

## Context

The HTTP API (`/v1`), the MCP tools and the webhook payloads are used by
gateways, external agents, home-automation hubs and user scripts. Self-hosters
upgrade on their own schedule, so clients and servers of different versions
will coexist.

## Options

1. **URL major version (`/v1`, `/v2`) + additive-only changes within a major.**
   Breaking change = new major path; the old one is kept for N minor releases
   with `Deprecation` and `Sunset` headers (RFC 9745 / RFC 8594).
2. **Date-based header versioning** (`Allotr-Version: 2026-09-27`, a pattern
   used by some large payment APIs). Fine-grained, but more server complexity.
3. **Tie the API to app SemVer** only: any breaking API change is a major app release.

Sub-decisions: how long deprecated endpoints live; whether MCP tool and
webhook schemas version with the HTTP API; whether the OpenAPI diff check in
CI blocks breaking changes (e.g. oasdiff).

## Decision

- Major version in the URL (`/v1`). Within a major, changes are additive
  only; an OpenAPI diff check (oasdiff) in CI fails PRs that break `/v1`.
- A breaking change ships `/v2` alongside `/v1`. The old major stays for at
  least **two minor releases**, responding with `Deprecation` and `Sunset`
  headers and a link to migration notes.
- MCP tool schemas and webhook payloads carry the same major version.

## Consequences

- External clients (scripts, home-automation hubs, agents) keep working across minor upgrades.
- Two routers coexist during a deprecation window.
- The generated OpenAPI spec becomes a reviewed artifact in every API PR.
