import { appearanceSchema, type ThemeMode } from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.ts';

export const appearanceQuery = queryOptions({
  queryKey: ['settings', 'appearance'],
  queryFn: () => api('/v1/settings/appearance', appearanceSchema),
});

export function saveAppearance(mode: ThemeMode) {
  return api('/v1/settings/appearance', appearanceSchema, {
    method: 'PUT',
    body: { mode },
  });
}
