# 0003. TypeScript on Node.js LTS for all components

- Status: Accepted
- Date: 2026-09-27

## Context

Allotr has a pure domain core, an HTTP API, a web SPA, chat gateways, an MCP
server and a CLI. The web UI must be TypeScript regardless. The hard part of
the domain (integer money, double-entry, invariants) is small and can be made
correct in any typed language with property tests. As a self-hosted OSS
project, contributor accessibility and long-term runtime support matter.

Options: TypeScript end to end; Rust backend + TS web; Go backend + TS web;
Python. Runtimes: Node.js LTS, Bun, Deno 2.

## Decision

Use TypeScript for every component, on Node.js 24 LTS (moving to the next LTS
line as each enters Active LTS). Money is an integer number of minor units;
JavaScript numbers are exact up to 2^53, far beyond any personal balance.
Use pnpm workspaces with Turborepo, ESLint (typescript-eslint
strict-type-checked) with Prettier, and Vitest, fast-check and Playwright.

## Consequences

- One language and toolchain; Zod schemas shared across API, MCP, LLM output and web.
- Largest contributor pool and first-class library support (discord.js, grammY, MCP SDK, Better Auth).
- Weaker compile-time guarantees than Rust; correctness relies on strict
  type-checked linting, branded money types and property tests.
- Larger runtime footprint than a Go or Rust binary; acceptable for homelab and Raspberry Pi targets.
