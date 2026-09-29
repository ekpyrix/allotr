import { themeFileSchema, validateTheme, type ThemeBody } from '@allotr/shared';
import { t } from '@/messages/t';
import { pairText } from './labels.ts';

export type ImportResult =
  { ok: true; theme: ThemeBody } | { ok: false; problems: readonly string[] };

/**
 * Reads a theme file's text. A theme that parses but fails contrast is
 * refused with every failing pair listed, as the editor shows them.
 */
export function readThemeFile(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problems: [t('settings.appearance.unreadable')] };
  }
  const parsed = themeFileSchema.safeParse(data);
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `/${issue.path.map(String).join('/')}: ${issue.message}`,
      ),
    };
  const { name, scheme, tokens } = parsed.data;
  const failures = validateTheme(tokens, scheme);
  return failures.length === 0
    ? { ok: true, theme: { name, scheme, tokens } }
    : { ok: false, problems: failures.map(pairText) };
}
