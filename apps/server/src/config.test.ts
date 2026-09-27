import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const env = {
  ALLOTR_DATABASE_PATH: '/data/allotr.db',
  ALLOTR_BASE_URL: 'https://allotr.example.test/',
  ALLOTR_SECRET_KEY: 'fake-secret-key-for-tests-0123456789',
  ALLOTR_PORT: '9000',
};

describe('loadConfig', () => {
  it('maps the environment to a config object', () => {
    expect(loadConfig(env)).toEqual({
      databasePath: '/data/allotr.db',
      baseUrl: 'https://allotr.example.test/',
      secretKey: 'fake-secret-key-for-tests-0123456789',
      host: '127.0.0.1',
      port: 9000,
      logLevel: 'info',
    });
  });

  it('names every invalid variable without echoing values', () => {
    const secret = 'too-short-secret';
    let error: unknown;
    try {
      loadConfig({ ALLOTR_SECRET_KEY: secret });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toContain('ALLOTR_DATABASE_PATH');
    expect(message).toContain('ALLOTR_BASE_URL');
    expect(message).toContain('ALLOTR_SECRET_KEY');
    expect(message).not.toContain(secret);
  });
});
