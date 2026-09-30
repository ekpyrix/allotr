import type {
  AppearanceBody,
  CustomThemeView,
  ThemeBodyV2,
} from '@allotr/shared';
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

export function saveAppearance(body: AppearanceBody) {
  return call(endpoints.saveAppearance, { body });
}

/** The user's custom themes, keyed by user like the appearance. */
export function themesQuery(userId: string) {
  return queryOptions({
    queryKey: ['settings', 'themes', userId],
    queryFn: async () => (await call(endpoints.themes)).themes,
  });
}

export function createTheme(body: ThemeBodyV2): Promise<CustomThemeView> {
  return call(endpoints.createTheme, { body });
}

export function updateTheme(
  id: string,
  body: ThemeBodyV2,
): Promise<CustomThemeView> {
  return call(endpoints.updateTheme, { params: { id }, body });
}

export async function deleteTheme(id: string): Promise<void> {
  await call(endpoints.deleteTheme, { params: { id } });
}
