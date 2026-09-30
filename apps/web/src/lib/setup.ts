import { setupSteps, type SetupState, type SetupStep } from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// Setup after first sign-in (FR-W7): where the user is, kept on the server
// so leaving and signing in again resumes at the same step.

export const setupQuery = queryOptions({
  queryKey: ['setup'],
  queryFn: () => call(endpoints.setup),
  // Once finished, setup never comes back.
  staleTime: (query) => (query.state.data?.finished === true ? Infinity : 0),
});

export function saveSetup(state: SetupState) {
  return call(endpoints.saveSetup, { body: state });
}

/** The step to show: the first one not yet saved or skipped. */
export function nextStep(state: SetupState): SetupStep | null {
  if (state.finished) return null;
  return setupSteps.find((step) => !state.handled.includes(step)) ?? null;
}

/**
 * Progress after saving or skipping `step`. Handling the last step
 * finishes setup.
 */
export function afterStep(state: SetupState, step: SetupStep): SetupState {
  const handled = state.handled.includes(step)
    ? state.handled
    : [...state.handled, step];
  return {
    finished: setupSteps.every((s) => handled.includes(s)),
    handled,
  };
}

/** The step before `step`, or null on the first one. */
export function previousStep(step: SetupStep): SetupStep | null {
  return setupSteps[setupSteps.indexOf(step) - 1] ?? null;
}

/** The step after `step`, or null on the last one. */
export function followingStep(step: SetupStep): SetupStep | null {
  return setupSteps[setupSteps.indexOf(step) + 1] ?? null;
}
