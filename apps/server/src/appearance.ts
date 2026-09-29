import { randomUUID } from 'node:crypto';
import {
  appearanceSchema,
  contrastProblems,
  CUSTOM_THEME_LIMIT,
  customThemeSchema,
  DEFAULT_APPEARANCE,
  findTheme,
  SHIPPED_THEMES,
  THEME_SCHEMES,
  themeModeSchema,
  type Appearance,
  type AppearanceBody,
  type CustomTheme,
  type ThemeBody,
} from '@allotr/shared';
import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import type { DB } from './db/schema.ts';
import { RequestProblem } from './http/domain-errors.ts';

// A user's appearance settings and custom themes (FR-W5), each kept as one
// JSON value in user_settings. A value that no longer parses reads as the
// default rather than failing every page load.

const appearanceKey = 'appearance';
const themesKey = 'themes';

// Values saved before themes had slots hold only the mode.
const storedAppearanceSchema = z.object({
  mode: themeModeSchema,
  light: appearanceSchema.shape.light.default(DEFAULT_APPEARANCE.light),
  dark: appearanceSchema.shape.dark.default(DEFAULT_APPEARANCE.dark),
});
const storedThemesSchema = z.array(customThemeSchema);

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
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
}

export async function listThemes(
  db: Db,
  userId: string,
): Promise<CustomTheme[]> {
  const parsed = storedThemesSchema.safeParse(
    await readValue(db, userId, themesKey),
  );
  return parsed.success ? parsed.data : [];
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
      light: body.light ?? current.light,
      dark: body.dark ?? current.dark,
    };
    const custom = await listThemes(trx, userId);
    for (const scheme of THEME_SCHEMES) {
      const theme = findTheme(appearance[scheme], custom);
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

// Contrast first: a failing theme is refused whatever else is wrong.
function check(body: ThemeBody, others: readonly CustomTheme[]): void {
  const problems = contrastProblems(body.tokens);
  if (problems.length > 0)
    throw new RequestProblem(
      422,
      'theme_contrast',
      'Some colour pairs do not meet WCAG 2.2 AA contrast.',
      problems,
    );
  const name = body.name.toLowerCase();
  const taken = [...SHIPPED_THEMES, ...others].some(
    (theme) => theme.name.toLowerCase() === name,
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
  body: ThemeBody,
  now: Date,
): Promise<CustomTheme> {
  return db.transaction().execute(async (trx) => {
    const themes = await listThemes(trx, userId);
    check(body, themes);
    if (themes.length >= CUSTOM_THEME_LIMIT)
      throw new RequestProblem(
        409,
        'theme_limit',
        `You can keep up to ${String(CUSTOM_THEME_LIMIT)} custom themes.`,
      );
    const theme: CustomTheme = { id: randomUUID(), ...body };
    await writeValue(trx, userId, themesKey, [...themes, theme], now);
    return theme;
  });
}

// A slot left pointing at a theme that is gone, or now of the other
// scheme, goes back to its default.
async function releaseSlots(
  trx: Transaction<DB>,
  userId: string,
  theme: CustomTheme,
  remaining: CustomTheme | undefined,
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
  body: ThemeBody,
  now: Date,
): Promise<CustomTheme> {
  return db.transaction().execute(async (trx) => {
    const themes = await listThemes(trx, userId);
    const current = themes.find((theme) => theme.id === id);
    if (current === undefined) throw notFound();
    check(
      body,
      themes.filter((theme) => theme.id !== id),
    );
    const theme: CustomTheme = { id, ...body };
    await writeValue(
      trx,
      userId,
      themesKey,
      themes.map((other) => (other.id === id ? theme : other)),
      now,
    );
    await releaseSlots(trx, userId, current, theme, now);
    return theme;
  });
}

export async function deleteTheme(
  db: Kysely<DB>,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const themes = await listThemes(trx, userId);
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
