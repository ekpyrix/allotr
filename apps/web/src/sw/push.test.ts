import { describe, expect, it } from 'vitest';
import { parsePush, safePath } from './push.ts';

describe('parsePush', () => {
  it('reads a reminder', () => {
    expect(
      parsePush(
        JSON.stringify({
          title: 'Rent is due',
          body: 'Set aside',
          url: '/budget#bills',
        }),
      ),
    ).toEqual({
      title: 'Rent is due',
      body: 'Set aside',
      url: '/budget#bills',
    });
  });

  it('falls back to a plain message for anything else', () => {
    for (const text of [null, '', 'not json', '42', 'null', '[]']) {
      expect(parsePush(text)).toEqual({
        title: 'Allotr',
        body: 'Something needs a look.',
        url: '/',
      });
    }
  });

  it('keeps the title and body short', () => {
    const long = 'x'.repeat(1000);
    const message = parsePush(JSON.stringify({ title: long, body: long }));
    expect(message.title).toHaveLength(120);
    expect(message.body).toHaveLength(240);
  });
});

describe('safePath', () => {
  it('only lets a path inside the app through', () => {
    expect(safePath('/budget#ious')).toBe('/budget#ious');
    expect(safePath('/')).toBe('/');
    for (const url of [
      'https://evil.example.test/',
      '//evil.example.test/',
      '/\\evil.example.test',
      'javascript:alert(1)',
      '',
      undefined,
      7,
    ])
      expect(safePath(url)).toBe('/');
  });
});
