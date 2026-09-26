# 0008. Hono with Zod schemas as the single contract source

- Status: Accepted
- Date: 2026-09-27

## Context

The same shapes (transaction, proposal, summary) are needed by HTTP
validation, the published OpenAPI spec, MCP tool schemas and LLM structured
output. Maintaining a hand-written OpenAPI YAML file alongside TypeScript
types risks drift. External, non-TypeScript clients (agents, Home Assistant,
curl) need a standard HTTP API.

## Decision

Define schemas once with Zod in `packages/shared`. Serve the API with Hono
and `@hono/zod-openapi`, generating OpenAPI 3.1 at `/openapi.json`. Reuse
the same schemas for MCP tools (MCP TypeScript SDK, Streamable HTTP at
`/mcp`) and LLM structured output (Vercel AI SDK). The web UI is a React +
Vite SPA served as static files by the server.

## Consequences

- One source of truth; the OpenAPI spec is always in sync with the code.
- The spec is generated, so reviewing API changes means reviewing schema diffs and the generated spec in CI.
- Ties the contract to Zod's major versions.
