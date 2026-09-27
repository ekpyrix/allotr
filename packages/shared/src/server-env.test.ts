import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from './server-env.ts';

const valid = {
  ALLOTR_DATABASE_PATH: '/data/allotr.db',
  ALLOTR_BASE_URL: 'https://allotr.example.test',
  ALLOTR_SECRET_KEY: 'x'.repeat(32),
};

describe('serverEnvSchema', () => {
  it('applies defaults for optional variables', () => {
    expect(serverEnvSchema.parse(valid)).toEqual({
      ...valid,
      ALLOTR_HOST: '127.0.0.1',
      ALLOTR_PORT: 8080,
      ALLOTR_LOG_LEVEL: 'info',
    });
  });

  it('coerces the port from a string', () => {
    const env = serverEnvSchema.parse({ ...valid, ALLOTR_PORT: '9000' });
    expect(env.ALLOTR_PORT).toBe(9000);
  });

  it.each([
    ['a missing database path', { ALLOTR_DATABASE_PATH: undefined }],
    ['a base URL that is not http(s)', { ALLOTR_BASE_URL: 'ftp://x.test' }],
    ['a short secret key', { ALLOTR_SECRET_KEY: 'short' }],
    ['a port out of range', { ALLOTR_PORT: '70000' }],
    ['an unknown log level', { ALLOTR_LOG_LEVEL: 'loud' }],
  ])('rejects %s', (_, override) => {
    expect(serverEnvSchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });
});
