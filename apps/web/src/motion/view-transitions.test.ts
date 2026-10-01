import { describe, expect, it } from 'vitest';
import { transitionType } from './view-transitions.ts';

describe('transitionType', () => {
  it('switches between top-level destinations instantly', () => {
    expect(transitionType('/', '/transactions')).toBeNull();
    expect(transitionType('/settings', '/accounts')).toBeNull();
    expect(transitionType('/budget', '/reports')).toBeNull();
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

  it('treats the views under a destination as deeper pages', () => {
    expect(transitionType('/reports', '/reports/history')).toBe('push');
    expect(transitionType('/reports/history', '/reports')).toBe('pop');
    expect(transitionType('/accounts', '/accounts/savings')).toBe('push');
    expect(transitionType('/', '/accounts/savings')).toBeNull();
  });

  it('does nothing without a move or outside the app', () => {
    expect(transitionType(undefined, '/')).toBeNull();
    expect(transitionType('/', '/')).toBeNull();
    expect(transitionType('/sign-in', '/')).toBeNull();
  });
});
