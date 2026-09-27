import { describe, expect, it } from 'vitest';
import { findViolations, type Workspace } from './workspace-deps.ts';

const shared: Workspace = {
  name: '@allotr/shared',
  kind: 'package',
  dependencies: [],
};
const core: Workspace = {
  name: '@allotr/core',
  kind: 'package',
  dependencies: ['@allotr/shared'],
};
const parser: Workspace = {
  name: '@allotr/parser',
  kind: 'package',
  dependencies: ['@allotr/core', '@allotr/shared'],
};
const server: Workspace = {
  name: '@allotr/server',
  kind: 'app',
  dependencies: ['@allotr/parser', '@allotr/core', '@allotr/shared', 'hono'],
};
const valid = [shared, core, parser, server];

describe('findViolations', () => {
  it('accepts the documented direction', () => {
    expect(findViolations(valid)).toEqual([]);
  });

  it('rejects a package depending upward', () => {
    const upward = { ...core, dependencies: ['@allotr/parser'] };
    expect(findViolations([shared, upward, parser, server])).toEqual([
      '@allotr/core must not depend on @allotr/parser; allowed: @allotr/shared',
    ]);
  });

  it('rejects shared depending on anything in the workspace', () => {
    const coupled = { ...shared, dependencies: ['@allotr/core'] };
    expect(findViolations([coupled, core])).toEqual([
      '@allotr/shared must not depend on @allotr/core; allowed: none',
    ]);
  });

  it('rejects a package depending on an app', () => {
    const coupled = { ...parser, dependencies: ['@allotr/server'] };
    expect(findViolations([shared, core, coupled, server])).toContain(
      '@allotr/parser must not depend on app @allotr/server',
    );
  });

  it('rejects an app depending on another app', () => {
    const gateway: Workspace = {
      name: '@allotr/gateway',
      kind: 'app',
      dependencies: ['@allotr/server'],
    };
    expect(findViolations([...valid, gateway])).toEqual([
      '@allotr/gateway must not depend on app @allotr/server',
    ]);
  });

  it('rejects a package missing from the dependency map', () => {
    const unknown: Workspace = {
      name: '@allotr/extra',
      kind: 'package',
      dependencies: [],
    };
    expect(findViolations([...valid, unknown])).toEqual([
      '@allotr/extra is not in the allowed dependency map in scripts/workspace-deps.ts',
    ]);
  });
});
