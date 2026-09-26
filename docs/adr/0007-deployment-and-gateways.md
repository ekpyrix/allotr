# 0007. Single image, supervised server and gateway processes

- Status: Accepted
- Date: 2026-09-27

## Context

The web UI must offer full manual control. Chat gateways are optional and
should run in their own process so a platform library crash cannot take down
the API. AI features are optional behind one toggle. Self-hosters expect a
single-container install on NAS systems, container managers and small
single-board computers. A common pattern for multi-platform chat agents
(for example Hermes Agent, MIT) is one gateway process hosting all platform
adapters, supervised inside the image.

## Decision

Build one multi-arch image. s6-overlay supervises two processes: `server`
(core, API, web, scheduler, AI module) and `gateway` (one process hosting
all enabled platform adapters). The gateway talks to the server only via the
public HTTP API with a service token, pulls its platform configuration from
the server, and idles when no platform is configured. `ALLOTR_ROLE` runs a
single role for users who prefer separate containers. The AI module lives
inside the server behind `AI_ENABLED`; a local LLM runs as its own upstream
container behind a compose profile.

## Consequences

- One image to build, sign and scan; a one-container default install.
- Real process isolation and automatic restarts without Docker orchestration.
- Gateways stay thin by construction (API-only boundary).
- Two processes per container departs from strict one-process-per-container practice; mitigated by the role split option.
