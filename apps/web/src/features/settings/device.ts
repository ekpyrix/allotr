// A short, coarse name for a signed-in device from its user agent, such as
// "Firefox on Linux". Only well-known names; anything else stays generic.

const browsers: readonly [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const systems: readonly [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

function first(list: readonly [RegExp, string][], ua: string) {
  return list.find(([pattern]) => pattern.test(ua))?.[1];
}

export function deviceParts(userAgent: string | null | undefined): {
  browser: string | undefined;
  system: string | undefined;
} {
  const ua = userAgent ?? '';
  return { browser: first(browsers, ua), system: first(systems, ua) };
}
