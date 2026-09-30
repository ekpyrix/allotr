import { lookup as dnsLookup } from 'node:dns/promises';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

// Fetching a theme file from a URL (plan PR 18, off unless an admin allows
// it; ADR 0011). The server must not become a way into its own network:
// only https, no credentials in the URL, every address the name resolves
// to must be public, the connection goes to the address that was checked
// (so the name cannot be re-pointed in between), no redirects, a short
// timeout and a small size cap.

export const THEME_URL_TIMEOUT_MS = 5000;
export const THEME_URL_MAX_BYTES = 64 * 1024;

export type ThemeUrlRefusal =
  | 'not_https'
  | 'credentials'
  | 'not_public'
  | 'unresolved'
  | 'redirect'
  | 'status'
  | 'too_large'
  | 'timeout'
  | 'network';

export class ThemeUrlError extends Error {
  readonly reason: ThemeUrlRefusal;

  constructor(reason: ThemeUrlRefusal, message: string) {
    super(message);
    this.name = 'ThemeUrlError';
    this.reason = reason;
  }
}

// Addresses a request must never reach: unspecified, loopback, private,
// link-local, carrier-grade NAT, multicast, reserved and documentation
// ranges, for IPv4 and IPv6.
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(network, prefix, 'ipv6');

/** The IPv4 address inside an IPv4-mapped or -compatible IPv6 one. */
function embeddedIpv4(address: string): string | undefined {
  const match =
    /^::(?:ffff:)?(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/iu.exec(
      address,
    );
  if (match === null) return undefined;
  if (match[1] !== undefined) return match[1];
  const high = Number.parseInt(match[2] ?? '0', 16);
  const low = Number.parseInt(match[3] ?? '0', 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** Whether a request may go to this address. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family !== 6) return false;
  const inner = embeddedIpv4(address.toLowerCase());
  if (inner !== undefined) return isPublicAddress(inner);
  return !blocked.check(address, 'ipv6');
}

export type ResolvedAddress = Readonly<{ address: string; family: 4 | 6 }>;

export type FetchDeps = Readonly<{
  /** Every address the name resolves to. */
  resolve: (hostname: string) => Promise<readonly ResolvedAddress[]>;
  /** Whether a resolved address may be connected to. */
  allow: (address: string) => boolean;
  request: (options: RequestOptions) => ClientRequest;
  timeoutMs: number;
  maxBytes: number;
}>;

export const defaultFetchDeps: FetchDeps = {
  resolve: async (hostname) =>
    (await dnsLookup(hostname, { all: true, verbatim: true })).map(
      ({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }),
    ),
  allow: isPublicAddress,
  request: (options) => httpsRequest(options),
  timeoutMs: THEME_URL_TIMEOUT_MS,
  maxBytes: THEME_URL_MAX_BYTES,
};

/** Checks the URL itself: https, and no user name or password. */
export function checkThemeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ThemeUrlError('not_https', 'Use an https:// address.');
  }
  if (url.protocol !== 'https:')
    throw new ThemeUrlError('not_https', 'Use an https:// address.');
  if (url.username !== '' || url.password !== '')
    throw new ThemeUrlError(
      'credentials',
      'Leave the user name and password out of the address.',
    );
  return url;
}

/** Fetches a theme file's text from a public https address. */
export async function fetchThemeText(
  raw: string,
  deps: FetchDeps = defaultFetchDeps,
): Promise<string> {
  const url = checkThemeUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await deps.resolve(hostname);
  } catch {
    throw new ThemeUrlError('unresolved', `${hostname} could not be found.`);
  }
  const [first] = addresses;
  if (first === undefined)
    throw new ThemeUrlError('unresolved', `${hostname} could not be found.`);
  // Every address must be public, not just the first: a name can list a
  // public and a private one and let the resolver pick.
  if (addresses.some(({ address }) => !deps.allow(address)))
    throw new ThemeUrlError(
      'not_public',
      `${hostname} points at an address the server may not fetch from.`,
    );

  // Connect to the checked address; TLS still verifies the host name.
  const pinned: LookupFunction = (_host, options, callback) => {
    if (options.all === true)
      callback(null, [{ address: first.address, family: first.family }]);
    else callback(null, first.address, first.family);
  };

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
    };
    const fail = (reason: ThemeUrlRefusal, message: string) => {
      finish(() => {
        request.destroy();
        reject(new ThemeUrlError(reason, message));
      });
    };
    const request = deps.request({
      protocol: url.protocol,
      hostname,
      ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
      ...(url.port === '' ? {} : { port: Number(url.port) }),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { accept: 'application/json, text/plain, */*' },
      lookup: pinned,
      timeout: deps.timeoutMs,
    });
    const timer = setTimeout(() => {
      fail('timeout', 'The address took too long to answer.');
    }, deps.timeoutMs);
    request.on('timeout', () => {
      fail('timeout', 'The address took too long to answer.');
    });
    request.on('error', () => {
      fail('network', 'The address could not be reached.');
    });
    request.on('response', (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        fail('redirect', 'The address redirects; give the final address.');
        return;
      }
      if (status !== 200) {
        fail('status', `The address answered ${String(status)}.`);
        return;
      }
      const declared = Number(response.headers['content-length']);
      if (Number.isFinite(declared) && declared > deps.maxBytes) {
        fail('too_large', 'The file is larger than 64 KB.');
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > deps.maxBytes) {
          fail('too_large', 'The file is larger than 64 KB.');
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        finish(() => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      });
      response.on('error', () => {
        fail('network', 'The address could not be reached.');
      });
    });
    request.end();
  });
}
