import { assertPublicUrl, safeFetch, UnsafeUrlError } from './safe-fetch';

describe('assertPublicUrl (SSRF protection)', () => {
  // Усе це має відхилятись: loopback, приватні мережі, cloud metadata
  const blocked = [
    'http://127.0.0.1',
    'http://localhost:4000',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.16.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://0.0.0.0',
    'http://[::1]/',
    'http://2130706433', // 127.0.0.1, записаний одним числом
    'http://[::ffff:127.0.0.1]/', // IPv4-mapped IPv6
  ];

  it.each(blocked)('rejects %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it.each(['ftp://example.com', 'file:///etc/passwd', 'not a url'])(
    'rejects invalid or non-http URL: %s',
    async (url) => {
      await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    },
  );

  it('allows a public IP', async () => {
    const url = await assertPublicUrl('http://8.8.8.8/health');
    expect(url.hostname).toBe('8.8.8.8');
  });
});

describe('safeFetch', () => {
  afterEach(() => jest.restoreAllMocks());

  it('blocks a redirect to a private address', async () => {
    // Публічний сайт відповідає редіректом на внутрішню адресу
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/admin' },
      }),
    );

    await expect(safeFetch('http://8.8.8.8/')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1); // другий hop навіть не відправлений
  });
});
