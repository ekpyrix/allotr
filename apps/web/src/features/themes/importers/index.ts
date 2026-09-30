import {
  readThemeFile,
  THEME_FILE_FORMAT,
  themeFileV2Schema,
  type ThemeFileV2,
} from '@allotr/shared';
import { t } from '@/messages/t';
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
// checked as it is; anything else becomes palette drafts that the editor
// completes and fits, and that the person saves.

export type ImportKind = 'theme' | 'palette' | 'family' | 'terminal';

export type ImportResult =
  | { ok: true; kind: ImportKind; themes: readonly ThemeFileV2[] }
  | { ok: false; problems: readonly string[] };

/** "Tokyo Night Storm.yaml" → "Tokyo Night Storm". */
function baseName(fileName: string | undefined): string {
  const name = (fileName ?? '')
    .replace(/^.*[\\/]/u, '')
    .replace(/\.[^.]*$/u, '');
  return name.trim() === '' ? t('themes.import.untitled') : name;
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
  kind: ImportKind,
  themes: readonly ThemeFileV2[],
): ImportResult {
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
    : { ok: false, problems };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Reads an imported file's text; `fileName` names what has no name inside. */
export function importThemeText(text: string, fileName?: string): ImportResult {
  const name = baseName(fileName);
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
            problems: read.problems.map((p) => `${p.path}: ${p.message}`),
          };
    }
    const palette = parsePaletteJson(data, name, familyId(name));
    if (palette !== null)
      return checked(palette.length > 1 ? 'family' : 'palette', palette);
    const terminal = parseJsonColors(data, name);
    if (terminal !== null) return checked('terminal', terminal);
    return { ok: false, problems: [t('themes.import.unknownJson')] };
  }
  for (const parse of [parseBase16Yaml, parseTomlColors, parseKeyValueColors]) {
    const themes = parse(trimmed, name);
    if (themes !== null)
      return checked(
        parse === parseBase16Yaml ? 'palette' : 'terminal',
        themes,
      );
  }
  return { ok: false, problems: [t('themes.import.unknown')] };
}
