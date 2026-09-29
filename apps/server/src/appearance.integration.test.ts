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

const defaults = { mode: 'system', light: 'light', dark: 'dark' };

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
  it('defaults to following the system with the built-in themes', async () => {
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

  it('reads a value saved before slots with the default themes', async () => {
    await h.alice.put('/v1/settings/appearance', defaults);
    await h.db
      .updateTable('user_settings')
      .set({ value: '{"mode":"dark"}' })
      .where('user_id', '=', await userIdOf(h.alice))
      .where('key', '=', 'appearance')
      .execute();
    expect(await aliceAppearance()).toEqual({ ...defaults, mode: 'dark' });
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
    expect(list.body).toEqual({
      themes: [
        { id: first, ...theme('Mint') },
        { id: second, ...theme('Night', 'dark') },
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
      dark: 'dark',
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
