import { CUSTOM_THEME_LIMIT, darkTheme, lightTheme } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Appearance settings and custom themes through the API against real SQLite
// and migrations (FR-W5).

let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers();
});

afterAll(async () => {
  await h.close();
});

const defaults = {
  mode: 'system',
  light: 'catppuccin-latte',
  dark: 'catppuccin-mocha',
};

function theme(name: string, scheme: 'light' | 'dark' = 'light') {
  return { name, scheme, tokens: scheme === 'light' ? lightTheme : darkTheme };
}

async function create(body: unknown): Promise<string> {
  const response = await h.alice.post('/v1/settings/themes', body);
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

async function aliceAppearance() {
  return (await h.alice.get('/v1/settings/appearance')).body;
}

async function clearAlice() {
  await h.db
    .deleteFrom('user_settings')
    .where('user_id', '=', await userIdOf(h.alice))
    .where('key', 'in', ['appearance', 'themes'])
    .execute();
}

describe('appearance settings', () => {
  it('defaults to following the system with Catppuccin', async () => {
    const response = await h.alice.get('/v1/settings/appearance');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(defaults);
  });

  it('remembers the mode and slots per user', async () => {
    const next = { mode: 'dark', light: 'paper', dark: 'harbour' };
    const saved = await h.alice.put('/v1/settings/appearance', next);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(next);
    expect(await aliceAppearance()).toEqual(next);
    expect((await h.bob.get('/v1/settings/appearance')).body).toEqual(defaults);
  });

  it('keeps the slots a change leaves out', async () => {
    await h.alice.put('/v1/settings/appearance', {
      mode: 'light',
      light: 'paper',
      dark: 'harbour',
    });
    const saved = await h.alice.put('/v1/settings/appearance', {
      mode: 'dark',
    });
    expect(saved.body).toEqual({
      mode: 'dark',
      light: 'paper',
      dark: 'harbour',
    });
  });

  it.each([
    { mode: 'purple', light: 'light', dark: 'dark' },
    { light: 'light', dark: 'dark' },
    {},
    { mode: null },
    { mode: 'dark', light: '' },
  ])('rejects %j', async (body) => {
    const response = await h.alice.put('/v1/settings/appearance', body);
    expect(response.status).toBe(400);
  });

  it('refuses an unknown theme or one of the other scheme', async () => {
    const unknown = await h.alice.put('/v1/settings/appearance', {
      ...defaults,
      dark: 'nope',
    });
    expect(unknown.status).toBe(422);
    expect(unknown.body).toMatchObject({ code: 'theme_not_found' });
    const wrong = await h.alice.put('/v1/settings/appearance', {
      ...defaults,
      light: 'harbour',
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body).toMatchObject({
      code: 'theme_scheme_mismatch',
      errors: [{ path: '/light' }],
    });
  });

  it('reads a value saved before slots with Allotr Classic', async () => {
    await h.alice.put('/v1/settings/appearance', defaults);
    await h.db
      .updateTable('user_settings')
      .set({ value: '{"mode":"dark"}' })
      .where('user_id', '=', await userIdOf(h.alice))
      .where('key', '=', 'appearance')
      .execute();
    expect(await aliceAppearance()).toEqual({
      mode: 'dark',
      light: 'allotr-classic-light',
      dark: 'allotr-classic-dark',
    });
  });

  it('falls back to the defaults when the stored value no longer parses', async () => {
    await h.db
      .updateTable('user_settings')
      .set({ value: '"purple"' })
      .where('user_id', '=', await userIdOf(h.alice))
      .where('key', '=', 'appearance')
      .execute();
    expect(await aliceAppearance()).toEqual(defaults);
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(
      new URL('/v1/settings/appearance', h.server.url),
    );
    expect(anonymous.status).toBe(401);
  });
});

describe('custom themes', () => {
  it('starts empty and lists themes oldest first, per user', async () => {
    await clearAlice();
    expect((await h.alice.get('/v1/settings/themes')).body).toEqual({
      themes: [],
    });
    const first = await create(theme('Mint'));
    const second = await create(theme('Night', 'dark'));
    const list = await h.alice.get('/v1/settings/themes');
    expect(list.body).toMatchObject({
      themes: [
        { id: first, version: 2, ...theme('Mint') },
        { id: second, version: 2, ...theme('Night', 'dark') },
      ],
    });
    expect((await h.bob.get('/v1/settings/themes')).body).toEqual({
      themes: [],
    });
  });

  it('refuses a theme with a failing pair and lists the pair', async () => {
    const response = await h.alice.post('/v1/settings/themes', {
      ...theme('Faint'),
      tokens: { ...lightTheme, ring: '#e3eae4' },
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'theme_contrast',
      errors: [
        {
          path: '/tokens/ring',
          message: 'ring on background: 1.11:1, needs 3:1',
        },
        { path: '/tokens/ring', message: 'ring on plot: 1.00:1, needs 3:1' },
      ],
    });
  });

  it('holds only dark themes to the destructive button fills', async () => {
    await clearAlice();
    const tokens = { ...lightTheme, destructive: '#9c4a3c' };
    const dark = await h.alice.post('/v1/settings/themes', {
      ...theme('Ember', 'dark'),
      tokens,
    });
    expect(dark.status).toBe(422);
    expect(dark.body).toMatchObject({
      code: 'theme_contrast',
      errors: [
        {
          path: '/tokens/destructive',
          message:
            'destructive on input 30% over background: 4.10:1, needs 4.5:1',
        },
        {
          path: '/tokens/destructive',
          message:
            'destructive on input 50% over background: 3.31:1, needs 4.5:1',
        },
      ],
    });
    const light = await h.alice.post('/v1/settings/themes', {
      ...theme('Ember'),
      tokens,
    });
    expect(light.status).toBe(201);
  });

  it.each([
    { ...theme('Bad'), tokens: { ...lightTheme, ring: 'gold' } },
    { ...theme('Bad'), scheme: 'dim' },
    { ...theme(''), name: '   ' },
    { ...theme('Bad'), tokens: { ...lightTheme, sparkle: '#fff' } },
  ])('rejects a malformed body %#', async (body) => {
    const response = await h.alice.post('/v1/settings/themes', body);
    expect(response.status).toBe(400);
  });

  it('refuses a name already used, ignoring case', async () => {
    await clearAlice();
    await create(theme('Mint'));
    for (const name of ['mint', 'PAPER']) {
      const response = await h.alice.post('/v1/settings/themes', theme(name));
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'theme_name_taken' });
    }
  });

  it(`keeps at most ${String(CUSTOM_THEME_LIMIT)}`, async () => {
    await clearAlice();
    for (let i = 0; i < CUSTOM_THEME_LIMIT; i++)
      await create(theme(`T${String(i)}`));
    const response = await h.alice.post(
      '/v1/settings/themes',
      theme('One more'),
    );
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'theme_limit' });
  });

  it('changes a theme, keeping its own name free for it', async () => {
    await clearAlice();
    const id = await create(theme('Mint'));
    const changed = await h.alice.put(`/v1/settings/themes/${id}`, {
      ...theme('Mint'),
      tokens: { ...lightTheme, background: '#ffffff' },
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      id,
      tokens: { background: '#ffffff' },
    });
  });

  it('can be used in its slot, and only there', async () => {
    await clearAlice();
    const id = await create(theme('Mint'));
    const used = await h.alice.put('/v1/settings/appearance', {
      ...defaults,
      light: id,
    });
    expect(used.status).toBe(200);
    const wrong = await h.alice.put('/v1/settings/appearance', {
      ...defaults,
      dark: id,
    });
    expect(wrong.body).toMatchObject({ code: 'theme_scheme_mismatch' });
    const other = await h.bob.put('/v1/settings/appearance', {
      ...defaults,
      light: id,
    });
    expect(other.body).toMatchObject({ code: 'theme_not_found' });
  });

  it('frees its slot when the scheme changes', async () => {
    await clearAlice();
    const id = await create(theme('Mint'));
    await h.alice.put('/v1/settings/appearance', { ...defaults, light: id });
    await h.alice.put(`/v1/settings/themes/${id}`, theme('Mint', 'dark'));
    expect(await aliceAppearance()).toEqual(defaults);
  });

  it('frees its slot when deleted', async () => {
    await clearAlice();
    const id = await create(theme('Night', 'dark'));
    await h.alice.put('/v1/settings/appearance', {
      mode: 'dark',
      light: 'paper',
      dark: id,
    });
    const deleted = await h.alice.delete(`/v1/settings/themes/${id}`);
    expect(deleted.status).toBe(204);
    expect(await aliceAppearance()).toEqual({
      mode: 'dark',
      light: 'paper',
      dark: 'catppuccin-mocha',
    });
    expect((await h.alice.get('/v1/settings/themes')).body).toEqual({
      themes: [],
    });
  });

  it("cannot touch another user's theme", async () => {
    await clearAlice();
    const id = await create(theme('Mint'));
    const changed = await h.bob.put(`/v1/settings/themes/${id}`, theme('Mint'));
    expect(changed.status).toBe(404);
    expect((await h.bob.delete(`/v1/settings/themes/${id}`)).status).toBe(404);
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(new URL('/v1/settings/themes', h.server.url));
    expect(anonymous.status).toBe(401);
  });
});

describe('palette themes (v2)', () => {
  const dusk = {
    name: 'Dusk',
    scheme: 'dark',
    palette: {
      neutrals: { base: '#17151f', text: '#e4e0f2' },
      accents: { violet: '#b69cf0', rose: '#f09aa8' },
      hues: { purple: 'violet', red: 'rose' },
    },
  };

  it('creates a theme from a palette and completes it', async () => {
    await clearAlice();
    const response = await h.alice.post('/v1/settings/themes', dusk);
    expect(response.status).toBe(201);
    expect(response.headers.get('deprecation')).toBeNull();
    const created = response.body as {
      id: string;
      version: number;
      palette: { neutrals: object; hues: object };
      roles: object;
      tokens: Record<string, string>;
    };
    expect(created).toMatchObject({ version: 2, name: 'Dusk', roles: {} });
    expect(Object.keys(created.palette.neutrals)).toHaveLength(12);
    expect(Object.keys(created.palette.hues)).toHaveLength(8);
    // Clients before v2 paint the tokens taken from the resolved roles.
    expect(created.tokens.background).toBe('#17151f');
    const list = await h.alice.get('/v1/settings/themes');
    expect(list.body).toEqual({ themes: [created] });
  });

  it('converts a v1 body, keeps its tokens and marks it deprecated', async () => {
    await clearAlice();
    const response = await h.alice.post('/v1/settings/themes', theme('Mint'));
    expect(response.status).toBe(201);
    expect(response.headers.get('deprecation')).toBe('@1790726400');
    expect(response.body).toMatchObject({
      version: 2,
      tokens: lightTheme,
      palette: { neutrals: { base: lightTheme.background } },
    });
  });

  it('lists a theme stored as v1 as v2, and writes it back as v2', async () => {
    await clearAlice();
    await h.db
      .insertInto('user_settings')
      .values({
        user_id: await userIdOf(h.alice),
        key: 'themes',
        value: JSON.stringify([{ id: 'old-one', ...theme('Old') }]),
        updated_at: new Date().toISOString(),
      })
      .execute();
    expect((await h.alice.get('/v1/settings/themes')).body).toMatchObject({
      themes: [{ id: 'old-one', version: 2, tokens: lightTheme }],
    });
    await create(dusk);
    const row = await h.db
      .selectFrom('user_settings')
      .select('value')
      .where('user_id', '=', await userIdOf(h.alice))
      .where('key', '=', 'themes')
      .executeTakeFirstOrThrow();
    const stored = JSON.parse(row.value) as { id: string; version?: number }[];
    expect(stored.map((t) => t.version)).toEqual([2, 2]);
    expect(stored[0]?.id).toBe('old-one');
  });

  it('refuses a role that cannot meet contrast with fitting off', async () => {
    const response = await h.alice.post('/v1/settings/themes', {
      ...dusk,
      name: 'Exact',
      roles: { 'hero-ok': { slot: 'surface1', fit: 'off' } },
    });
    expect(response.status).toBe(422);
    const { code, errors } = response.body as {
      code: string;
      errors: { path: string; message: string }[];
    };
    expect(code).toBe('theme_contrast');
    expect(errors.map((error) => error.path)).toEqual(['/roles/hero-ok']);
    expect(errors[0]?.message).toMatch(/^hero-ok on card: .* needs 3:1$/);
  });

  it('refuses a role naming a colour the palette lacks', async () => {
    const response = await h.alice.post('/v1/settings/themes', {
      ...dusk,
      name: 'Typo',
      roles: { ring: { slot: 'lavendr' } },
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      errors: [{ path: '/roles/ring' }],
    });
  });

  it('refuses the name of a shipped flavour', async () => {
    const response = await h.alice.post('/v1/settings/themes', {
      ...dusk,
      name: 'catppuccin mocha',
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'theme_name_taken' });
  });

  it('reads the earlier built-in ids as Allotr Classic', async () => {
    const saved = await h.alice.put('/v1/settings/appearance', {
      mode: 'light',
      light: 'light',
      dark: 'dark',
    });
    expect(saved.body).toEqual({
      mode: 'light',
      light: 'allotr-classic-light',
      dark: 'allotr-classic-dark',
    });
    await h.db
      .updateTable('user_settings')
      .set({ value: '{"mode":"light","light":"light","dark":"harbour"}' })
      .where('user_id', '=', await userIdOf(h.alice))
      .where('key', '=', 'appearance')
      .execute();
    expect(await aliceAppearance()).toEqual({
      mode: 'light',
      light: 'allotr-classic-light',
      dark: 'harbour',
    });
  });

  it('takes any shipped flavour in its slot', async () => {
    const saved = await h.alice.put('/v1/settings/appearance', {
      mode: 'dark',
      light: 'rose-pine-dawn',
      dark: 'tokyo-night-storm',
    });
    expect(saved.status).toBe(200);
    const wrong = await h.alice.put('/v1/settings/appearance', {
      mode: 'dark',
      light: 'nord',
    });
    expect(wrong.body).toMatchObject({ code: 'theme_scheme_mismatch' });
  });
});
