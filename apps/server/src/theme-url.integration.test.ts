import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ThemeUrlError, type ThemeUrlRefusal } from './theme-url.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Importing a theme from a URL through the API (plan PR 18). The network
// is replaced: each address below answers with a made-up file or fails
// the way the guarded fetcher would. theme-url.test.ts covers the guard.

const meadow = [
  '# Meadow Night: made-up colours for tests',
  '[colors.primary]',
  "background = '#1d2421'",
  "foreground = '#d8e2da'",
  '[colors.normal]',
  'red = "#e0736b"',
  'green = "#8fcf8a"',
  'blue = "#74a8e0"',
].join('\n');

// Each address answers with a file's text, or a fetch refusal's reason.
const answers: Readonly<Record<string, string>> = {
  'https://themes.example.test/meadow-night.toml': meadow,
  'https://themes.example.test/notes.txt': 'just some words',
  'https://internal.example.test/theme.json': 'not_public',
  'https://themes.example.test/moved': 'redirect',
  'https://themes.example.test/huge': 'too_large',
  'https://themes.example.test/slow': 'timeout',
};

const fetched: string[] = [];

async function fakeFetch(url: string): Promise<string> {
  fetched.push(url);
  const answer = answers[url];
  if (answer === undefined) throw new ThemeUrlError('status', 'Not found.');
  if (answer.includes('\n') || answer.includes(' '))
    return Promise.resolve(answer);
  throw new ThemeUrlError(answer as ThemeUrlRefusal, answer);
}

let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ fetchThemeUrl: fakeFetch });
});

afterAll(async () => {
  await h.close();
});

const importUrl = (client: TwoUsers['alice'], url: string) =>
  client.post('/v1/settings/themes/import-url', { url });

describe('theme import from a URL', () => {
  it('is off until an admin turns it on, and the server fetches nothing', async () => {
    expect((await h.alice.get('/v1/session')).body).toMatchObject({
      themeUrlImport: false,
    });
    const refused = await importUrl(
      h.alice,
      'https://themes.example.test/meadow-night.toml',
    );
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'theme_url_import_off' });
    expect(fetched).toEqual([]);

    // Only an admin can turn it on.
    expect(
      (await h.bob.patch('/v1/admin/settings', { themeUrlImport: true }))
        .status,
    ).toBe(403);
    const on = await h.alice.patch('/v1/admin/settings', {
      themeUrlImport: true,
    });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ themeUrlImport: true });
    expect((await h.bob.get('/v1/session')).body).toMatchObject({
      themeUrlImport: true,
    });
  });

  it('answers with the parsed theme and saves nothing', async () => {
    const response = await importUrl(
      h.bob,
      'https://themes.example.test/meadow-night.toml',
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      kind: 'terminal',
      themes: [
        {
          version: 2,
          name: 'meadow-night',
          scheme: 'dark',
          palette: {
            neutrals: { base: '#1d2421', text: '#d8e2da' },
            accents: { red: '#e0736b' },
          },
        },
      ],
    });
    expect((await h.bob.get('/v1/settings/themes')).body).toEqual({
      themes: [],
    });
  });

  it('refuses a non-public address before fetching', async () => {
    const response = await importUrl(
      h.bob,
      'https://internal.example.test/theme.json',
    );
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'theme_url_refused',
      errors: [{ path: '/url', message: 'not_public' }],
    });
  });

  it('reports a failed fetch: redirect, size and timeout', async () => {
    for (const [url, reason] of [
      ['https://themes.example.test/moved', 'redirect'],
      ['https://themes.example.test/huge', 'too_large'],
      ['https://themes.example.test/slow', 'timeout'],
    ] as const) {
      const response = await importUrl(h.bob, url);
      expect(response.status, url).toBe(502);
      expect(response.body, url).toMatchObject({
        code: 'theme_url_fetch_failed',
        errors: [{ path: '/url', message: reason }],
      });
    }
  });

  it('refuses what is not a theme', async () => {
    const response = await importUrl(
      h.bob,
      'https://themes.example.test/notes.txt',
    );
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'theme_unreadable' });
  });

  it('allows ten imports per user an hour', async () => {
    // Bob has used six; four more pass, the eleventh is refused.
    for (let at = 0; at < 4; at += 1)
      expect(
        (
          await importUrl(
            h.bob,
            'https://themes.example.test/meadow-night.toml',
          )
        ).status,
      ).toBe(200);
    const limited = await importUrl(
      h.bob,
      'https://themes.example.test/meadow-night.toml',
    );
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'rate_limited' });
    // Alice has her own allowance.
    expect(
      (
        await importUrl(
          h.alice,
          'https://themes.example.test/meadow-night.toml',
        )
      ).status,
    ).toBe(200);
  });

  it('checks the body', async () => {
    expect(
      (await h.bob.post('/v1/settings/themes/import-url', { url: '' })).status,
    ).toBe(400);
  });
});
