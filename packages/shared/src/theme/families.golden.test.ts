import { describe, expect, it } from 'vitest';
import { PALETTE_THEMES } from './palette-themes.ts';

// Golden: every shipped theme's resolved roles and what was fitted. A
// palette change, a new role or a change to fitting shows up here as a
// snapshot diff to review.

describe.each(PALETTE_THEMES.map((theme) => [theme.id, theme] as const))(
  '%s',
  (_id, theme) => {
    it('resolves with no failures', () => {
      expect(theme.resolved.failures).toEqual([]);
    });

    it('matches its snapshot', () => {
      expect({
        id: theme.id,
        roles: theme.resolved.roles,
        fitted: theme.resolved.fitted,
      }).toMatchSnapshot();
    });
  },
);
