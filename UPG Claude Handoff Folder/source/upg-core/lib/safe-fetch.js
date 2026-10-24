'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const zlib = require('node:zlib');

const blockedIPv4 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blockedIPv4.addSubnet(address, prefix, 'ipv4');
const globalIPv6 = new net.BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
const blockedIPv6 = new net.BlockList();
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]
]) blockedIPv6.addSubnet(address, prefix, 'ipv6');

class SafeFetchError extends Error {
  constructor(code, status = 502, details = {}) {
    super(code);
    this.name = 'SafeFetchError';
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

function normalizeHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isPublicAddress(address) {
  const normalized = normalizeHostname(address);
  const family = net.isIP(normalized);
  if (family === 4) return !blockedIPv4.check(normalized, 'ipv4');
  // Only global unicast is eligible. This also excludes IPv4-mapped, NAT64,
  // loopback, link-local, unique-local, multicast and zone-qualified addresses.
  return family === 6 && globalIPv6.check(normalized, 'ipv6') && !blockedIPv6.check(normalized, 'ipv6');
}

function isDangerousHost(hostname) {
  const host = normalizeHostname(hostname);
  if (!host || host === 'localhost' || host === 'localhost.localdomain' || host === 'metadata.google.internal') return true;
  if (/\.(?:localhost|internal|local)$/.test(host)) return true;
  return net.isIP(host) ? !isPublicAddress(host) : false;
}

function validatePublicUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch (_) { throw new SafeFetchError('invalid_url', 400); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new SafeFetchError('bad_protocol', 400);
  if (url.username || url.password) throw new SafeFetchError('url_credentials_not_allowed', 400);
  if (url.port && !['80', '443'].includes(url.port)) throw new SafeFetchError('blocked_port', 403);
  if (isDangerousHost(url.hostname)) throw new SafeFetchError('blocked_host', 403);
  return url;
}

function requestPinned(url, options) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, options, resolve);
    request.once('error', reject);
    request.end();
  });
}

function pinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (options?.all) return callback(null, addresses.map(record => ({ ...record })));
    const record = addresses.find(value => !options?.family || value.family === options.family) || addresses[0];
    callback(null, record.address, record.family);
  };
}

function createSafeFetcher({ lookup = dns.lookup.bind(dns), request = requestPinned } = {}) {
  return async function fetchPublicResource(rawUrl, {
    maxBytes = 3000000, timeoutMs = 15000, maxRedirects = 3,
    headers = {}, acceptContentType, contentTypeError = 'not_text'
  } = {}) {
    const controller = new AbortController();
    const timeoutError = new SafeFetchError('timeout');
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(timeoutError); }, timeoutMs);
    });
    const work = async () => {
      let url = validatePublicUrl(rawUrl);
      for (let redirects = 0; ; redirects++) {
        const hostname = normalizeHostname(url.hostname);
        let addresses;
        try {
          const family = net.isIP(hostname);
          addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true, verbatim: true });
        } catch (_) { throw new SafeFetchError('network_error'); }
        if (!addresses?.length || addresses.some(record => !isPublicAddress(record.address))) throw new SafeFetchError('blocked_host', 403);
        controller.signal.throwIfAborted();
        // Connecting uses exactly the checked addresses while keeping the URL's
        // Host header and TLS hostname verification. No second DNS lookup occurs.
        const response = await request(url, {
          method: 'GET', agent: false, signal: controller.signal,
          lookup: pinnedLookup(addresses),
          headers: { ...headers, 'Accept-Encoding': 'identity' }
        });
        const abortResponse = () => response.destroy(timeoutError);
        controller.signal.addEventListener('abort', abortResponse, { once: true });
        // An abort can occur between receipt of headers and listener setup.
        if (controller.signal.aborted) { response.destroy(); throw timeoutError; }
        try {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const location = response.headers.location;
            response.destroy();
            if (!location) throw new SafeFetchError('invalid_redirect');
            if (redirects >= maxRedirects) throw new SafeFetchError('too_many_redirects');
            let redirectUrl;
            try { redirectUrl = new URL(location, url); } catch (_) { throw new SafeFetchError('invalid_redirect'); }
            url = validatePublicUrl(redirectUrl);
            continue;
          }
          if (response.statusCode < 200 || response.statusCode >= 300) throw new SafeFetchError('upstream_status', 502, { upstreamStatus: response.statusCode });
          const contentType = String(response.headers['content-type'] || '');
          if (acceptContentType && !acceptContentType(contentType, url)) throw new SafeFetchError(contentTypeError, 415);
          if (Number(response.headers['content-length']) > maxBytes) throw new SafeFetchError('too_large', 413, { limitBytes: maxBytes });
          const encoding = String(response.headers['content-encoding'] || 'identity').toLowerCase().trim();
          const decoder = encoding === 'gzip' ? zlib.createGunzip()
            : encoding === 'deflate' ? zlib.createInflate()
              : encoding === 'br' ? zlib.createBrotliDecompress() : null;
          if (encoding !== 'identity' && !decoder) throw new SafeFetchError('unsupported_encoding', 415);
          let bytes = 0;
          let wireBytes = 0;
          const chunks = [];
          const stream = decoder || response;
          const limitError = new SafeFetchError('too_large', 413, { limitBytes: maxBytes });
          if (decoder) {
            response.on('data', chunk => {
              wireBytes += chunk.length;
              if (wireBytes > maxBytes) response.destroy(limitError);
            });
            response.on('error', error => decoder.destroy(error));
            response.pipe(decoder);
          }
          try {
            for await (const chunk of stream) {
              bytes += chunk.length;
              if (bytes > maxBytes) throw limitError;
              chunks.push(chunk);
            }
          } finally {
            if (decoder) decoder.destroy();
          }
          return { url: url.toString(), status: response.statusCode, contentType, body: Buffer.concat(chunks, bytes) };
        } finally {
          controller.signal.removeEventListener('abort', abortResponse);
          response.destroy();
        }
      }
    };
    try {
      return await Promise.race([work(), deadline]);
    } catch (error) {
      if (controller.signal.aborted) throw timeoutError;
      if (error instanceof SafeFetchError) throw error;
      throw new SafeFetchError('network_error');
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  };
}

module.exports = { SafeFetchError, createSafeFetcher, fetchPublicResource: createSafeFetcher(), isPublicAddress, isDangerousHost, validatePublicUrl };
