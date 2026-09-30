import { describe, expect, it } from 'vitest';
import { transitionType } from './view-transitions.ts';

describe('transitionType', () => {
  it('fades through between top-level destinations', () => {
    expect(transitionType('/today', '/ledger')).toBe('tab');
    expect(transitionType('/settings', '/accounts')).toBe('tab');
  });

  it('pushes into a deeper page and pops back out', () => {
    expect(transitionType('/settings', '/settings/themes/new')).toBe('push');
    expect(transitionType('/settings/themes/new', '/settings')).toBe('pop');
  });

  it('pushes between pages under one destination', () => {
    expect(transitionType('/settings/themes/new', '/settings/themes/abc')).toBe(
      'push',
    );
  });

  it('does nothing without a move or outside the app', () => {
    expect(transitionType(undefined, '/today')).toBeNull();
    expect(transitionType('/today', '/today')).toBeNull();
    expect(transitionType('/sign-in', '/today')).toBeNull();
  });
});
