import { BlockList, isIP } from 'node:net';

// Resolves the client address used for rate limiting. X-Forwarded-For is
// only believed when the socket peer is a configured trusted proxy;
// otherwise anyone could pick their own address.

export type ClientIpResolver = (
  socketAddress: string | undefined,
  forwardedFor: string | null,
) => string | undefined;

function family(address: string): 'ipv4' | 'ipv6' {
  return isIP(address) === 6 ? 'ipv6' : 'ipv4';
}

function normalise(address: string): string {
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4
    ? address.slice(7)
    : address;
}

export function createClientIpResolver(
  trusted: readonly string[],
): ClientIpResolver {
  const proxies = new BlockList();
  for (const entry of trusted) {
    const [network = '', prefix] = entry.split('/');
    if (prefix === undefined) proxies.addAddress(network, family(network));
    else proxies.addSubnet(network, Number(prefix), family(network));
  }
  const isTrusted = (address: string) =>
    proxies.check(address, family(address));

  return (socketAddress, forwardedFor) => {
    if (socketAddress === undefined) return undefined;
    const peer = normalise(socketAddress);
    if (!isTrusted(peer) || forwardedFor === null) return peer;

    const hops = forwardedFor.split(',').map((hop) => normalise(hop.trim()));
    for (const hop of hops.reverse()) {
      if (isIP(hop) === 0) return peer;
      if (!isTrusted(hop)) return hop;
    }
    return peer;
  };
}
