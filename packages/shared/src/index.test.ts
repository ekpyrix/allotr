import { expect, it } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { workspaceName } from './index.ts';

it('matches the package name', () => {
  expect(workspaceName).toBe(manifest.name);
});
