import { darkTheme, lightTheme, toThemeFile } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { readThemeFile } from './import.ts';

const file = toThemeFile({ name: 'Mint', scheme: 'light', tokens: lightTheme });

describe('readThemeFile', () => {
  it('reads a valid theme file', () => {
    expect(readThemeFile(JSON.stringify(file))).toEqual({
      ok: true,
      theme: { name: 'Mint', scheme: 'light', tokens: lightTheme },
    });
  });

  it('rejects a theme with a failing pair and lists the pair', () => {
    const faint = { ...file, tokens: { ...lightTheme, ring: '#e3eae4' } };
    expect(readThemeFile(JSON.stringify(faint))).toEqual({
      ok: false,
      problems: [
        'Focus ring on Page background: 1.11:1, needs 3:1',
        'Focus ring on Panel: 1.00:1, needs 3:1',
      ],
    });
  });

  it('checks a dark theme against the destructive button fills', () => {
    const ember = toThemeFile({
      name: 'Ember',
      scheme: 'dark',
      tokens: { ...darkTheme, destructive: '#d98270' },
    });
    expect(readThemeFile(JSON.stringify(ember))).toEqual({
      ok: false,
      problems: [
        'Destructive on Input outline 50% over Page background: 3.40:1, needs 4.5:1',
      ],
    });
    // The same colours pass as a light theme, whose buttons are not filled.
    expect(
      readThemeFile(JSON.stringify({ ...ember, scheme: 'light' })),
    ).toMatchObject({ ok: true });
  });

  it('points at the part of the file that is wrong', () => {
    const result = readThemeFile(
      JSON.stringify({ ...file, tokens: { ...lightTheme, ring: 'gold' } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^\/tokens\/ring: /);
  });

  it('says when the file is not JSON', () => {
    expect(readThemeFile('{ nope')).toEqual({
      ok: false,
      problems: ['The file is not valid JSON.'],
    });
  });
});
