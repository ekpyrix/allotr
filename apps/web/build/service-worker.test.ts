import { describe, expect, it } from 'vitest';
import { injectPrecache, precacheManifest } from './service-worker.ts';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('precacheManifest', () => {
  const built = [
    { path: '/sw.js', content: bytes('worker') },
    { path: '/index.html', content: bytes('<html>') },
    { path: '/assets/index-abc.js', content: bytes('app') },
    { path: '/assets/index-abc.js.map', content: bytes('{}') },
  ];

  it('lists the build except the worker and source maps, sorted', () => {
    expect(precacheManifest(built).files).toEqual([
      '/assets/index-abc.js',
      '/index.html',
    ]);
  });

  it('changes the version when any cached file changes', () => {
    const before = precacheManifest(built).version;
    const edited = built.map((file) =>
      file.path === '/index.html'
        ? { ...file, content: bytes('<html>!') }
        : file,
    );
    expect(precacheManifest(edited).version).not.toBe(before);
    expect(precacheManifest([...built].reverse()).version).toBe(before);
  });

  it('ignores the worker and maps for the version', () => {
    const before = precacheManifest(built).version;
    const edited = built.map((file) =>
      file.path === '/sw.js' ? { ...file, content: bytes('other') } : file,
    );
    expect(precacheManifest(edited).version).toBe(before);
  });
});

describe('injectPrecache', () => {
  const manifest = { version: 'v1', files: ['/index.html'] };

  it.each([`'__ALLOTR_PRECACHE__'`, `"__ALLOTR_PRECACHE__"`])(
    'replaces the %s placeholder with a JSON string',
    (literal) => {
      const code = injectPrecache(
        `const p = JSON.parse(${literal});`,
        manifest,
      );
      const match = /JSON\.parse\((.*)\);/.exec(code);
      const parsed: unknown = JSON.parse(
        JSON.parse(match?.[1] ?? '') as string,
      );
      expect(parsed).toEqual(manifest);
    },
  );

  it('fails the build when the placeholder is missing', () => {
    expect(() => injectPrecache('const p = 1;', manifest)).toThrow(
      /placeholder/,
    );
  });
});
