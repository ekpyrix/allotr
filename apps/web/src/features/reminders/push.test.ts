import { describe, expect, it } from 'vitest';
import {
  applicationServerKey,
  pushSupport,
  toSubscriptionBody,
} from './push.ts';

describe('applicationServerKey', () => {
  it('turns base64url into the bytes it names', () => {
    // 0xfb 0xff 0xfe is "-__-" in base64url and "+//+" in base64.
    expect([...applicationServerKey('-__-')]).toEqual([0xfb, 0xff, 0xfe]);
    expect([...applicationServerKey('AQID')]).toEqual([1, 2, 3]);
    expect([...applicationServerKey('AQI')]).toEqual([1, 2]);
  });
});

describe('toSubscriptionBody', () => {
  const good = {
    endpoint: 'https://push.example.test/send/abc',
    expirationTime: null,
    keys: {
      p256dh:
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      auth: 'AAAAAAAAAAAAAAAAAAAAAA',
    },
  };

  it('keeps an https subscription with its keys', () => {
    expect(toSubscriptionBody(good)).toEqual({
      endpoint: good.endpoint,
      keys: good.keys,
    });
  });

  it('refuses plain http and a missing key', () => {
    expect(
      toSubscriptionBody({ ...good, endpoint: 'http://push.example.test/a' }),
    ).toBeNull();
    expect(toSubscriptionBody({ endpoint: good.endpoint })).toBeNull();
    expect(toSubscriptionBody(null)).toBeNull();
  });
});

describe('pushSupport', () => {
  it('needs a worker, the Push API and a permission to ask about', () => {
    const base = {
      hasWorker: true,
      hasPush: true,
      permission: 'default' as const,
    };
    expect(pushSupport(base)).toEqual({
      state: 'available',
      permission: 'default',
    });
    expect(pushSupport({ ...base, hasWorker: false })).toEqual({
      state: 'unsupported',
    });
    expect(pushSupport({ ...base, hasPush: false })).toEqual({
      state: 'unsupported',
    });
    expect(pushSupport({ ...base, permission: undefined })).toEqual({
      state: 'unsupported',
    });
    expect(pushSupport({ ...base, permission: 'denied' })).toEqual({
      state: 'blocked',
    });
    expect(pushSupport({ ...base, permission: 'granted' })).toEqual({
      state: 'available',
      permission: 'granted',
    });
  });
});
