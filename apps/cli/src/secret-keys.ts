// Line editing for a hidden prompt read in raw mode. Nothing is echoed, so
// keys that would edit a visible line must not end up in the secret: a
// stray arrow key would otherwise fail a sign-in that counts toward the
// lockout.

export type KeyOutcome = 'typing' | 'enter' | 'cancel';

export interface KeyResult {
  readonly value: string;
  readonly outcome: KeyOutcome;
}

const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const CTRL_U = '\u0015';
const ESC = '\u001b';
const BACKSPACE = new Set(['\u007f', '\b']);
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The secret without its last character as a person sees it. */
function withoutLast(secret: string): string {
  const last = [...graphemes.segment(secret)].at(-1);
  return last === undefined ? secret : secret.slice(0, last.index);
}

/** Applies one chunk of raw terminal input to the secret typed so far. */
export function applyKeys(value: string, chunk: string): KeyResult {
  let secret = value;
  // Code points, so an escape sequence can be skipped key by key.
  const chars = Array.from(chunk);
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] ?? '';
    if (char === '\r' || char === '\n') {
      return { value: secret, outcome: 'enter' };
    }
    if (char === CTRL_C || (char === CTRL_D && secret === '')) {
      return { value: secret, outcome: 'cancel' };
    }
    if (char === ESC) {
      i = escapeEnd(chars, i);
    } else if (BACKSPACE.has(char)) {
      secret = withoutLast(secret);
    } else if (char === CTRL_U) {
      secret = '';
    } else if (char >= ' ') {
      secret += char;
    }
  }
  return { value: secret, outcome: 'typing' };
}

/** The index of the last character of an escape sequence starting at `i`. */
function escapeEnd(chars: readonly string[], i: number): number {
  const kind = chars[i + 1];
  if (kind !== '[' && kind !== 'O') return i;
  // CSI and SS3 sequences end at the first character from @ to ~.
  let end = i + 2;
  while (end < chars.length) {
    const char = chars[end] ?? '';
    if (char >= '@' && char <= '~') return end;
    end += 1;
  }
  return end;
}
