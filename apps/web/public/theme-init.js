/* global window, document, localStorage */

// Applies the cached theme mode, and the colours of a slot not on its
// built-in theme, before first paint. src/lib/theme-mode.ts owns the same
// keys and rule: change both together. A classic script, so it blocks
// rendering; the CSP allows it as 'self', and setting custom properties
// from script is not an inline style.
(() => {
  let mode = 'system';
  let tokens = {};
  try {
    const cached = localStorage.getItem('allotr.theme-mode');
    if (cached === 'light' || cached === 'dark') mode = cached;
    tokens = JSON.parse(localStorage.getItem('allotr.theme-tokens') ?? '{}');
  } catch {
    // Storage blocked or unreadable: follow the device, built-in colours.
  }
  const dark =
    mode === 'dark' ||
    (mode === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const scheme = dark ? 'dark' : 'light';
  const root = document.documentElement;
  root.dataset.theme = scheme;
  const colours =
    tokens !== null && typeof tokens === 'object' ? tokens[scheme] : null;
  if (colours === null || typeof colours !== 'object') return;
  for (const [name, value] of Object.entries(colours)) {
    if (
      /^[a-z-]+$/.test(name) &&
      /^#(?:[0-9a-f]{3}){1,2}$/i.test(String(value))
    )
      root.style.setProperty(`--${name}`, String(value));
  }
})();
