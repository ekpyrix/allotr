# 0015. Database encryption at rest

- Status: Accepted
- Date: 2026-09-27

## Context

The SQLite database holds personal financial data in a plaintext file.
Backups are encrypted separately. The question is whether the live
database should also be encrypted, and against what threat: a stolen disk or
backup volume, another process on the host, or the instance admin.

## Options

1. **Rely on host full-disk encryption** (LUKS, FileVault, ZFS native
   encryption) and document it. No app complexity; protects against a stolen
   disk only.
2. **SQLCipher** (encrypted SQLite). Protects the file at rest; the key must
   be supplied at startup (env or Docker secret), so it does not protect
   against the host admin. Needs a native driver build for every
   architecture, and affects tooling (sqlite3 CLI, Litestream).
3. **Application-level field encryption** for sensitive columns (notes, raw
   messages). Partial protection; complicates search and queries.
4. **Per-user keys derived from the user's password** (end-to-end style).
   Protects from the admin, but breaks chat gateways, scheduled jobs and
   password reset. Contradicts the server-side design.

## Decision

v1 uses a plaintext SQLite database, with **encrypted backups** and
documentation that strongly recommends host full-disk encryption and states
plainly what is and is not protected (stolen disk: protected by FDE; host
process or admin: not protected). The database layer stays driver-agnostic
so an optional SQLCipher mode can be added after v1 if users ask for it.

## Consequences

- No native crypto driver or key management in v1; standard SQLite tooling and Litestream keep working.
- A copied live data volume is readable; users who need more rely on FDE until SQLCipher mode exists.
- Honest documentation is part of the decision, not an afterthought.
