# 0011. No telemetry; every outbound call is opt-in and disclosed

- Status: Accepted
- Date: 2026-09-27

## Context

Allotr stores personal financial data on self-hosted infrastructure. Users
of self-hosted software expect no data to leave their server without their
knowledge. Some features legitimately need outbound calls (exchange rates,
LLM providers, chat platforms, OIDC, update checks). Telemetry would need a
project-run endpoint, a privacy policy and lasting user trust, which a
small project cannot justify.

## Decision

- Allotr has no telemetry, analytics, crash reporting or install counting.
  This is a project promise stated in the README and SECURITY.md.
- Every outbound call belongs to a feature the user enables, sends the
  minimum data, and is listed on Settings → Privacy and in `docs/privacy.md`.
- The version check (GitHub releases API) is off by default.
- Adding an outbound call requires updating the list and an ADR.
- CI runs the e2e suite with external network blocked to verify that a
  default install makes no outbound requests.

## Consequences

- Strong, verifiable privacy story; nothing to disclose in a privacy policy beyond third-party features.
- The maintainer gets no usage data; priorities come from issues and discussions.
- Users may miss security releases unless they enable the version check or watch GitHub releases; the release notes and README should say so.
