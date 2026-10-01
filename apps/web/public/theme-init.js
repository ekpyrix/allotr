/* global window, document, localStorage */

// Applies the cached theme mode, the role colours of a slot not on its
// default theme, and the motion and density preferences, before first
// paint. src/lib/theme-mode.ts and src/lib/device-prefs.ts own the same
// keys and rules: change them together. A classic script, so it blocks
// rendering; the CSP allows it as 'self', and setting custom properties
// from script is not an inline style.
(() => {
  const root = document.documentElement;
  let mode = 'system';
  let roles = {};
  let motion = null;
  let density = null;
  try {
    const cached = localStorage.getItem('allotr.theme-mode');
    if (cached === 'light' || cached === 'dark') mode = cached;
    roles = JSON.parse(localStorage.getItem('allotr.theme-roles') ?? '{}');
    motion = localStorage.getItem('allotr.motion');
    density = localStorage.getItem('allotr.density');
  } catch {
    // Storage blocked or unreadable: follow the device, default colours.
  }
  if (motion === 'full' || motion === 'reduced' || motion === 'off')
    root.dataset.motion = motion;
  if (density === 'comfortable') root.dataset.density = density;
  const dark =
    mode === 'dark' ||
    (mode === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const scheme = dark ? 'dark' : 'light';
  root.dataset.theme = scheme;
  const colours =
    roles !== null && typeof roles === 'object' ? roles[scheme] : null;
  if (colours === null || typeof colours !== 'object') return;
  for (const [name, value] of Object.entries(colours)) {
    if (
      /^[a-z0-9-]+$/.test(name) &&
      /^#(?:[0-9a-f]{3}){1,2}$/i.test(String(value))
    )
      root.style.setProperty(`--${name}`, String(value));
  }
})();
