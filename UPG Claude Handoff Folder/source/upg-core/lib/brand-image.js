'use strict';

const { spawn } = require('node:child_process');

const MAX_BYTES = 512 * 1024;
const MAX_PIXELS = 4 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const MAX_OUTPUT_DIMENSION = 320;
const TIMEOUT_MS = 5000;
const MAX_ACTIVE = 2;
const MAX_QUEUED = 8;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function imageError(code, status = 422) {
  return Object.assign(new Error(code), { code, status });
}

function checkedInput(input) {
  if (!Buffer.isBuffer(input) || !input.length) throw imageError('empty_image');
  if (input.length > MAX_BYTES) throw imageError('image_too_large', 413);
  return input;
}

function decodeImageData(value) {
  if (typeof value !== 'string') throw imageError('invalid_image_data', 400);
  if (value.length > Math.ceil(MAX_BYTES / 3) * 4 + 100) throw imageError('image_too_large', 413);
  const match = /^data:image\/(?:svg\+xml|x-icon|vnd\.microsoft\.icon|ico|png|jpeg|webp|gif|avif);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || !match[1] || match[1].length % 4) throw imageError('invalid_image_data', 400);
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.toString('base64') !== match[1]) throw imageError('invalid_image_data', 400);
  return checkedInput(bytes);
}

function sniffFormat(input) {
  if (input.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg';
  if (/^GIF8[79]a$/.test(input.subarray(0, 6).toString('ascii'))) return 'gif';
  if (input.subarray(0, 4).toString('ascii') === 'RIFF' && input.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (input.subarray(4, 8).toString('ascii') === 'ftyp' && /^(avif|avis)$/.test(input.subarray(8, 12).toString('ascii'))) return 'avif';
  if (input.length >= 6 && input.readUInt16LE(0) === 0 && input.readUInt16LE(2) === 1) return 'ico';
  if (/^\s*</.test(input.toString('utf8').replace(/^\uFEFF/, ''))) return 'svg';
  throw imageError('unsupported_image');
}

function checkedDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw imageError('image_dimensions_exceeded');
}

// Parse XML, not MIME/extension guesses or a regex sanitizer. No external assets,
// declarations, executable content, CSS escapes or filter allocations enter librsvg.
function validateSVG(input) {
  const { SaxesParser } = require('saxes');
  const text = input.toString('utf8').replace(/^\uFEFF/, '');
  if (text.includes('\0') || Buffer.from(text).length !== input.length - (input.subarray(0, 3).equals(Buffer.from([239, 187, 191])) ? 3 : 0)) throw imageError('unsafe_svg');
  const parser = new SaxesParser({ xmlns: true });
  let nodes = 0;
  let root = false;
  let styleDepth = 0;
  function safeValue(value) {
    if (/\\|@|(?:https?|file|ftp|data):/i.test(value)) throw imageError('unsafe_svg');
    for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) if (!/^\s*['"]?#[A-Za-z_][\w:.-]*['"]?\s*$/.test(match[1])) throw imageError('unsafe_svg');
  }
  parser.on('error', () => { throw imageError('invalid_image'); });
  parser.on('doctype', () => { throw imageError('unsafe_svg'); });
  parser.on('processinginstruction', () => { throw imageError('unsafe_svg'); });
  parser.on('opentag', tag => {
    if (++nodes > 20000) throw imageError('unsafe_svg');
    if (!root) {
      if (tag.local !== 'svg' || (tag.uri && tag.uri !== 'http://www.w3.org/2000/svg')) throw imageError('unsupported_image');
      root = true;
    }
    if (/^(script|foreignobject|image|iframe|object|embed|filter|fe.*|animate.*|set)$/i.test(tag.local)) throw imageError('unsafe_svg');
    if (tag.local.toLowerCase() === 'style') styleDepth++;
    for (const attr of Object.values(tag.attributes)) {
      if (attr.name === 'xmlns' || attr.prefix === 'xmlns') continue;
      if (/^on/i.test(attr.local) || (attr.local === 'base' && attr.uri === 'http://www.w3.org/XML/1998/namespace')) throw imageError('unsafe_svg');
      if (attr.local === 'href' && !/^#[A-Za-z_][\w:.-]*$/.test(attr.value)) throw imageError('unsafe_svg');
      safeValue(attr.value);
    }
  });
  parser.on('closetag', tag => { if (tag.local.toLowerCase() === 'style') styleDepth--; });
  parser.on('text', value => { if (styleDepth) safeValue(value); });
  parser.on('cdata', value => { if (styleDepth) safeValue(value); });
  parser.write(text).close();
  if (!root) throw imageError('invalid_image');
}

// ICO is a tiny container, but it can contain PNG or an uncompressed DIB. Decode
// only documented bounded layouts; compressed/bitfield variants fall back to the
// next logo candidate. No library gets attacker-selected dimensions unchecked.
function decodeICO(input) {
  const count = input.readUInt16LE(4);
  const directoryEnd = 6 + count * 16;
  if (!count || count > 64 || directoryEnd > input.length) throw imageError('invalid_image');
  const frames = [];
  for (let index = 0; index < count; index++) {
    const pos = 6 + index * 16;
    const width = input[pos] || 256;
    const height = input[pos + 1] || 256;
    const size = input.readUInt32LE(pos + 8);
    const offset = input.readUInt32LE(pos + 12);
    if (size < 8 || offset < directoryEnd || offset + size > input.length) throw imageError('invalid_image');
    frames.push({ width, height, data: input.subarray(offset, offset + size) });
  }
  frames.sort((a, b) => b.width * b.height - a.width * a.height);
  for (const frame of frames) {
    try {
      if (frame.data.subarray(0, 8).equals(PNG_SIGNATURE)) return { data: frame.data, width: frame.width, height: frame.height };
      return decodeDIB(frame);
    } catch (error) {
      if (error.code !== 'unsupported_ico') throw error;
    }
  }
  throw imageError('unsupported_ico');
}

function decodeDIB({ data, width, height }) {
  if (data.length < 40 || data.readUInt32LE(0) !== 40) throw imageError('unsupported_ico');
  const storedWidth = data.readInt32LE(4);
  const storedHeight = data.readInt32LE(8);
  const depth = data.readUInt16LE(14);
  if (storedWidth !== width || storedHeight !== height * 2 || data.readUInt16LE(12) !== 1) throw imageError('invalid_image');
  if (![1, 4, 8, 24, 32].includes(depth) || data.readUInt32LE(16) !== 0) throw imageError('unsupported_ico');
  checkedDimensions(width, height);
  const colors = depth <= 8 ? (data.readUInt32LE(32) || 2 ** depth) : 0;
  if (colors > 2 ** depth) throw imageError('invalid_image');
  const offset = 40 + colors * 4;
  const stride = Math.ceil(width * depth / 32) * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  const maskOffset = offset + stride * height;
  const hasMask = data.length >= maskOffset + maskStride * height;
  if (maskOffset > data.length || (depth !== 32 && !hasMask)) throw imageError('invalid_image');
  const pixels = Buffer.alloc(width * height * 4);
  let meaningfulAlpha = false;
  for (let y = 0; y < height; y++) {
    const row = offset + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      let at;
      if (depth <= 8) {
        const bits = x * depth;
        const paletteIndex = (data[row + (bits >> 3)] >> (8 - depth - bits % 8)) & (2 ** depth - 1);
        if (paletteIndex >= colors) throw imageError('invalid_image');
        at = 40 + paletteIndex * 4;
      } else at = row + x * (depth / 8);
      pixels[out] = data[at + 2];
      pixels[out + 1] = data[at + 1];
      pixels[out + 2] = data[at];
      pixels[out + 3] = depth === 32 ? data[at + 3] : 255;
      if (depth === 32 && data[at + 3]) meaningfulAlpha = true;
    }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = (y * width + x) * 4 + 3;
    if (depth === 32 && !meaningfulAlpha) pixels[alpha] = 255;
    if (hasMask && (data[maskOffset + (height - 1 - y) * maskStride + (x >> 3)] & (0x80 >> (x % 8)))) pixels[alpha] = 0;
  }
  return { data: pixels, width, height, raw: { width, height, channels: 4 } };
}

async function normalizeInWorker(input) {
  checkedInput(input);
  const sharp = require('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
  const format = sniffFormat(input);
  if (format === 'svg') validateSVG(input);
  const frame = format === 'ico' ? decodeICO(input) : { data: input };
  const options = { limitInputPixels: MAX_PIXELS, limitInputChannels: 4, failOn: 'warning', sequentialRead: true, ...(frame.raw ? { raw: frame.raw } : {}) };
  const metadata = await sharp(frame.data, options).metadata();
  checkedDimensions(metadata.width, metadata.height);
  if (format === 'ico' && (metadata.width !== frame.width || metadata.height !== frame.height)) throw imageError('invalid_image');
  const data = await sharp(frame.data, options).rotate().resize({ width: MAX_OUTPUT_DIMENSION, height: MAX_OUTPUT_DIMENSION, fit: 'inside', withoutEnlargement: true }).png().timeout({ seconds: 3 }).toBuffer();
  if (!data.length || data.length > MAX_BYTES) throw imageError('image_too_large', 413);
  // The logo box is white. Skip white-only/transparent assets (often dark-mode
  // header variants) so discovery can try a visible alternative, without
  // recoloring the customer's brand or changing the returned transparency.
  const visibility = await sharp(data).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer();
  if (visibility.every(channel => channel >= 245)) throw imageError('logo_not_visible_on_white');
  return { mime: 'image/png', data };
}

function createBrandImageNormalizer({ spawnProcess = spawn, timeoutMs = TIMEOUT_MS } = {}) {
let active = 0;
const queue = [];
function pumpQueue() {
  while (active < MAX_ACTIVE && queue.length) {
    const task = queue.shift();
    if (task.expired) continue;
    active++;
    const child = spawnProcess(process.execPath, ['--max-old-space-size=64', __filename, '--decode'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, MALLOC_ARENA_MAX: '2' } });
    task.child = child;
    let length = 0;
    let chunks = [];
    let stderr = '';
    let failure;
    child.stdout.on('data', chunk => {
      length += chunk.length;
      if (length > MAX_BYTES) { failure = imageError('image_too_large', 413); chunks = []; child.kill('SIGKILL'); } else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-512); });
    child.stdin.on('error', () => {});
    child.once('error', () => { failure = imageError('brand_image_failed', 502); });
    child.once('close', code => {
      active--;
      clearTimeout(task.timer);
      if (!task.expired) {
        if (failure) task.reject(failure);
        else if (code !== 0 || !length) {
          const errorCode = stderr.match(/(?:^|\n)UPG_IMAGE_ERROR:(image_too_large|unsafe_svg|unsupported_image|unsupported_ico|image_dimensions_exceeded|logo_not_visible_on_white)(?:\n|$)/)?.[1] || 'invalid_image';
          task.reject(imageError(errorCode, errorCode === 'image_too_large' ? 413 : 422));
        }
        else task.resolve({ mime: 'image/png', data: Buffer.concat(chunks) });
      }
      pumpQueue();
    });
    child.stdin.end(task.input);
  }
}

function normalizeBrandImage(input) {
  try { checkedInput(input); } catch (error) { return Promise.reject(error); }
  if (queue.length >= MAX_QUEUED) return Promise.reject(imageError('image_decoder_busy', 503));
  return new Promise((resolve, reject) => {
    const task = { input, resolve, reject, expired: false };
    // Deadline includes queue time and kills the decoder rather than abandoning
    // an expensive native operation in the long-lived server process.
    task.timer = setTimeout(() => {
      task.expired = true;
      const index = queue.indexOf(task);
      if (index >= 0) queue.splice(index, 1);
      task.child?.kill('SIGKILL');
      reject(imageError('image_decode_timeout', 504));
    }, timeoutMs);
    queue.push(task);
    pumpQueue();
  });
}
return normalizeBrandImage;
}
const normalizeBrandImage = createBrandImageNormalizer();

if (require.main === module && process.argv[2] === '--decode') {
  let length = 0;
  const chunks = [];
  process.stdin.on('data', chunk => {
    length += chunk.length;
    if (length > MAX_BYTES) process.exit(1);
    chunks.push(chunk);
  });
  process.stdin.on('end', async () => {
    try { process.stdout.write((await normalizeInWorker(Buffer.concat(chunks))).data); }
    catch (error) { process.stderr.write(`\nUPG_IMAGE_ERROR:${error.code || 'invalid_image'}\n`); process.exitCode = 1; }
  });
}

module.exports = { normalizeBrandImage, decodeImageData, createBrandImageNormalizer, MAX_BYTES };
