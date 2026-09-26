# Rule: code style

Accepted stack: [ADR 0003](../../docs/adr/0003-typescript-node-stack.md).
Tooling enforces most of this; the rest is on you.

## TypeScript

- `strict` on, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- ESLint `strict-type-checked` must pass without inline disables. If a
  disable is truly needed, add a comment explaining why.
- No `any`. Use `unknown` and narrow, or a Zod schema at the boundary.
- ES modules only. Named exports; no default exports except where a framework requires them.
- Prefer plain functions and data over classes. Keep functions small and pure where possible.
- Use branded types for identifiers and money (`AccountId`, `Money`), not bare strings or numbers.

## Boundaries

- Validate every external input (HTTP, chat, MCP, LLM output, imports, env)
  with Zod schemas from `packages/shared`.
- `packages/core` has no I/O: no database, network, filesystem, clock or
  randomness. Pass time (`now`, the user's timezone) and IDs in.
- Only `apps/server` talks to the database, through Kysely.
- Gateways and the web app use the public API only.

## Dates and time

- Store instants in UTC. Store `occurred_on` as a calendar date (`YYYY-MM-DD`).
- Convert between instants and local days in one shared module using the
  user's timezone. No ad-hoc date arithmetic elsewhere.

## Errors

- Domain errors are typed and carry a stable code; API errors map them to
  RFC 9457 problem details.
- User-facing messages are concise and neutral: say what happened and how to
  fix it. No exclamation marks.

## Naming and files

- Files and directories: `kebab-case`. Types: `PascalCase`. Functions and
  variables: `camelCase`. SQL: `snake_case`.
- Names describe the domain (`availableBudget`, `cycleEnd`), matching the
  glossary in docs/domain.md.

## Comments

- Explain why, not what. Link the ADR or doc section for non-obvious rules.

## Dependencies

- Justify every new runtime dependency in the PR description (what, why,
  licence, maintenance). Anything with lock-in needs an ADR.
- No dependency may add telemetry or outbound calls by default.
