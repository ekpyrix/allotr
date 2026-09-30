// Test fixtures are read as text through Vitest's `?raw` imports, so the
// shared package needs no Node types.
declare module '*?raw' {
  const text: string;
  export default text;
}
