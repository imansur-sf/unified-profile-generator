'use strict';

const fs = require('node:fs');

const WIDTH = 1600;
const HEIGHT = 900;
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CAPTURE_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

function captureDocument(html) {
  // This input is exclusively our trusted renderer output, not arbitrary HTML.
  // Keep browser scripting available for automation promises/animation frames,
  // while removing document scripts and prohibiting their execution via CSP.
  const inert = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const policy = `<meta http-equiv="Content-Security-Policy" content="${CAPTURE_CSP}">`;
  if (/<head\b[^>]*>/i.test(inert)) return inert.replace(/<head\b[^>]*>/i, head => head + policy);
  if (/<html\b[^>]*>/i.test(inert)) return inert.replace(/<html\b[^>]*>/i, root => root + `<head>${policy}</head>`);
  return `<!doctype html><html><head>${policy}</head><body>${inert}</body></html>`;
}

function captureError(code, status) {
  return Object.assign(new Error(code), { code, status });
}

function executableExists(filename) {
  if (typeof filename !== 'string' || !filename.trim()) return false;
  try { fs.accessSync(filename, fs.constants.X_OK); return fs.statSync(filename).isFile(); }
  catch (_) { return false; }
}

function browserEnvironment() {
  // Do not inherit API keys, cloud credentials, or application configuration.
  const env = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ', 'FONTCONFIG_PATH', 'FONTCONFIG_FILE']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

function validPNG(png) {
  return Buffer.isBuffer(png) && png.length >= 33 && png.length <= MAX_PNG_BYTES &&
    png.subarray(0, 8).equals(PNG_SIGNATURE) && png.readUInt32BE(8) === 13 &&
    png.toString('ascii', 12, 16) === 'IHDR' &&
    png.readUInt32BE(16) === OUTPUT_WIDTH && png.readUInt32BE(20) === OUTPUT_HEIGHT;
}

function createProfileCapture({ launchBrowser, executablePath = process.env.UPG_CAPTURE_EXECUTABLE_PATH, maxActive = 1, timeoutMs = 12000 } = {}) {
  if (!Number.isInteger(maxActive) || maxActive < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1) throw new TypeError('Invalid capture limits');
  const available = typeof launchBrowser === 'function' || executableExists(executablePath);
  let active = 0;

  async function capture(html) {
    if (!available) throw captureError('capture_not_configured', 503);
    if (typeof html !== 'string' || !html.length) throw captureError('invalid_capture_html', 400);
    if (Buffer.byteLength(html) > 24 * 1024 * 1024) throw captureError('capture_html_too_large', 413);
    if (active >= maxActive) throw captureError('capture_busy', 429);
    active++;
    let expired = false, timer, browser, context, creatingResource = true, released = false;
    const closed = new Map();
    function close(resource) {
      if (!resource) return Promise.resolve();
      if (closed.has(resource)) return closed.get(resource);
      const closing = Promise.resolve().then(() => resource.close());
      // Timeout cleanup may finish before the pending operation unwinds.
      closing.catch(() => {});
      closed.set(resource, closing);
      return closing;
    }
    async function cleanup() {
      // Start both closes together: a stuck context must not delay terminating
      // its browser. Never recycle capacity without confirmed cleanup.
      const ownedContext = context, ownedBrowser = browser;
      const results = await Promise.allSettled([close(ownedContext), close(ownedBrowser)]);
      const confirmed = !creatingResource && context === ownedContext && browser === ownedBrowser && results.every(result => result.status === 'fulfilled');
      if (confirmed && !released) { released = true; active--; }
      return confirmed;
    }
    function checkDeadline() {
      if (expired) throw captureError('capture_timeout', 504);
    }
    const work = async () => {
      try {
        let launch = launchBrowser;
        if (!launch) {
          try { launch = require('playwright-core').chromium.launch.bind(require('playwright-core').chromium); }
          catch (_) { throw captureError('capture_not_configured', 503); }
        }
        browser = await launch({ executablePath, headless: true, chromiumSandbox: true, env: browserEnvironment(), timeout: timeoutMs });
        creatingResource = false;
        checkDeadline();
        creatingResource = true;
        context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1.2, javaScriptEnabled: true, serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce', colorScheme: 'light' });
        creatingResource = false;
        checkDeadline();
        await context.route('**/*', route => route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient'));
        checkDeadline();
        const page = await context.newPage();
        checkDeadline();
        await page.setContent(captureDocument(html), { waitUntil: 'load', timeout: timeoutMs });
        checkDeadline();
        const assetsReady = await page.evaluate(async () => {
          if (document.fonts?.ready) await document.fonts.ready;
          await Promise.all(Array.from(document.images, image => {
            if (image.complete) return Promise.resolve();
            return new Promise(resolve => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            });
          }));
          for (const image of document.images) {
            if (!image.complete || !image.naturalWidth) return false;
            if (image.decode) { try { await image.decode(); } catch (_) { return false; } }
          }
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return true;
        });
        checkDeadline();
        if (!assetsReady) throw captureError('capture_assets_missing', 422);
        const png = await page.screenshot({ type: 'png', scale: 'device', fullPage: false, animations: 'disabled', timeout: timeoutMs });
        checkDeadline();
        if (!validPNG(png)) throw captureError('capture_invalid_png', 502);
        return { png, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT };
      } finally {
        creatingResource = false;
        if (!await cleanup()) throw captureError('capture_cleanup_failed', 503);
      }
    };
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        void cleanup();
        reject(captureError('capture_timeout', 504));
      }, timeoutMs);
    });
    try { return await Promise.race([work(), deadline]); }
    catch (error) {
      if (error.code?.startsWith('capture_') || error.code === 'invalid_capture_html') throw error;
      throw captureError('capture_failed', 502);
    } finally { clearTimeout(timer); }
  }

  return { capture, available };
}

module.exports = { createProfileCapture };
