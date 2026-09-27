import { describe, expect, it } from 'vitest';
import { applyKeys } from './secret-keys.ts';

describe('applyKeys', () => {
  it('collects characters until Enter', () => {
    expect(applyKeys('', 'pässwörd\r')).toEqual({
      value: 'pässwörd',
      outcome: 'enter',
    });
    expect(applyKeys('ab', 'c')).toEqual({ value: 'abc', outcome: 'typing' });
    expect(applyKeys('ab', '\n')).toEqual({ value: 'ab', outcome: 'enter' });
  });

  it('cancels on Ctrl-C, and on Ctrl-D only when empty', () => {
    expect(applyKeys('ab', '\u0003').outcome).toBe('cancel');
    expect(applyKeys('', '\u0004').outcome).toBe('cancel');
    expect(applyKeys('pw', '\u0004x\r')).toEqual({
      value: 'pwx',
      outcome: 'enter',
    });
  });

  it('removes a whole character on Backspace', () => {
    expect(applyKeys('ab🔑', '\u007f').value).toBe('ab');
    expect(applyKeys('ab', '\b').value).toBe('a');
    expect(applyKeys('cafe\u0301', '\u007f').value).toBe('caf');
    expect(applyKeys('', '\u007f').value).toBe('');
  });

  it('clears on Ctrl-U', () => {
    expect(applyKeys('secret', '\u0015new').value).toBe('new');
  });

  it('ignores arrow keys and other control characters', () => {
    expect(applyKeys('pw', '\u001b[D\u001bOAx\u0017\t').value).toBe('pwx');
    expect(applyKeys('pw', '\u001b[3~').value).toBe('pw');
  });
});
