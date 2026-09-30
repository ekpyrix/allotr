import { ROLES, THEME_FAMILIES } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { familyPair } from './families.ts';
import { ROLE_GROUPS } from './labels.ts';

function family(id: string) {
  const found = THEME_FAMILIES.find((f) => f.id === id);
  if (found === undefined) throw new Error(`no family ${id}`);
  return found;
}

describe('familyPair', () => {
  it('takes the lightest light and the darkest dark flavour', () => {
    const catppuccin = familyPair(family('catppuccin'));
    expect(catppuccin.light?.id).toBe('catppuccin-latte');
    expect(catppuccin.dark?.id).toBe('catppuccin-mocha');
    expect(familyPair(family('rose-pine')).dark?.name).toBe('Rosé Pine');
    expect(familyPair(family('tokyo-night')).dark?.name).toBe(
      'Tokyo Night Night',
    );
  });

  it('leaves out a scheme the family does not have', () => {
    const nord = familyPair(family('nord'));
    expect(nord.light).toBeUndefined();
    expect(nord.dark?.name).toBe('Nord');
  });
});

describe('ROLE_GROUPS', () => {
  it('lists every role once', () => {
    const listed = ROLE_GROUPS.flatMap(([, roles]) => roles);
    expect([...listed].sort()).toEqual([...ROLES].sort());
  });
});
