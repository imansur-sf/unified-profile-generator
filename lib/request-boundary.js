'use strict';

const net = require('node:net');

function parsePublicOrigin(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin');
  }
  return url.origin;
}

function parseTrustedProxies(value) {
  if (!value || value === 'false') return false;
  const entries = value.split(',').map(entry => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const family = net.isIP(address);
    if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY must contain trusted proxy IP addresses or CIDR ranges, not a boolean or hop count');
    }
    if (prefix !== undefined && Number(prefix) === 0) throw new Error('TRUST_PROXY cannot trust all addresses');
  }
  return entries.length ? entries : false;
}

function requestOrigin(req, publicOrigin = '') {
  if (publicOrigin) return publicOrigin;
  // Express only honors forwarded protocol when its configured proxy trust
  // boundary permits it. Host is checked as an authority, never a URL fragment.
  const protocol = req.protocol;
  const host = req.get('host');
  if (!['http', 'https'].includes(protocol) || !host || /[\s\\/@?#]/.test(host)) throw new Error('invalid_request_origin');
  const url = new URL(`${protocol}://${host}`);
  return url.origin;
}

module.exports = { parsePublicOrigin, parseTrustedProxies, requestOrigin };
