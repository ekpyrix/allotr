import { readFileSync } from 'node:fs';
import { categoryIcons } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  componentName,
  iconNames,
  iconsTsx,
  pathsOf,
} from './generate-icons.ts';
import { CATEGORY_ICON_MAP } from './icons.manifest.ts';

describe('icon manifest', () => {
  it('maps every stored category icon key, and nothing else', () => {
    expect(Object.keys(CATEGORY_ICON_MAP).sort()).toEqual(
      [...categoryIcons].sort(),
    );
  });

  it('uses -line glyphs for categories', () => {
    for (const icon of Object.values(CATEGORY_ICON_MAP))
      expect(icon).toMatch(/-line$/);
  });
});

describe('generator', () => {
  it('is what is checked in', () => {
    const current = readFileSync(
      new URL('../src/generated/icons.tsx', import.meta.url),
      'utf8',
    );
    expect(current).toBe(iconsTsx());
  });

  it('exports one component per icon', () => {
    const source = iconsTsx();
    for (const icon of iconNames())
      expect(source).toContain(`export function ${componentName(icon)}(`);
  });

  it('names components in PascalCase', () => {
    expect(componentName('arrow-down-s-line')).toBe('IconArrowDownSLine');
  });

  it('drops the empty placeholder path', () => {
    expect(
      pathsOf(
        '<svg><path fill="none" d="M0 0h24v24H0z"/><path d="M1 1"/></svg>',
      ),
    ).toEqual(['M1 1']);
  });
});
