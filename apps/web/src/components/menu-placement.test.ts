import { describe, expect, it } from 'vitest';
import { menuPresentation, menuRowHeight } from './menu-placement.ts';

describe('menuPresentation', () => {
  it.each([
    [0, 'sheet'],
    [599, 'sheet'],
    [600, 'popover'],
    [1440, 'popover'],
  ] as const)('%i px is a %s', (width, expected) => {
    expect(menuPresentation(width)).toBe(expected);
  });
});

describe('menuRowHeight', () => {
  it('is 30 px in popovers and 44 px in sheets, in rem', () => {
    expect(menuRowHeight('popover')).toBe(1.875);
    expect(menuRowHeight('sheet')).toBe(2.75);
  });
});
