import fc from 'fast-check';

// Test-only arbitraries for theme tests.

/** Any opaque colour as #rrggbb. */
export const hexArb: fc.Arbitrary<string> = fc
  .tuple(fc.nat(255), fc.nat(255), fc.nat(255))
  .map((rgb) => `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`);
