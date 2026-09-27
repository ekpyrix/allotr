import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Appearance settings through the API against real SQLite and migrations
// (FR-W5).

let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers();
});

afterAll(async () => {
  await h.close();
});

describe('appearance settings', () => {
  it('defaults to following the system', async () => {
    const response = await h.alice.get('/v1/settings/appearance');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ mode: 'system' });
  });

  it('remembers the mode per user', async () => {
    const saved = await h.alice.put('/v1/settings/appearance', {
      mode: 'dark',
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ mode: 'dark' });
    expect((await h.alice.get('/v1/settings/appearance')).body).toEqual({
      mode: 'dark',
    });
    expect((await h.bob.get('/v1/settings/appearance')).body).toEqual({
      mode: 'system',
    });
  });

  it.each([{ mode: 'purple' }, {}, { mode: null }])(
    'rejects %j',
    async (body) => {
      const response = await h.alice.put('/v1/settings/appearance', body);
      expect(response.status).toBe(400);
    },
  );

  it('falls back to system when the stored value no longer parses', async () => {
    await h.db
      .updateTable('user_settings')
      .set({ value: '"purple"' })
      .where('user_id', '=', await userIdOf(h.alice))
      .where('key', '=', 'appearance')
      .execute();
    expect((await h.alice.get('/v1/settings/appearance')).body).toEqual({
      mode: 'system',
    });
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(
      new URL('/v1/settings/appearance', h.server.url),
    );
    expect(anonymous.status).toBe(401);
  });
});
