import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type TestClient } from './testing/http-client.ts';
import { totpFromUri } from './testing/totp.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Account deletion (#68): a hard delete of the user and every row they own,
// confirmed by password and, with 2FA on, a TOTP or backup code. Names and
// amounts are made up.

const password = 'correct horse battery staple';
const baseUrl = 'http://allotr.example.test';

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

// Touches every per-user table: settings, accounts, categories, tags,
// entries and postings, rates, bills and payments, reconciliations.
const bundle = {
  format: 'allotr.bundle',
  version: 1,
  settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 1 },
  categories: [{ name: 'Snacks', kind: 'expense' }],
  accounts: [
    {
      name: 'Wallet',
      currency: 'EUR',
      openingBalance: eur(50_000),
      openedOn: '2026-05-01',
    },
  ],
  rates: [{ base: 'USD', quote: 'EUR', rate: '0.9', asOf: '2026-05-01' }],
  transactions: [
    {
      kind: 'expense',
      account: 'Wallet',
      amount: eur(1_200),
      category: 'Snacks',
      occurredOn: '2026-05-02',
      tags: ['treats'],
      ref: 'snack',
    },
  ],
  bills: [
    {
      name: 'Phone',
      account: 'Wallet',
      amount: eur(1_200),
      dueDay: 2,
      payments: [
        { dueOn: '2026-05-02', paidOn: '2026-05-02', transaction: 'snack' },
      ],
    },
  ],
  reconciliations: [
    {
      account: 'Wallet',
      on: '2026-05-03',
      stated: eur(48_800),
      computed: eur(48_800),
    },
  ],
};

async function tableNames(h: TwoUsers): Promise<string[]> {
  const { rows } = await sql<{ name: string }>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `.execute(h.db);
  return rows.map((row) => row.name);
}

/** Every row, in any table, with a value that names the user. */
async function rowsNaming(
  h: TwoUsers,
  id: string,
  email: string,
): Promise<string[]> {
  const found: string[] = [];
  for (const table of await tableNames(h)) {
    const { rows } = await sql<Record<string, unknown>>`
      SELECT * FROM ${sql.table(table)}
    `.execute(h.db);
    for (const row of rows) {
      const hit = Object.values(row).some(
        (value) =>
          typeof value === 'string' &&
          (value.includes(id) || value.toLowerCase().includes(email)),
      );
      if (hit) found.push(`${table}: ${JSON.stringify(row)}`);
    }
  }
  return found;
}

/** Row count per table that has a `user_id` column, for one user. */
async function userRowCounts(
  h: TwoUsers,
  id: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of await tableNames(h)) {
    const { rows: columns } = await sql<{ name: string }>`
      SELECT name FROM pragma_table_info(${table})
    `.execute(h.db);
    if (!columns.some((column) => column.name === 'user_id')) continue;
    const { rows } = await sql<{ count: number }>`
      SELECT count(*) AS count FROM ${sql.table(table)} WHERE user_id = ${id}
    `.execute(h.db);
    counts[table] = rows[0]?.count ?? 0;
  }
  return counts;
}

async function invite(h: TwoUsers, name: string): Promise<TestClient> {
  const created = await h.alice.post('/v1/invites', {});
  const token = new URL((created.body as { url: string }).url).pathname
    .split('/')
    .pop();
  const client = createClient(h.server.url, baseUrl);
  const accepted = await client.post(`/v1/invites/${token ?? ''}/accept`, {
    name,
    email: `${name}@example.test`,
    password,
  });
  expect(accepted.status).toBe(201);
  return client;
}

async function enrolTwoFactor(
  client: TestClient,
): Promise<{ totpURI: string; backupCodes: string[] }> {
  const enable = await client.post('/v1/auth/two-factor/enable', { password });
  expect(enable.status).toBe(200);
  const enrolment = enable.body as { totpURI: string; backupCodes: string[] };
  const verify = await client.post('/v1/auth/two-factor/verify-totp', {
    code: totpFromUri(enrolment.totpURI),
  });
  expect(verify.status).toBe(200);
  return enrolment;
}

function wrongCode(totpURI: string): string {
  return totpFromUri(totpURI) === '000000' ? '111111' : '000000';
}

describe('POST /v1/user/delete', () => {
  let h: TwoUsers;
  beforeAll(async () => {
    h = await startWithTwoUsers();
  });
  afterAll(() => h.close());

  describe('a user with data and 2FA', () => {
    let bobId: string;
    let totpURI: string;
    let aliceBefore: Record<string, number>;

    beforeAll(async () => {
      bobId = await userIdOf(h.bob);
      const imported = await h.bob.post('/v1/import', bundle);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      ({ totpURI } = await enrolTwoFactor(h.bob));
      expect(
        (await h.bob.put('/v1/settings/appearance', { mode: 'dark' })).status,
      ).toBe(200);
      await h.alice.post('/v1/import', bundle);
      aliceBefore = await userRowCounts(h, await userIdOf(h.alice));
    });

    it('has rows in every per-user table to start with', async () => {
      const counts = await userRowCounts(h, bobId);
      for (const [table, count] of Object.entries(counts))
        expect(count, table).toBeGreaterThan(0);
    });

    it('deletes nothing on a wrong password', async () => {
      const response = await h.bob.post('/v1/user/delete', {
        password: 'not the password at all',
        code: totpFromUri(totpURI),
      });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'wrong_password' });
      expect((await h.bob.get('/v1/session')).status).toBe(200);
    });

    it('deletes nothing on a wrong code', async () => {
      const before = await userRowCounts(h, bobId);
      const response = await h.bob.post('/v1/user/delete', {
        password,
        code: wrongCode(totpURI),
      });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'wrong_code' });
      expect(await userRowCounts(h, bobId)).toEqual(before);
    });

    it('asks for a code when 2FA is on', async () => {
      const response = await h.bob.post('/v1/user/delete', { password });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'code_required' });
    });

    it('removes the user and every row that names them', async () => {
      // The failed attempts above left a lockout record for the email.
      expect(await rowsNaming(h, bobId, 'bob@example.test')).not.toEqual([]);
      const other = createClient(h.server.url, baseUrl);
      await other.post('/v1/auth/sign-in/email', {
        email: 'bob@example.test',
        password,
      });

      const response = await h.bob.post('/v1/user/delete', {
        password,
        code: totpFromUri(totpURI),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(204);
      expect(response.headers.getSetCookie().join(';')).toMatch(
        /allotr\.session_token=;/,
      );

      expect(await rowsNaming(h, bobId, 'bob@example.test')).toEqual([]);
      expect((await h.bob.get('/v1/session')).status).toBe(401);
      expect(
        (
          await other.post('/v1/auth/sign-in/email', {
            email: 'bob@example.test',
            password,
          })
        ).status,
      ).toBe(401);
    });

    it('leaves other users untouched', async () => {
      expect(await userRowCounts(h, await userIdOf(h.alice))).toEqual(
        aliceBefore,
      );
      expect((await h.alice.get('/v1/today')).status).toBe(200);
    });
  });

  it('takes a backup code instead of a TOTP code, once', async () => {
    const carol = await invite(h, 'carol');
    const { backupCodes } = await enrolTwoFactor(carol);
    const [code = ''] = backupCodes;
    expect(
      (await carol.post('/v1/user/delete', { password, code: 'abcde-fghij' }))
        .status,
    ).toBe(403);
    const response = await carol.post('/v1/user/delete', { password, code });
    expect(response.status).toBe(204);
    expect((await carol.get('/v1/session')).status).toBe(401);
  });

  it('locks out after repeated wrong passwords', async () => {
    const dave = await invite(h, 'dave');
    const attempts = [];
    for (let i = 0; i < 6; i += 1)
      attempts.push(
        (await dave.post('/v1/user/delete', { password: `wrong ${String(i)}` }))
          .status,
      );
    expect(attempts).toEqual([403, 403, 403, 403, 403, 429]);
    // Locked means locked, even with the right password.
    expect((await dave.post('/v1/user/delete', { password })).status).toBe(429);
    await h.db.deleteFrom('sign_in_failures').execute();
    expect((await dave.post('/v1/user/delete', { password })).status).toBe(204);
  });

  it('keeps the only administrator while other users exist', async () => {
    const erin = await invite(h, 'erin');
    const refused = await h.alice.post('/v1/user/delete', { password });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'last_admin' });
    expect((await h.alice.get('/v1/session')).status).toBe(200);

    expect((await erin.post('/v1/user/delete', { password })).status).toBe(204);
    const aliceId = await userIdOf(h.alice);
    const response = await h.alice.post('/v1/user/delete', { password });
    expect(response.status).toBe(204);
    expect(await rowsNaming(h, aliceId, 'alice@example.test')).toEqual([]);
    // The instance is empty again, so onboarding reopens.
    const status = await createClient(h.server.url, baseUrl).get(
      '/v1/onboarding',
    );
    expect(status.body).toEqual({ required: true });
  });

  it('needs a signed-in user', async () => {
    const response = await createClient(h.server.url, baseUrl).post(
      '/v1/user/delete',
      { password },
    );
    expect(response.status).toBe(401);
  });
});
