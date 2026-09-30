import {
  importThemeText,
  type ThemeImportKind,
  type ThemeFileV2,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from './db/schema.ts';
import { RequestProblem } from './http/domain-errors.ts';
import { readSettings } from './settings.ts';
import { ThemeUrlError, type ThemeUrlRefusal } from './theme-url.ts';

// Importing a theme from a URL (plan PR 18): only while an admin allows
// it, at most IMPORTS_PER_HOUR per user, and the answer is a parsed draft
// for the editor, never a saved theme.

export const IMPORTS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

const refusedBeforeFetch: ReadonlySet<ThemeUrlRefusal> = new Set([
  'not_https',
  'credentials',
  'not_public',
  'unresolved',
]);

export type ThemeUrlFetcher = (url: string) => Promise<string>;

/** Imports per user in the last hour, kept in memory like the auth limits. */
export function createImportLimiter(now: () => Date) {
  const recent = new Map<string, number[]>();
  return (userId: string): boolean => {
    const at = now().getTime();
    const kept = (recent.get(userId) ?? []).filter((t) => at - t < HOUR_MS);
    if (kept.length >= IMPORTS_PER_HOUR) {
      recent.set(userId, kept);
      return false;
    }
    recent.set(userId, [...kept, at]);
    return true;
  };
}

/** The last path segment, which names a theme that has no name inside. */
function fileNameOf(url: string): string | undefined {
  try {
    const segment = new URL(url).pathname.split('/').pop();
    return segment === undefined || segment === ''
      ? undefined
      : decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

export async function importThemeFromUrl(
  db: Kysely<DB>,
  userId: string,
  url: string,
  fetchText: ThemeUrlFetcher,
  allowed: (userId: string) => boolean,
): Promise<{ kind: ThemeImportKind; themes: ThemeFileV2[] }> {
  const { themeUrlImport } = await readSettings(db);
  if (!themeUrlImport)
    throw new RequestProblem(
      403,
      'theme_url_import_off',
      'Importing themes from a URL is turned off on this server.',
    );
  if (!allowed(userId))
    throw new RequestProblem(
      429,
      'rate_limited',
      `At most ${String(IMPORTS_PER_HOUR)} imports from a URL an hour.`,
    );
  let text: string;
  try {
    text = await fetchText(url);
  } catch (error) {
    if (!(error instanceof ThemeUrlError)) throw error;
    throw refusedBeforeFetch.has(error.reason)
      ? new RequestProblem(400, 'theme_url_refused', error.message, [
          { path: '/url', message: error.reason },
        ])
      : new RequestProblem(502, 'theme_url_fetch_failed', error.message, [
          { path: '/url', message: error.reason },
        ]);
  }
  const result = importThemeText(text, fileNameOf(url));
  if (!result.ok)
    throw new RequestProblem(
      422,
      'theme_unreadable',
      result.reason === 'invalid'
        ? 'The file has problems.'
        : 'The address does not hold a theme file, palette file or terminal colour config.',
      result.problems.map((line) => {
        const [path = '', ...rest] = line.split(': ');
        return { path, message: rest.join(': ') };
      }),
    );
  return { kind: result.kind, themes: [...result.themes] };
}
