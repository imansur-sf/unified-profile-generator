const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { gzipSync } = require('node:zlib');
const { createSafeFetcher, isPublicAddress, validatePublicUrl } = require('../lib/safe-fetch');

function response(body = '<html>Customer</html>', { status = 200, headers = {} } = {}) {
  const stream = body instanceof Readable ? body : Readable.from([Buffer.from(body)]);
  stream.statusCode = status;
  stream.headers = { 'content-type': 'text/html', ...headers };
  return stream;
}
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const codeIs = code => error => error.code === code;

test('rejects private/reserved IPv4, IPv6, aliases, credentials, protocols and ports', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.31.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '192.0.2.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fd12::1', 'fe80::1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const url of ['http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fd12::1]/', 'http://2130706433/', 'http://0x7f000001/', 'http://localhost./', 'http://child.localhost/', 'http://metadata.google.internal/']) {
    assert.throws(() => validatePublicUrl(url), codeIs('blocked_host'), url);
  }
  assert.throws(() => validatePublicUrl('file:///etc/passwd'), codeIs('bad_protocol'));
  assert.throws(() => validatePublicUrl('https://user:pass@customer.example/'), codeIs('url_credentials_not_allowed'));
  assert.throws(() => validatePublicUrl('https://customer.example:8080/'), codeIs('blocked_port'));
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
});

test('rejects private DNS and mixed public/private answers before connecting', async () => {
  for (const addresses of [
    [{ address: '10.0.0.1', family: 4 }],
    [{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }],
    []
  ]) {
    let connected = false;
    const fetch = createSafeFetcher({ lookup: async () => addresses, request: async () => { connected = true; return response(); } });
    await assert.rejects(() => fetch('https://customer.example/'), codeIs('blocked_host'));
    assert.equal(connected, false);
  }
});

test('pins checked DNS records while preserving URL hostname for Host and TLS', async () => {
  let lookups = 0;
  const fetch = createSafeFetcher({
    lookup: async () => { lookups++; return lookups === 1 ? publicLookup() : [{ address: '127.0.0.1', family: 4 }]; },
    request: async (url, options) => {
      assert.equal(url.hostname, 'customer.example');
      assert.equal(options.agent, false);
      const result = await new Promise((resolve, reject) => options.lookup(url.hostname, { all: true }, (error, addresses) => error ? reject(error) : resolve(addresses)));
      assert.deepEqual(result, [{ address: '93.184.216.34', family: 4 }]);
      return response();
    }
  });
  const result = await fetch('https://customer.example/');
  assert.equal(lookups, 1);
  assert.equal(result.body.toString(), '<html>Customer</html>');
});

test('revalidates redirect URLs and DNS without connecting to private destinations', async () => {
  for (const location of ['http://[::1]/admin', 'http://10.0.0.1/admin', 'https://private.example/admin']) {
    let connections = 0;
    const fetch = createSafeFetcher({
      lookup: async hostname => hostname === 'private.example' ? [{ address: '192.168.1.1', family: 4 }] : publicLookup(),
      request: async () => { connections++; return response('', { status: 302, headers: { location } }); }
    });
    await assert.rejects(() => fetch('https://customer.example/'), codeIs('blocked_host'));
    assert.equal(connections, 1);
  }
});

test('accepts bounded relative redirects and reports final source URL', async () => {
  let calls = 0;
  const fetch = createSafeFetcher({ lookup: publicLookup, request: async () => ++calls === 1 ? response('', { status: 302, headers: { location: '/about' } }) : response('Final') });
  const result = await fetch('https://customer.example/');
  assert.equal(result.url, 'https://customer.example/about');
  assert.equal(result.body.toString(), 'Final');
  assert.equal(calls, 2);
});

test('limits redirect loops and rejects malformed redirect URLs', async () => {
  let calls = 0;
  const fetch = createSafeFetcher({ lookup: publicLookup, request: async () => { calls++; return response('', { status: 302, headers: { location: '/again' } }); } });
  await assert.rejects(() => fetch('https://customer.example/', { maxRedirects: 2 }), codeIs('too_many_redirects'));
  assert.equal(calls, 3);
  const malformed = createSafeFetcher({ lookup: publicLookup, request: async () => response('', { status: 302, headers: { location: 'http://[' } }) });
  await assert.rejects(() => malformed('https://customer.example/'), codeIs('invalid_redirect'));
});

test('limits streamed bytes and decoded compressed bytes', async () => {
  const bodies = [Buffer.alloc(200), gzipSync(Buffer.alloc(5000))];
  for (let i = 0; i < bodies.length; i++) {
    const fetch = createSafeFetcher({ lookup: publicLookup, request: async () => response(bodies[i], { headers: i ? { 'content-encoding': 'gzip' } : {} }) });
    await assert.rejects(() => fetch('https://customer.example/', { maxBytes: 128 }), codeIs('too_large'));
  }
});

test('decompresses valid responses and enforces content type/status', async () => {
  const fetch = createSafeFetcher({ lookup: publicLookup, request: async () => response(gzipSync(Buffer.from('Hello')), { headers: { 'content-encoding': 'gzip' } }) });
  assert.equal((await fetch('https://customer.example/')).body.toString(), 'Hello');
  const image = createSafeFetcher({ lookup: publicLookup, request: async () => response('not-an-image') });
  await assert.rejects(() => image('https://customer.example/', { acceptContentType: value => /^image\//.test(value), contentTypeError: 'not_image' }), codeIs('not_image'));
  const unavailable = createSafeFetcher({ lookup: publicLookup, request: async () => response('', { status: 503 }) });
  await assert.rejects(() => unavailable('https://customer.example/'), error => error.code === 'upstream_status' && error.upstreamStatus === 503);
});

test('deadline covers stalled DNS, response headers and body', async () => {
  const stalledBody = new Readable({ read() {} });
  const cases = [
    createSafeFetcher({ lookup: async () => new Promise(() => {}), request: async () => { throw Error('must not connect'); } }),
    createSafeFetcher({ lookup: publicLookup, request: async () => new Promise(() => {}) }),
    createSafeFetcher({ lookup: publicLookup, request: async () => response(stalledBody) })
  ];
  for (const fetch of cases) await assert.rejects(() => fetch('https://customer.example/', { timeoutMs: 20 }), codeIs('timeout'));
  assert.equal(stalledBody.destroyed, true);
});
