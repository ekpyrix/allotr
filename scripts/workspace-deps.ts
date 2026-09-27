// Dependency direction: apps/* → parser → core → shared (AGENTS.md "Layout").
// Apps may use any package but never another app; packages only use the
// packages listed below them.
const allowedPackageDeps: Readonly<Record<string, readonly string[]>> = {
  '@allotr/shared': [],
  '@allotr/core': ['@allotr/shared'],
  '@allotr/parser': ['@allotr/core', '@allotr/shared'],
};

export interface Workspace {
  readonly name: string;
  readonly kind: 'app' | 'package';
  readonly dependencies: readonly string[];
}

export function findViolations(workspaces: readonly Workspace[]): string[] {
  const kindByName = new Map(workspaces.map((w) => [w.name, w.kind]));
  const violations: string[] = [];

  for (const workspace of workspaces) {
    const allowed =
      workspace.kind === 'package'
        ? allowedPackageDeps[workspace.name]
        : undefined;
    if (workspace.kind === 'package' && allowed === undefined) {
      violations.push(
        `${workspace.name} is not in the allowed dependency map in scripts/workspace-deps.ts`,
      );
      continue;
    }

    for (const dependency of workspace.dependencies) {
      const dependencyKind = kindByName.get(dependency);
      if (dependencyKind === undefined) continue;

      if (dependencyKind === 'app') {
        violations.push(
          `${workspace.name} must not depend on app ${dependency}`,
        );
      } else if (allowed !== undefined && !allowed.includes(dependency)) {
        violations.push(
          `${workspace.name} must not depend on ${dependency}; allowed: ${allowed.join(', ') || 'none'}`,
        );
      }
    }
  }

  return violations;
}
