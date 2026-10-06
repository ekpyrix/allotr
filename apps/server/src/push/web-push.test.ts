import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  randomBytes,
  verify,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { defaultFetchDeps } from '../theme-url.ts';
import {
  encryptPayload,
  generateVapidKeys,
  sendWebPush,
  vapidAuthorization,
} from './web-push.ts';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

// The receiving side of RFC 8291, written independently of the sender so a
// mistake in either shows up as a failed round trip.
function decrypt(
  body: Buffer,
  browser: ReturnType<typeof createECDH>,
  auth: Buffer,
): string {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idLength);
  const content = body.subarray(21 + idLength);
  const shared = browser.computeSecret(asPublic);
  const uaPublic = browser.getPublicKey();
  const ikm = Buffer.from(
    hkdfSync(
      'sha256',
      shared,
      auth,
      Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]),
      32,
    ),
  );
  const cek = Buffer.from(
    hkdfSync(
      'sha256',
      ikm,
      salt,
      Buffer.from('Content-Encoding: aes128gcm\0'),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
  );
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(content.subarray(content.length - 16));
  const plain = Buffer.concat([
    decipher.update(content.subarray(0, content.length - 16)),
    decipher.final(),
  ]);
  expect(plain.at(-1)).toBe(2);
  return plain.subarray(0, -1).toString('utf8');
}

describe('encryptPayload', () => {
  it('can be read by the browser that subscribed', () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = randomBytes(16);
    const body = encryptPayload(
      { p256dh: b64(browser.getPublicKey()), auth: b64(auth) },
      Buffer.from('Rent is due tomorrow.'),
    );
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(body.readUInt8(20)).toBe(65);
    expect(decrypt(body, browser, auth)).toBe('Rent is due tomorrow.');
  });

  // RFC 8291 section 5 and appendix A: fixed keys, salt and plaintext give
  // one exact body, so a mistake that a matching sender and receiver would
  // share (and a browser would reject) is caught without a push service.
  it('produces the example body from RFC 8291', () => {
    const sender = createECDH('prime256v1');
    sender.setPrivateKey(
      Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'),
    );
    const body = encryptPayload(
      {
        p256dh:
          'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
      Buffer.from('When I grow up, I want to be a watermelon'),
      {
        salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'),
        ephemeral: sender,
      },
    );
    expect(body.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
        'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('cannot be read with another secret', () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const body = encryptPayload(
      { p256dh: b64(browser.getPublicKey()), auth: b64(randomBytes(16)) },
      Buffer.from('private'),
    );
    expect(() => decrypt(body, browser, randomBytes(16))).toThrow();
  });
});

describe('vapidAuthorization', () => {
  it('is a JWT the public key verifies, for the endpoint origin', () => {
    const keys = generateVapidKeys();
    const now = new Date('2026-04-10T12:00:00Z');
    const header = vapidAuthorization(
      keys,
      'https://push.example.test',
      'https://allotr.example.test',
      now,
    );
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/u.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, k] = match ?? [];
    expect(k).toBe(keys.publicKey);
    expect(
      JSON.parse(Buffer.from(claims ?? '', 'base64url').toString()),
    ).toEqual({
      aud: 'https://push.example.test',
      exp: Math.floor(now.getTime() / 1000) + 43200,
      sub: 'https://allotr.example.test',
    });
    const point = Buffer.from(keys.publicKey, 'base64url');
    const publicKey = createPublicKey({
      format: 'jwk',
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: b64(point.subarray(1, 33)),
        y: b64(point.subarray(33, 65)),
      },
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head ?? ''}.${claims ?? ''}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature ?? '', 'base64url'),
      ),
    ).toBe(true);
  });
});

describe('sendWebPush', () => {
  const keys = generateVapidKeys();
  const browser = createECDH('prime256v1');
  browser.generateKeys();
  const subscription = {
    endpoint: 'https://push.example.test/send/abc',
    p256dh: b64(browser.getPublicKey()),
    auth: b64(randomBytes(16)),
  };
  const now = new Date('2026-04-10T12:00:00Z');
  const refusals = async (endpoint: string, address: string) =>
    sendWebPush(
      { ...subscription, endpoint },
      'x',
      keys,
      'https://allotr.example.test',
      now,
      {
        ...defaultFetchDeps,
        resolve: () => Promise.resolve([{ address, family: 4 }]),
        request: () => {
          throw new Error('must not connect');
        },
      },
    );

  it('refuses an address that is not https or not public', async () => {
    expect(await refusals('http://push.example.test/x', '203.0.114.7')).toBe(
      'failed',
    );
    expect(await refusals('https://push.example.test/x', '10.0.0.5')).toBe(
      'failed',
    );
    expect(await refusals('https://push.example.test/x', '127.0.0.1')).toBe(
      'failed',
    );
  });
});
