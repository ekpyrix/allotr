import { findPaletteTheme, THEME_FILE_FORMAT } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  checkDraft,
  draftFrom,
  draftFromFile,
  pickerValue,
  roleEntry,
  withAccentName,
  withNewAccent,
  withoutAccent,
  withRole,
  type ThemeDraft,
} from './draft.ts';

const mocha = findPaletteTheme('catppuccin-mocha', []);
if (mocha === undefined) throw new Error('no Catppuccin Mocha');

function draft(): ThemeDraft {
  return draftFrom(mocha as NonNullable<typeof mocha>, 'Midnight');
}

describe('checkDraft', () => {
  it('saves a shipped theme as a v2 body', () => {
    const check = checkDraft(draft());
    expect(check.problems).toEqual([]);
    expect(check.body).toMatchObject({
      name: 'Midnight',
      scheme: 'dark',
      family: 'catppuccin',
      palette: { neutrals: { base: '#1e1e2e' } },
    });
    expect(check.body?.roles).toBeUndefined();
  });

  it('points at a role set with fitting off that fails its contrast', () => {
    const faint = withRole(draft(), 'text-muted', {
      slot: 'surface2',
      fit: 'off',
    });
    const check = checkDraft(faint);
    expect(check.body).toBeNull();
    expect(check.problems.length).toBeGreaterThan(0);
    expect(check.problems[0]).toMatchObject({
      path: '/roles/text-muted',
      failure: { role: 'text-muted', reason: 'contrast' },
    });
  });

  it('fits a role that needs it, and says how far', () => {
    const dim = withRole(draft(), 'text-muted', { slot: 'surface2' });
    const check = checkDraft(dim);
    expect(check.body).not.toBeNull();
    const fit = check.resolved?.fitted['text-muted'];
    expect(fit?.deltaL).toBeGreaterThan(0);
  });

  it('marks bad colours and accent names without resolving', () => {
    const base = draft();
    const [first, second] = base.accents;
    if (first === undefined || second === undefined) throw new Error('accents');
    const broken: ThemeDraft = {
      ...base,
      name: ' ',
      neutrals: { ...base.neutrals, base: '#12' },
      accents: [
        { ...first, color: 'blue' },
        { ...second, name: first.name },
        ...base.accents.slice(2),
      ],
    };
    const check = checkDraft(broken);
    expect(check.badNeutrals).toEqual(['base']);
    expect(check.badAccentColors).toEqual([first.key]);
    expect(check.badAccentNames).toEqual([second.key]);
    expect(check.nameError).toBe(true);
    expect(check.resolved).toBeNull();
    expect(check.body).toBeNull();
  });
});

describe('editing', () => {
  it('stores only roles that differ from the default map', () => {
    const base = draft();
    const set = withRole(base, 'ring', { slot: 'pink' });
    expect(set.roles).toEqual({ ring: { slot: 'pink' } });
    expect(roleEntry(set, 'ring')).toEqual({ slot: 'pink' });
    const back = withRole(set, 'ring', roleEntry(base, 'ring'));
    expect(back.roles).toEqual({});
    expect(withRole(set, 'ring', undefined).roles).toEqual({});
  });

  it('renames an accent with the hues and roles that use it', () => {
    const base = withRole(draft(), 'ring', { slot: 'pink' });
    const pink = base.accents.find((accent) => accent.name === 'pink');
    if (pink === undefined) throw new Error('no pink');
    const renamed = withAccentName(base, pink.key, 'blossom');
    expect(renamed.hues.pink).toBe('blossom');
    expect(renamed.roles.ring).toEqual({ slot: 'blossom' });
    expect(checkDraft(renamed).body).not.toBeNull();
  });

  it('adds accents up to the limit and removes one, moving its hues', () => {
    let next: ThemeDraft | undefined = draft();
    let count = next.accents.length;
    while (next !== undefined && next.accents.length < 24) {
      next = withNewAccent(next);
      count += 1;
    }
    expect(next?.accents).toHaveLength(Math.min(24, count));
    expect(
      next === undefined ? undefined : withNewAccent(next),
    ).toBeUndefined();

    const base = draft();
    const red = base.accents.find((accent) => accent.name === 'red');
    if (red === undefined) throw new Error('no red');
    const without = withoutAccent(base, red.key);
    expect(without.accents.some((accent) => accent.name === 'red')).toBe(false);
    expect(without.hues.red).toBe(without.accents[0]?.name);
  });

  it('completes an imported palette', () => {
    const imported = draftFromFile({
      format: THEME_FILE_FORMAT,
      version: 2,
      name: 'Meadow Night',
      scheme: 'dark',
      palette: {
        neutrals: { base: '#1d2421', text: '#d8e2da' },
        accents: { red: '#e0736b' },
        hues: { red: 'red' },
      },
    });
    expect(imported.name).toBe('Meadow Night');
    expect(Object.keys(imported.neutrals)).toHaveLength(12);
    expect(imported.hues.blue).toBe('blue');
    expect(checkDraft(imported).body).not.toBeNull();
  });
});

describe('pickerValue', () => {
  it('expands short colours and blacks out bad ones', () => {
    expect(pickerValue('#ABC')).toBe('#aabbcc');
    expect(pickerValue('#12')).toBe('#000000');
  });
});
