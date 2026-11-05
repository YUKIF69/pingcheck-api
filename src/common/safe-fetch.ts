import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export class UnsafeUrlError extends Error {}

// Заборонені діапазони: loopback, приватні мережі, link-local (cloud metadata 169.254.169.254) тощо
const blocked = new BlockList();
blocked.addSubnet('0.0.0.0', 8, 'ipv4');
blocked.addSubnet('10.0.0.0', 8, 'ipv4');
blocked.addSubnet('100.64.0.0', 10, 'ipv4');
blocked.addSubnet('127.0.0.0', 8, 'ipv4');
blocked.addSubnet('169.254.0.0', 16, 'ipv4');
blocked.addSubnet('172.16.0.0', 12, 'ipv4');
blocked.addSubnet('192.0.0.0', 24, 'ipv4');
blocked.addSubnet('192.168.0.0', 16, 'ipv4');
blocked.addSubnet('198.18.0.0', 15, 'ipv4');
blocked.addSubnet('224.0.0.0', 4, 'ipv4');
blocked.addSubnet('240.0.0.0', 4, 'ipv4');
blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');

// Перевіряє протокол і IP-адреси хоста. Кидає UnsafeUrlError, якщо URL небезпечний
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      // Хост не резолвиться: це не SSRF, fetch просто впаде, і монітор стане DOWN
      return url;
    }
  }

  for (const address of addresses) {
    if (blocked.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4')) {
      throw new UnsafeUrlError('URL points to a private or reserved address');
    }
  }
  return url;
}

// fetch, який вручну проходить редіректи і перевіряє кожен крок
export async function safeFetch(
  rawUrl: string,
  timeoutMs = 10000,
  maxRedirects = 5,
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError('Too many redirects');
}
