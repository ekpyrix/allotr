import type { ThemeTokens } from './tokens.ts';

// The built-in themes. apps/web/src/styles.css repeats these values; a web
// test fails if they drift apart.

export const lightTheme: ThemeTokens = {
  background: '#f3f5f2',
  foreground: '#17302a',
  muted: '#e3eae4',
  'muted-foreground': '#55655e',
  plot: '#e3eae4',
  today: '#b7791f',
  'today-text': '#8a5a12',
  over: '#9c4a3c',
  positive: '#2f6b4f',
  negative: '#9c4a3c',
  primary: '#17302a',
  'primary-foreground': '#f3f5f2',
  border: '#c9d3cc',
  input: '#7c8f85',
  ring: '#a86f1c',
  destructive: '#9c4a3c',
};

export const darkTheme: ThemeTokens = {
  background: '#0f1a17',
  foreground: '#e6eee9',
  muted: '#1b2a25',
  'muted-foreground': '#93a39b',
  plot: '#1b2a25',
  today: '#d9a441',
  'today-text': '#d9a441',
  over: '#d98270',
  positive: '#7fc4a0',
  negative: '#d98270',
  primary: '#e6eee9',
  'primary-foreground': '#0f1a17',
  border: '#2c3d37',
  input: '#5f756b',
  ring: '#d9a441',
  destructive: '#d98270',
};
