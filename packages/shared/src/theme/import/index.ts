import {
  readThemeFile,
  themeFileV2Schema,
  type ThemeFileV2,
} from '../palette-themes.ts';
import { THEME_FILE_FORMAT } from '../themes.ts';
import {
  parseBase16Yaml,
  parseJsonColors,
  parseKeyValueColors,
  parsePaletteJson,
  parseTomlColors,
  parseXmlPlistColors,
} from './formats.ts';

// "Theme file, palette file or terminal colour config" (ADR 0016): the
// shape of the text picks the parser. An Allotr theme file is read and
// checked as it is; anything else becomes palette drafts that an editor
// completes and fits before anything is saved. The web app reads files
// with it, and the server reads what it fetches from a URL.

export type ThemeImportKind = 'theme' | 'palette' | 'family' | 'terminal';

export type ThemeImportRefusal =
  /** JSON, but not a theme, palette or terminal scheme. */
  | 'unknown-json'
  /** No known shape. */
  | 'unknown'
  /** A known shape with problems, listed as `path: message`. */
  | 'invalid';

export type ThemeImportResult =
  | { ok: true; kind: ThemeImportKind; themes: readonly ThemeFileV2[] }
  | { ok: false; reason: ThemeImportRefusal; problems: readonly string[] };

/** "Tokyo Night Storm.yaml" → "Tokyo Night Storm". */
function baseName(fileName: string | undefined, untitled: string): string {
  const name = (fileName ?? '')
    .replace(/^.*[\\/]/u, '')
    .replace(/\.[^.]*$/u, '');
  return name.trim() === '' ? untitled : name;
}

function familyId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 32);
  return /^[a-z]/u.test(slug) ? slug : `imported-${slug}`.slice(0, 32);
}

function checked(
  kind: ThemeImportKind,
  themes: readonly ThemeFileV2[],
): ThemeImportResult {
  const problems = themes.flatMap((theme) => {
    const parsed = themeFileV2Schema.safeParse(theme);
    return parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) => `/${issue.path.map(String).join('/')}: ${issue.message}`,
        );
  });
  return problems.length === 0
    ? { ok: true, kind, themes }
    : { ok: false, reason: 'invalid', problems };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Reads an imported file's text. `fileName` names what has no name
 * inside; without one, `untitled` does.
 */
export function importThemeText(
  text: string,
  fileName?: string,
  untitled = 'Imported theme',
): ThemeImportResult {
  const name = baseName(fileName, untitled);
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    const themes = parseXmlPlistColors(trimmed, name);
    if (themes !== null) return checked('terminal', themes);
  }
  const data = parseJson(trimmed);
  if (data !== undefined) {
    if (
      typeof data === 'object' &&
      data !== null &&
      'format' in data &&
      data.format === THEME_FILE_FORMAT
    ) {
      const read = readThemeFile(data);
      return read.ok
        ? { ok: true, kind: 'theme', themes: [read.theme] }
        : {
            ok: false,
            reason: 'invalid',
            problems: read.problems.map((p) => `${p.path}: ${p.message}`),
          };
    }
    const palette = parsePaletteJson(data, name, familyId(name));
    if (palette !== null)
      return checked(palette.length > 1 ? 'family' : 'palette', palette);
    const terminal = parseJsonColors(data, name);
    if (terminal !== null) return checked('terminal', terminal);
    return { ok: false, reason: 'unknown-json', problems: [] };
  }
  for (const parse of [parseBase16Yaml, parseTomlColors, parseKeyValueColors]) {
    const themes = parse(trimmed, name);
    if (themes !== null)
      return checked(
        parse === parseBase16Yaml ? 'palette' : 'terminal',
        themes,
      );
  }
  return { ok: false, reason: 'unknown', problems: [] };
}

export { hexOf } from './colors.ts';
