const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const sharp = require('sharp');
const { normalizeBrandImage, decodeImageData, createBrandImageNormalizer, MAX_BYTES } = require('../lib/brand-image');

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><path fill="#f00" d="M0 0h10v10H0z"/></svg>';
const pngFixture = () => sharp(Buffer.from([255, 0, 0, 128, 0, 255, 0, 0]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
function ico(frame, width, height) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = width === 256 ? 0 : width;
  header[7] = height === 256 ? 0 : height;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(frame.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, frame]);
}
function bitmapIcon(depth, { legacyAlpha = false, noMask = false } = {}) {
  const palette = depth <= 8 ? 2 : 0;
  const stride = Math.ceil(2 * depth / 32) * 4;
  const start = 40 + palette * 4;
  const data = Buffer.alloc(start + stride * 2 + (noMask ? 0 : 8));
  data.writeUInt32LE(40);
  data.writeInt32LE(2, 4);
  data.writeInt32LE(4, 8);
  data.writeUInt16LE(1, 12);
  data.writeUInt16LE(depth, 14);
  data.writeUInt32LE(palette, 32);
  if (palette) {
    data.set([255, 0, 0, 0, 0, 0, 255, 0], 40); // blue / red BGRA palette
    for (let row = 0; row < 2; row++) data[start + row * stride] = depth === 8 ? 1 : 1 << (8 - depth);
  } else {
    for (let row = 0; row < 2; row++) for (let x = 0; x < 2; x++) {
      const at = start + row * stride + x * (depth / 8);
      data.set(x ? [255, 0, 0] : [0, 0, 255], at);
      if (depth === 32) data[at + 3] = legacyAlpha ? 0 : 128;
    }
  }
  if (!noMask) data[start + stride * 2 + 4] = 0x40; // top-right transparent
  return ico(data, 2, 2);
}
async function raw(image) { return sharp(image.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }

test('SVG normalizes to transparent inert PNG, with stylesheet/internal references supported', async () => {
  const result = await normalizeBrandImage(Buffer.from(SVG));
  assert.equal(result.mime, 'image/png');
  assert.equal(result.data.subarray(1, 4).toString(), 'PNG');
  const output = await raw(result);
  assert.equal(output.info.width, 20);
  assert.equal(output.data[3], 255);
  assert.equal(output.data[19 * 4 + 3], 0);
  const referenced = SVG.replace('<path', '<style>.red { fill:url(#paint) }</style><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><path class="red"');
  assert.equal((await normalizeBrandImage(Buffer.from(referenced))).mime, 'image/png');
});

test('PNG-backed ICO keeps pixels and alpha', async () => {
  const png = await pngFixture();
  const output = await raw(await normalizeBrandImage(ico(png, 2, 1)));
  assert.deepEqual([...output.data], [255, 0, 0, 128, 0, 255, 0, 0]);
});

test('invisible white or transparent logos are rejected so a visible fallback can be selected', async () => {
  const white = Buffer.from(SVG.replace('#f00', '#fff'));
  const transparent = await sharp({ create: { width: 20, height: 10, channels: 4, background: '#00000000' } }).png().toBuffer();
  for (const input of [white, transparent]) await assert.rejects(normalizeBrandImage(input), { code: 'logo_not_visible_on_white' });
  const visible = await pngFixture();
  let selected;
  for (const input of [white, visible]) {
    try { selected = await normalizeBrandImage(input); break; } catch (error) { assert.equal(error.code, 'logo_not_visible_on_white'); }
  }
  assert.equal((await sharp(selected.data).metadata()).width, 2);
  const whiteOnDark = Buffer.from(SVG.replace('<path', '<rect width="20" height="10" fill="#000"/><path').replace('#f00', '#fff'));
  assert.equal((await normalizeBrandImage(whiteOnDark)).mime, 'image/png');
});

for (const depth of [1, 4, 8, 24, 32]) {
  test(`${depth}-bit BMP-backed ICO decodes color, bottom-up rows and AND transparency`, async () => {
    const output = await raw(await normalizeBrandImage(bitmapIcon(depth)));
    const alpha = depth === 32 ? 128 : 255;
    assert.deepEqual([...output.data], [255, 0, 0, alpha, 0, 0, 255, 0, 255, 0, 0, alpha, 0, 0, 255, alpha]);
  });
}

test('legacy 32-bit ICO with zero alpha uses AND mask, modern maskless ICO keeps alpha', async () => {
  assert.equal((await raw(await normalizeBrandImage(bitmapIcon(32, { legacyAlpha: true })))).data[3], 255);
  const maskless = await raw(await normalizeBrandImage(bitmapIcon(32, { noMask: true })));
  assert.equal(maskless.data[7], 128);
});

test('raster images are actually decoded, normalized and bounded regardless of advertised MIME', async () => {
  for (const format of ['png', 'jpeg', 'webp', 'gif', 'avif']) {
    const input = await sharp({ create: { width: 500, height: 10, channels: 4, background: '#ff000080' } }).toFormat(format).toBuffer();
    const result = await normalizeBrandImage(input);
    const metadata = await sharp(result.data).metadata();
    assert.equal(result.mime, 'image/png');
    assert.equal(metadata.width, 320);
    assert.ok(result.data.length <= MAX_BYTES);
  }
  await assert.rejects(normalizeBrandImage(Buffer.from('not a PNG')), { code: 'unsupported_image' });
  await assert.rejects(normalizeBrandImage(Buffer.from('<html><body>login</body></html>')), { code: 'unsupported_image' });
  await assert.rejects(normalizeBrandImage((await pngFixture()).subarray(0, 16)), { code: 'invalid_image' });
});

test('SVG rejects declarations, external/encoded references, executable content and CSS imports', async () => {
  const unsafe = [
    '<!DOCTYPE svg [<!ENTITY x "a">]>' + SVG,
    '<?xml-stylesheet href="https://attacker.example/style.css"?>' + SVG,
    SVG.replace('<path', '<image href="https://attacker.example/logo.png"/><path'),
    SVG.replace('<path', '<use href="&#104;ttps://attacker.example/asset.svg#x"/><path'),
    SVG.replace('<path', '<use href="/local-file"/><path'),
    SVG.replace('<path', '<style>@import "//attacker.example/style.css";</style><path'),
    SVG.replace('<path', '<style>.x { fill: url(//attacker.example/x) }</style><path'),
    SVG.replace('<path', '<style>.x { fill: u\\72l(//attacker.example/x) }</style><path'),
    SVG.replace('<path', '<script>alert(1)</script><path'),
    SVG.replace('<path', '<foreignObject/><path'),
    SVG.replace('<path', '<filter/><path'),
    SVG.replace('<path', '<path onload="alert(1)"'),
    SVG.replace('<path', '<path xml:base="/tmp/"')
  ];
  for (const value of unsafe) await assert.rejects(normalizeBrandImage(Buffer.from(value)), { code: 'unsafe_svg' });
  await assert.rejects(normalizeBrandImage(Buffer.from(SVG.replace('width="20"', 'width="50000"'))), error => ['image_dimensions_exceeded', 'invalid_image'].includes(error.code));
});

test('ICO directory offsets, dimensions, palettes and truncated pixel buffers are rejected', async () => {
  const invalid = [];
  let input = bitmapIcon(32); input.writeUInt32LE(0xffffffff, 18); invalid.push(input);
  input = bitmapIcon(32); input.writeUInt16LE(65, 4); invalid.push(input);
  input = bitmapIcon(32); input.writeInt32LE(-2, 26); invalid.push(input);
  input = bitmapIcon(8); input.writeUInt32LE(300, 54); invalid.push(input);
  input = bitmapIcon(24).subarray(0, 63); input.writeUInt32LE(input.length - 22, 14); invalid.push(input);
  input = bitmapIcon(32); input.writeUInt32LE(3, 38); invalid.push(input);
  input = bitmapIcon(8); input[70] = 5; invalid.push(input);
  for (const value of invalid) await assert.rejects(normalizeBrandImage(value), error => ['invalid_image', 'unsupported_ico'].includes(error.code));
});

test('embedded legacy data is strictly base64-bounded and still validated by the decoder', async () => {
  const encoded = `data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}`;
  assert.equal((await normalizeBrandImage(decodeImageData(encoded))).mime, 'image/png');
  for (const input of [undefined, null, 1, 'data:image/svg+xml,<svg/>', 'https://logo.example/icon.svg', 'data:text/html;base64,PHN2Zy8+', 'data:image/png;base64,abc']) assert.throws(() => decodeImageData(input), { code: 'invalid_image_data' });
  assert.throws(() => decodeImageData('data:image/png;base64,' + 'A'.repeat(800000)), { code: 'image_too_large' });
  await assert.rejects(normalizeBrandImage(Buffer.alloc(MAX_BYTES + 1)), { code: 'image_too_large' });
});

test('compressed dimension and pixel bombs are rejected before full rasterization', async () => {
  const oversizedWidth = await sharp({ create: { width: 4097, height: 1, channels: 3, background: '#f00' } }).png().toBuffer();
  assert.ok(oversizedWidth.length < MAX_BYTES);
  await assert.rejects(normalizeBrandImage(oversizedWidth), { code: 'image_dimensions_exceeded' });
  const oversizedPixels = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#f00' } }).png().toBuffer();
  assert.ok(oversizedPixels.length < MAX_BYTES);
  await assert.rejects(normalizeBrandImage(oversizedPixels), error => ['image_dimensions_exceeded', 'invalid_image'].includes(error.code));
});

test('decoder concurrency, queue cap and hard deadlines include queued work', async () => {
  let spawned = 0;
  let killed = 0;
  const normalize = createBrandImageNormalizer({ timeoutMs: 30, spawnProcess: () => {
    spawned++;
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdin.end = () => {};
    child.kill = signal => { assert.equal(signal, 'SIGKILL'); killed++; setImmediate(() => child.emit('close', null)); };
    return child;
  } });
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => normalize(Buffer.from(SVG))));
  assert.equal(spawned, 2);
  assert.equal(killed, 2);
  assert.equal(results.filter(result => result.reason.code === 'image_decoder_busy').length, 2);
  assert.equal(results.filter(result => result.reason.code === 'image_decode_timeout').length, 10);
});
