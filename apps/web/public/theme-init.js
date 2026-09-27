/* global window, document, localStorage */

// Applies the cached theme mode before first paint. src/lib/theme-mode.ts
// owns the same key and rule: change both together. A classic script, so it
// blocks rendering; the CSP allows it as 'self'.
(() => {
  let mode = 'system';
  try {
    const cached = localStorage.getItem('allotr.theme-mode');
    if (cached === 'light' || cached === 'dark') mode = cached;
  } catch {
    // Storage blocked: follow the device.
  }
  const dark =
    mode === 'dark' ||
    (mode === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
