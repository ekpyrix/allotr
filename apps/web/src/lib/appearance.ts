import type { ThemeMode } from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

/** Keyed by user, so one account's mode never shows for the next. */
export function appearanceQuery(userId: string) {
  return queryOptions({
    queryKey: ['settings', 'appearance', userId],
    queryFn: () => call(endpoints.appearance),
  });
}

export function saveAppearance(mode: ThemeMode) {
  return call(endpoints.saveAppearance, { body: { mode } });
}
