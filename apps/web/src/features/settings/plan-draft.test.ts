import { currencyCode, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { parsePercent, percentText, toPayYourselfFirst } from './plan-draft.ts';

describe('payday plan settings', () => {
  it('reads a percent as hundredths of a percent', () => {
    expect(parsePercent('10')).toBe(1000);
    expect(parsePercent('12.5')).toBe(1250);
    expect(parsePercent('0,25')).toBe(25);
    expect(parsePercent('100')).toBe(10_000);
    expect(parsePercent('101')).toBeNull();
    expect(parsePercent('ten')).toBeNull();
  });

  it('writes it back the way it was typed', () => {
    expect(percentText(1000)).toBe('10');
    expect(percentText(1250)).toBe('12.5');
    expect(percentText(25)).toBe('0.25');
  });

  it('builds the setting for each choice', () => {
    expect(
      toPayYourselfFirst('none', '', currencyCode('USD'), 'en-US'),
    ).toBeNull();
    expect(
      toPayYourselfFirst('percent', '10', currencyCode('USD'), 'en-US'),
    ).toEqual({
      kind: 'percent',
      basisPoints: 1000,
    });
    expect(
      toPayYourselfFirst('fixed', '300', currencyCode('USD'), 'en-US'),
    ).toEqual({
      kind: 'fixed',
      amount: money(30_000, currencyCode('USD')),
    });
    expect(toPayYourselfFirst('fixed', '', currencyCode('USD'), 'en-US')).toBe(
      'invalid',
    );
    expect(
      toPayYourselfFirst('percent', 'x', currencyCode('USD'), 'en-US'),
    ).toBe('invalid');
  });
});
