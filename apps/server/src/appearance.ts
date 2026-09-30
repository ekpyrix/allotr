import { randomUUID } from 'node:crypto';
import {
  appearanceSchema,
  completePalette,
  contrastProblems,
  convertV1,
  CUSTOM_THEME_LIMIT,
  customThemeSchema,
  DEFAULT_PALETTE_THEME_ID,
  describeRoleFailure,
  familyIdSchema,
  findPaletteTheme,
  PALETTE_THEMES,
  paletteSchema,
  paletteTheme,
  resolveTheme,
  SHIPPED_THEMES,
  THEME_ID_ALIASES,
  THEME_SCHEMES,
  themeModeSchema,
  themeNameSchema,
  themeRolesSchema,
  themeSchemeSchema,
  themeTokensSchema,
  toThemeFileV2,
  tokensFromRoles,
  type AnyThemeBody,
  type Appearance,
  type AppearanceBody,
  type CustomTheme,
  type CustomThemeView,
  type PaletteTheme,
  type ThemeProblem,
} from '@allotr/shared';
import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import type { DB } from './db/schema.ts';
import { RequestProblem } from './http/domain-errors.ts';

// A user's appearance settings and custom themes (FR-W5, ADR 0016), each
// kept as one JSON value in user_settings. A value that no longer parses
// reads as the default rather than failing every page load. Themes stored
// as v1 (16 tokens) are read as v2 and written back as v2 with the next
// change to the list; there is no SQL migration.

const appearanceKey = 'appearance';
const themesKey = 'themes';

/** What a user gets before saving any appearance. */
export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system',
  ...DEFAULT_PALETTE_THEME_ID,
};

// An earlier id of a shipped theme reads as the theme it now names.
const themeId = (id: string) =>
  Object.hasOwn(THEME_ID_ALIASES, id) ? (THEME_ID_ALIASES[id] ?? id) : id;

// Values saved before themes had slots hold only the mode; those users
// had the built-in themes, now Allotr Classic.
const storedAppearanceSchema = z.object({
  mode: themeModeSchema,
  light: appearanceSchema.shape.light.default('allotr-classic-light'),
  dark: appearanceSchema.shape.dark.default('allotr-classic-dark'),
});

const storedThemeV2Schema = z.object({
  id: z.string().min(1),
  version: z.literal(2),
  name: themeNameSchema,
  scheme: themeSchemeSchema,
  family: familyIdSchema.optional(),
  palette: paletteSchema,
  roles: themeRolesSchema.default({}),
  /** The tokens a v1 body sent, returned as they were. */
  tokens: themeTokensSchema.optional(),
});
type StoredTheme = z.infer<typeof storedThemeV2Schema>;
const storedThemesSchema = z.array(
  z.union([storedThemeV2Schema, customThemeSchema]),
);

function upgrade(theme: StoredTheme | CustomTheme): StoredTheme {
  if ('version' in theme) return theme;
  return {
    id: theme.id,
    version: 2,
    name: theme.name,
    scheme: theme.scheme,
    ...convertV1(theme.tokens, theme.scheme),
    tokens: theme.tokens,
  };
}

function asPaletteTheme(theme: StoredTheme): PaletteTheme {
  return paletteTheme(theme.id, toThemeFileV2(theme));
}

function view(theme: StoredTheme): CustomThemeView {
  return {
    id: theme.id,
    version: 2,
    name: theme.name,
    scheme: theme.scheme,
    ...(theme.family === undefined ? {} : { family: theme.family }),
    palette: theme.palette,
    roles: theme.roles,
    tokens:
      theme.tokens ?? tokensFromRoles(asPaletteTheme(theme).resolved.roles),
  };
}

type Db = Kysely<DB> | Transaction<DB>;

async function readValue(
  db: Db,
  userId: string,
  key: string,
): Promise<unknown> {
  const row = await db
    .selectFrom('user_settings')
    .select('value')
    .where('user_id', '=', userId)
    .where('key', '=', key)
    .executeTakeFirst();
  if (row === undefined) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

async function writeValue(
  db: Db,
  userId: string,
  key: string,
  data: unknown,
  now: Date,
): Promise<void> {
  const value = JSON.stringify(data);
  const at = now.toISOString();
  await db
    .insertInto('user_settings')
    .values({ user_id: userId, key, value, updated_at: at })
    .onConflict((oc) =>
      oc.columns(['user_id', 'key']).doUpdateSet({ value, updated_at: at }),
    )
    .execute();
}

export async function readAppearance(
  db: Db,
  userId: string,
): Promise<Appearance> {
  const parsed = storedAppearanceSchema.safeParse(
    await readValue(db, userId, appearanceKey),
  );
  if (!parsed.success) return DEFAULT_APPEARANCE;
  const { mode, light, dark } = parsed.data;
  return { mode, light: themeId(light), dark: themeId(dark) };
}

async function storedThemes(db: Db, userId: string): Promise<StoredTheme[]> {
  const parsed = storedThemesSchema.safeParse(
    await readValue(db, userId, themesKey),
  );
  return parsed.success ? parsed.data.map(upgrade) : [];
}

export async function listThemes(
  db: Db,
  userId: string,
): Promise<CustomThemeView[]> {
  return (await storedThemes(db, userId)).map(view);
}

export async function saveAppearance(
  db: Kysely<DB>,
  userId: string,
  body: AppearanceBody,
  now: Date,
): Promise<Appearance> {
  return db.transaction().execute(async (trx) => {
    const current = await readAppearance(trx, userId);
    const appearance: Appearance = {
      mode: body.mode,
      light: themeId(body.light ?? current.light),
      dark: themeId(body.dark ?? current.dark),
    };
    const custom = (await storedThemes(trx, userId)).map(asPaletteTheme);
    for (const scheme of THEME_SCHEMES) {
      const theme = findPaletteTheme(appearance[scheme], custom);
      const path = [{ path: `/${scheme}`, message: appearance[scheme] }];
      if (theme === undefined)
        throw new RequestProblem(
          422,
          'theme_not_found',
          `There is no theme "${appearance[scheme]}".`,
          path,
        );
      if (theme.scheme !== scheme)
        throw new RequestProblem(
          422,
          'theme_scheme_mismatch',
          `"${theme.name}" is a ${theme.scheme} theme, not a ${scheme} one.`,
          path,
        );
    }
    await writeValue(trx, userId, appearanceKey, appearance, now);
    return appearance;
  });
}

function notFound(): RequestProblem {
  return new RequestProblem(404, 'theme_not_found', 'There is no such theme.');
}

function contrastProblem(problems: readonly ThemeProblem[]): RequestProblem {
  return new RequestProblem(
    422,
    'theme_contrast',
    'Some colours do not meet WCAG 2.2 AA contrast.',
    problems,
  );
}

/**
 * A body as the theme to store. A v1 body is checked by the v1 contrast
 * pairs, as before v2, and keeps its tokens; a v2 body is resolved, and a
 * role that cannot meet its contrast is refused at `/roles/<role>`, or at
 * `/palette` when the role comes from the default map. Contrast is
 * checked first: a failing theme is refused whatever else is wrong.
 */
function toStored(id: string, body: AnyThemeBody): StoredTheme {
  if ('tokens' in body) {
    const problems = contrastProblems(body.tokens, body.scheme);
    if (problems.length > 0) throw contrastProblem(problems);
    return upgrade({ id, ...body });
  }
  const palette = completePalette(body.palette, body.scheme);
  const roles = body.roles ?? {};
  const { failures } = resolveTheme({ scheme: body.scheme, palette, roles });
  if (failures.length > 0)
    throw contrastProblem(
      failures.map((failure) => ({
        path:
          roles[failure.role] === undefined
            ? '/palette'
            : `/roles/${failure.role}`,
        message: describeRoleFailure(failure),
      })),
    );
  return {
    id,
    version: 2,
    name: body.name,
    scheme: body.scheme,
    ...(body.family === undefined ? {} : { family: body.family }),
    palette,
    roles,
  };
}

// Custom theme names are unique among the shipped themes, old and new, and
// the user's own.
function checkName(name: string, others: readonly StoredTheme[]): void {
  const wanted = name.toLowerCase();
  const taken = [...SHIPPED_THEMES, ...PALETTE_THEMES, ...others].some(
    (theme) => theme.name.toLowerCase() === wanted,
  );
  if (taken)
    throw new RequestProblem(
      409,
      'theme_name_taken',
      'A theme with this name exists.',
    );
}

export async function createTheme(
  db: Kysely<DB>,
  userId: string,
  body: AnyThemeBody,
  now: Date,
): Promise<CustomThemeView> {
  return db.transaction().execute(async (trx) => {
    const themes = await storedThemes(trx, userId);
    const theme = toStored(randomUUID(), body);
    checkName(theme.name, themes);
    if (themes.length >= CUSTOM_THEME_LIMIT)
      throw new RequestProblem(
        409,
        'theme_limit',
        `You can keep up to ${String(CUSTOM_THEME_LIMIT)} custom themes.`,
      );
    await writeValue(trx, userId, themesKey, [...themes, theme], now);
    return view(theme);
  });
}

// A slot left pointing at a theme that is gone, or now of the other
// scheme, goes back to its default.
async function releaseSlots(
  trx: Transaction<DB>,
  userId: string,
  theme: StoredTheme,
  remaining: StoredTheme | undefined,
  now: Date,
): Promise<void> {
  const appearance = await readAppearance(trx, userId);
  const next = { ...appearance };
  for (const scheme of THEME_SCHEMES) {
    if (appearance[scheme] === theme.id && remaining?.scheme !== scheme)
      next[scheme] = DEFAULT_APPEARANCE[scheme];
  }
  if (next.light !== appearance.light || next.dark !== appearance.dark)
    await writeValue(trx, userId, appearanceKey, next, now);
}

export async function updateTheme(
  db: Kysely<DB>,
  userId: string,
  id: string,
  body: AnyThemeBody,
  now: Date,
): Promise<CustomThemeView> {
  return db.transaction().execute(async (trx) => {
    const themes = await storedThemes(trx, userId);
    const current = themes.find((theme) => theme.id === id);
    if (current === undefined) throw notFound();
    const theme = toStored(id, body);
    checkName(
      theme.name,
      themes.filter((other) => other.id !== id),
    );
    await writeValue(
      trx,
      userId,
      themesKey,
      themes.map((other) => (other.id === id ? theme : other)),
      now,
    );
    await releaseSlots(trx, userId, current, theme, now);
    return view(theme);
  });
}

export async function deleteTheme(
  db: Kysely<DB>,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const themes = await storedThemes(trx, userId);
    const current = themes.find((theme) => theme.id === id);
    if (current === undefined) throw notFound();
    await writeValue(
      trx,
      userId,
      themesKey,
      themes.filter((theme) => theme.id !== id),
      now,
    );
    await releaseSlots(trx, userId, current, undefined, now);
  });
}
