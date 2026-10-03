import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { spentShare } from './share.ts';

const usd = (n: number) => money(n, 'USD');

describe('spentShare', () => {
  it('is spent over spent plus left', () => {
    expect(spentShare(usd(25000), usd(75000))).toBe(25);
  });

  it('is empty with nothing spent and full when nothing is left', () => {
    expect(spentShare(usd(0), usd(90000))).toBe(0);
    expect(spentShare(usd(0), usd(0))).toBe(0);
    expect(spentShare(usd(500), usd(0))).toBe(100);
  });
});
