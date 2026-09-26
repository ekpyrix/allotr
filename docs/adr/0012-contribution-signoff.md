# 0012. Contribution sign-off policy

- Status: Accepted
- Date: 2026-09-27

## Context

Allotr is MIT-licensed and accepts outside contributions. The project needs
a clear record that contributors have the right to submit their code, without
adding friction that discourages first-time contributors.

## Options

1. **No sign-off (inbound = outbound).** Contributions are MIT by the act of
   submitting, per GitHub's terms of service. No friction; weakest paper trail.
2. **DCO (`Signed-off-by:` on every commit).** Used by the Linux kernel,
   GitLab and CNCF projects. A GitHub app or CI check enforces it. Light
   friction (`git commit -s`); clear provenance; no copyright assignment.
3. **CLA.** Contributors sign an agreement, sometimes granting relicensing
   rights. Strongest legal position; noticeable friction and distrust in
   the self-hosted community, especially if relicensing is possible.

## Decision

Use the Developer Certificate of Origin. Every commit in a pull request
carries a `Signed-off-by:` trailer (`git commit -s`), enforced by a DCO check
on PRs. CONTRIBUTING.md and the PR template explain how to sign off and how
to fix a missing sign-off. Squash-merge messages keep the sign-off trailers.

## Consequences

- Clear per-commit provenance with no transfer of rights.
- Small friction for first-time contributors; the failing check explains the fix.
- Relicensing would still need contributor consent (acceptable for MIT).
- `.gitmessage` and the agent rules must mention `-s`.
