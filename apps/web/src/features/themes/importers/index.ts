import {
  importThemeText as importShared,
  type ThemeImportKind,
  type ThemeFileV2,
} from '@allotr/shared';
import { t } from '@/messages/t';

// The shared importers (ADR 0016) with this app's words for what they
// could not read.

export type ImportResult =
  | { ok: true; kind: ThemeImportKind; themes: readonly ThemeFileV2[] }
  | { ok: false; problems: readonly string[] };

export function importThemeText(text: string, fileName?: string): ImportResult {
  const result = importShared(text, fileName, t('themes.import.untitled'));
  if (result.ok) return result;
  switch (result.reason) {
    case 'unknown-json':
      return { ok: false, problems: [t('themes.import.unknownJson')] };
    case 'unknown':
      return { ok: false, problems: [t('themes.import.unknown')] };
    case 'invalid':
      return { ok: false, problems: result.problems };
  }
}
