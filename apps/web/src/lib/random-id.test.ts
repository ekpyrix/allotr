import { describe, expect, it } from 'vitest';
import { randomId } from './random-id.ts';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId', () => {
  it('uses randomUUID where the browser has it', () => {
    expect(
      randomId({
        randomUUID: () => '00000000-0000-4000-8000-000000000000',
        getRandomValues: crypto.getRandomValues.bind(crypto),
      }),
    ).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('builds a version 4 UUID from random bytes outside a secure context', () => {
    const plainHttp = { getRandomValues: crypto.getRandomValues.bind(crypto) };
    const ids = Array.from({ length: 50 }, () => randomId(plainHttp));
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets the version and variant bits whatever the bytes are', () => {
    const ones = {
      getRandomValues: ((array: Uint8Array) =>
        array.fill(0xff)) as Crypto['getRandomValues'],
    };
    expect(randomId(ones)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
