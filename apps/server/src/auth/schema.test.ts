import { getMigrations } from 'better-auth/db/migration';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../logger.ts';
import { testConfig } from '../testing/app.ts';
import { createTestDatabase } from '../testing/database.ts';
import { createAuth } from './auth.ts';
import { defaultAuthLimits } from './limits.ts';

describe('auth schema', () => {
  it('has every table and column Better Auth expects', async () => {
    const db = createTestDatabase();
    try {
      const auth = createAuth({
        db,
        config: testConfig,
        limits: defaultAuthLimits,
        logger: createLogger('silent'),
        now: () => new Date(0),
      });
      const { toBeCreated, toBeAdded } = await getMigrations(auth.options);
      expect(toBeCreated).toEqual([]);
      expect(toBeAdded).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
});
