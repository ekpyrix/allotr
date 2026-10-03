import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP, type LookupFunction } from 'node:net';
import {
  defaultFetchDeps,
  type FetchDeps,
  type ResolvedAddress,
} from '../theme-url.ts';

// Web Push without a library: payload encryption (RFC 8291, aes128gcm,
// RFC 8188) and VAPID (RFC 8292) with node:crypto only, so no dependency
// and no code that phones home. The one outbound call is the POST to the
// push endpoint the user's browser gave, and only for a user who opted in
// on that device (docs/privacy.md). The endpoint is user-supplied, so it
// gets the same guard as theme URLs: https, public addresses only, the
// connection pinned to the checked address, no redirects.

export type VapidKeys = Readonly<{
  /** Uncompressed P-256 point, base64url: what browsers subscribe with. */
  publicKey: string;
  /** The 32-byte private scalar, base64url. */
  privateKey: string;
}>;

export type PushSubscription = Readonly<{
  endpoint: string;
  /** The browser's public key, base64url. */
  p256dh: string;
  /** The browser's 16-byte secret, base64url. */
  auth: string;
}>;

const b64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url');

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: b64(ecdh.getPublicKey()),
    privateKey: b64(ecdh.getPrivateKey()),
  };
}

/** The signed VAPID header for a push endpoint's origin. */
export function vapidAuthorization(
  keys: VapidKeys,
  audience: string,
  subject: string,
  now: Date,
): string {
  const publicKey = Buffer.from(keys.publicKey, 'base64url');
  const key = createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64(publicKey.subarray(1, 33)),
      y: b64(publicKey.subarray(33, 65)),
      d: keys.privateKey,
    },
  });
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: audience,
    // 12 hours: under the 24 the services allow.
    exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
    sub: subject,
  })}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${unsigned}.${b64(signature)}, k=${keys.publicKey}`;
}

/** One-record aes128gcm body for a subscription (RFC 8291 section 3). */
export function encryptPayload(
  subscription: Pick<PushSubscription, 'p256dh' | 'auth'>,
  plaintext: Uint8Array,
  random: { salt?: Buffer; ephemeral?: ReturnType<typeof createECDH> } = {},
): Buffer {
  const uaPublic = Buffer.from(subscription.p256dh, 'base64url');
  const authSecret = Buffer.from(subscription.auth, 'base64url');
  const ephemeral = random.ephemeral ?? createECDH('prime256v1');
  if (random.ephemeral === undefined) ephemeral.generateKeys();
  const asPublic = ephemeral.getPublicKey();
  const shared = ephemeral.computeSecret(uaPublic);
  const ikm = Buffer.from(
    hkdfSync(
      'sha256',
      shared,
      authSecret,
      Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]),
      32,
    ),
  );
  const salt = random.salt ?? randomBytes(16);
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
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 closes the only record.
  const encrypted = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, encrypted]);
}

export type PushResult = 'sent' | 'gone' | 'failed';

export type PushDeps = FetchDeps;

export const defaultPushDeps: PushDeps = {
  ...defaultFetchDeps,
  timeoutMs: 10_000,
  maxBytes: 4096,
};

/**
 * Sends `payload` to one subscription. `gone` means the push service no
 * longer knows it (404 or 410): the caller drops it. Anything else that goes
 * wrong is `failed`, and nothing is retried.
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  keys: VapidKeys,
  subject: string,
  now: Date,
  deps: PushDeps = defaultPushDeps,
): Promise<PushResult> {
  let url: URL;
  try {
    url = new URL(subscription.endpoint);
  } catch {
    return 'failed';
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '')
    return 'failed';
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await deps.resolve(hostname);
  } catch {
    return 'failed';
  }
  const [first] = addresses;
  if (first === undefined || addresses.some((a) => !deps.allow(a.address)))
    return 'failed';
  const pinned: LookupFunction = (_host, options, callback) => {
    if (options.all === true)
      callback(null, [{ address: first.address, family: first.family }]);
    else callback(null, first.address, first.family);
  };
  const body = encryptPayload(subscription, Buffer.from(payload));

  return new Promise<PushResult>((resolve) => {
    let done = false;
    const finish = (result: PushResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      request.destroy();
      resolve(result);
    };
    const request = deps.request({
      protocol: url.protocol,
      hostname,
      ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
      ...(url.port === '' ? {} : { port: Number(url.port) }),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        authorization: vapidAuthorization(keys, url.origin, subject, now),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        'content-length': String(body.length),
        ttl: '86400',
        urgency: 'normal',
      },
      lookup: pinned,
      timeout: deps.timeoutMs,
    });
    const timer = setTimeout(() => {
      finish('failed');
    }, deps.timeoutMs);
    request.on('timeout', () => {
      finish('failed');
    });
    request.on('error', () => {
      finish('failed');
    });
    request.on('response', (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      response.resume();
      finish(
        status >= 200 && status < 300
          ? 'sent'
          : status === 404 || status === 410
            ? 'gone'
            : 'failed',
      );
    });
    request.end(body);
  });
}
