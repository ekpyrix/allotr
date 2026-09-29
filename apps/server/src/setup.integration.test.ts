import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Setup progress through the API against real SQLite and migrations
// (FR-W7).

let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers();
});

afterAll(async () => {
  await h.close();
});

describe('setup progress', () => {
  it('starts unfinished for a user without accounts', async () => {
    const response = await h.alice.get('/v1/settings/setup');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ finished: false, handled: [] });
  });

  it('remembers handled steps per user', async () => {
    const saved = await h.alice.put('/v1/settings/setup', {
      finished: false,
      handled: ['region', 'payday'],
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      finished: false,
      handled: ['region', 'payday'],
    });
    expect((await h.alice.get('/v1/settings/setup')).body).toEqual({
      finished: false,
      handled: ['region', 'payday'],
    });
    expect((await h.bob.get('/v1/settings/setup')).body).toEqual({
      finished: false,
      handled: [],
    });
  });

  it('keeps stored progress once accounts exist', async () => {
    const created = await h.alice.post('/v1/accounts', {
      name: 'Everyday',
      currency: 'USD',
    });
    expect(created.status).toBe(201);
    expect((await h.alice.get('/v1/settings/setup')).body).toEqual({
      finished: false,
      handled: ['region', 'payday'],
    });
  });

  it('counts a user with accounts and no progress as finished', async () => {
    const created = await h.bob.post('/v1/accounts', {
      name: 'Wallet',
      currency: 'USD',
    });
    expect(created.status).toBe(201);
    expect((await h.bob.get('/v1/settings/setup')).body).toEqual({
      finished: true,
      handled: [],
    });
  });

  it.each([
    {},
    { finished: false },
    { finished: false, handled: ['nowhere'] },
    { finished: false, handled: ['region', 'region'] },
    { finished: 'yes', handled: [] },
  ])('rejects %j', async (body) => {
    const response = await h.alice.put('/v1/settings/setup', body);
    expect(response.status).toBe(400);
  });

  it('falls back to the ledger when the stored value no longer parses', async () => {
    await h.db
      .updateTable('user_settings')
      .set({ value: '"halfway"' })
      .where('user_id', '=', await userIdOf(h.alice))
      .where('key', '=', 'setup')
      .execute();
    expect((await h.alice.get('/v1/settings/setup')).body).toEqual({
      finished: true,
      handled: [],
    });
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(new URL('/v1/settings/setup', h.server.url));
    expect(anonymous.status).toBe(401);
  });
});
