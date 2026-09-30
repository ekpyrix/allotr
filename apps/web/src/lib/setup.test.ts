import { setupSteps } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { afterStep, followingStep, nextStep, previousStep } from './setup.ts';

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

describe('previousStep and followingStep', () => {
  it('has no step before the first', () => {
    expect(previousStep('region')).toBeNull();
    expect(previousStep('payday')).toBe('region');
  });

  it('has no step after the last', () => {
    expect(followingStep('bills')).toBeNull();
    expect(followingStep('region')).toBe('payday');
  });

  it('walks every step in order both ways', () => {
    for (const [i, step] of setupSteps.entries()) {
      expect(previousStep(step)).toBe(setupSteps[i - 1] ?? null);
      expect(followingStep(step)).toBe(setupSteps[i + 1] ?? null);
    }
  });

  it('keeps steps handled when going back', () => {
    const state = afterStep({ finished: false, handled: ['region'] }, 'payday');
    // Going back only changes what is shown; progress is not touched, and
    // handling the step again changes nothing.
    expect(afterStep(state, 'region')).toEqual(state);
    expect(nextStep(state)).toBe('spending');
  });
});
