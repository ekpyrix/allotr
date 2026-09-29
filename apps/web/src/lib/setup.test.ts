import { setupSteps } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { afterStep, nextStep } from './setup.ts';

describe('nextStep', () => {
  it('starts at the first step', () => {
    expect(nextStep({ finished: false, handled: [] })).toBe('region');
  });

  it('resumes at the first step not handled', () => {
    expect(nextStep({ finished: false, handled: ['region', 'payday'] })).toBe(
      'spending',
    );
    expect(nextStep({ finished: false, handled: ['payday'] })).toBe('region');
  });

  it('has nothing to show once finished', () => {
    expect(nextStep({ finished: true, handled: [] })).toBeNull();
  });
});

describe('afterStep', () => {
  it('adds the step once', () => {
    const once = afterStep({ finished: false, handled: [] }, 'region');
    expect(once).toEqual({ finished: false, handled: ['region'] });
    expect(afterStep(once, 'region')).toEqual(once);
  });

  it('finishes after the last step', () => {
    let state = {
      finished: false,
      handled: [] as (typeof setupSteps)[number][],
    };
    for (const step of setupSteps) state = afterStep(state, step);
    expect(state.finished).toBe(true);
    expect(state.handled).toEqual([...setupSteps]);
  });
});
