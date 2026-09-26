# 0014. Project name and trademark check

- Status: Accepted
- Date: 2026-09-27

## Context

The project is named Allotr (from *allotment*). Before v1 publicity (docs
site, demo, container images on GHCR, a possible domain), the name should be
checked for conflicts with existing software or finance products and for
domain and package-name availability.

## Options

1. **Keep "Allotr"** after a conflict search (trademark databases such as
   USPTO/EUIPO/WIPO, GitHub, npm, Docker Hub, app stores) and secure the
   matching GitHub org, domain and package names.
2. **Rename before v1** if a conflict is found; renaming later breaks image
   names, URLs and user setups.
3. **Register a trademark.** Protects the name for forks and hosted
   offerings; costs money and needs a legal owner.

Also: a short trademark/brand policy in the README (forks must rename if
they change behaviour, as Firefox and others do) is common in OSS.

## Decision

Keep the name Allotr. Before any public launch (docs site, demo, first
published image):

- Search trademark databases (USPTO, EUIPO, WIPO) in classes 9 (software)
  and 36 (financial services), plus GitHub, npm, container registries and
  app stores.
- Claim the matching GitHub organisation, npm scope, GHCR namespace and domain.
- Add a short brand policy to the README: forks that change behaviour use a
  different name and logo.
- Avoid "calm" in taglines to stay clear of an existing finance app with a
  similar name and positioning.

No trademark registration for now.

## Consequences

- Low cost now; renaming stays possible until the first public release.
- Without registration, protection against confusing forks relies on the brand policy and goodwill.
