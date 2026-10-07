/** Real released landing playback against a disposable, range-capable local server. */
import assert from 'node:assert/strict';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const publicRoot = path.join(root, 'apps/customer-web-next/public/landing-v20');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_ROOT || '/tmp/craves-browser/package.json');
const { chromium } = require('playwright');
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json',
};

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://fixture.invalid').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/landing-v20\//, '');
  const filename = path.resolve(publicRoot, relative);
  if (!filename.startsWith(publicRoot + path.sep) || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end(); return;
  }
  let info;
  try { info = statSync(filename); } catch { response.writeHead(404).end(); return; }
  if (!info.isFile()) { response.writeHead(404).end(); return; }
  const headers = {
    'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
  };
  let start = 0, end = info.size - 1, status = 200;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
    } else start = info.size;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= info.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  response.writeHead(status, headers);
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(filename, { start, end });
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const outcomes = [];

async function fixturePage(options = {}, mediaPolicy) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  const mediaRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__heroLoadCount = 0;
    const load = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () {
      if (this.classList.contains('hero__video')) window.__heroLoadCount += 1;
      return load.call(this);
    };
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    // No OTP, customer account, provider, or other production request is allowed.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/landing-auth/')) return route.abort();
    if (/\/videos\/.*\.(mp4|webm)$/.test(url.pathname)) {
      mediaRequests.push(url.pathname);
      if (mediaPolicy) return mediaPolicy(route, mediaRequests.length);
    }
    return route.continue();
  });
  return { context, page, errors, mediaRequests };
}

async function assertHero(page) {
  await page.locator('.hero__video').waitFor({ state: 'attached', timeout: 15000 });
  const state = await page.locator('.hero__video').evaluate(video => ({
    poster: video.getAttribute('poster'), muted: video.muted, inline: video.playsInline,
    autoplay: video.autoplay, src: video.currentSrc || video.src,
    imageCount: video.closest('.hero__media').querySelectorAll('img').length,
  }));
  assert.equal(state.poster, null, 'The removed hero picture must never be configured as a poster');
  assert.equal(state.imageCount, 0, 'Hero loading must not substitute a still picture');
  assert.equal(state.muted, true);
  assert.equal(state.inline, true);
  assert.match(state.src, /\/landing-v20\/videos\/hero-web-[a-f0-9]+\.mp4(?:\?|$)/);
  await page.getByRole('heading', { name: /CRAVE MORE.*TASTE MORE/i }).waitFor({ timeout: 15000 });
}

async function assertAdvancing(page, startupTimeout = 20000) {
  await page.waitForFunction(() => {
    const video = document.querySelector('.hero__video');
    return video && !video.paused && video.readyState >= 2 && video.currentTime > 0.1;
  }, null, { timeout: startupTimeout });
  const first = await page.locator('.hero__video').evaluate(video => video.currentTime);
  await page.waitForFunction(previous => {
    const video = document.querySelector('.hero__video');
    return video && !video.paused && video.readyState >= 2 && Math.abs(video.currentTime - previous) > 0.15;
  }, first, { timeout: 10000 });
}

async function complete(name, fixture, details = {}) {
  assert.deepEqual(fixture.errors, [], `${name}: browser application error`);
  assert(fixture.mediaRequests.length > 0, `${name}: real media was not requested`);
  assert(fixture.mediaRequests.every(url => !url.includes('hero-bg-3')), 'Never download the large original on landing load');
  outcomes.push({ name, passed: true, mediaRequests: fixture.mediaRequests.length, ...details });
  await fixture.context.close();
}

try {
  assert(readFileSync(path.join(publicRoot, 'index.html'), 'utf8').includes('craves-landing-auth-bridge'));
  browser = await chromium.launch({ headless: true });

  for (const [name, options] of [
    ['cold-desktop', {}],
    ['cold-mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const fixture = await fixturePage(options);
    await fixture.page.goto(origin, { waitUntil: 'domcontentloaded' });
    await assertHero(fixture.page);
    await assertAdvancing(fixture.page);
    if (name === 'cold-desktop') {
      await fixture.page.reload({ waitUntil: 'domcontentloaded' });
      await assertHero(fixture.page);
      await assertAdvancing(fixture.page);
      await fixture.page.evaluate(() => {
        document.querySelector('.hero__video').pause();
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await assertAdvancing(fixture.page);
    }
    await complete(name, fixture, { reloadAndPageRestore: name === 'cold-desktop' });
  }

  const offscreen = await fixturePage();
  // Install before navigation so the application's watchdog interval is owned
  // by this clock. Installing after playback would leave its native timer alive.
  await offscreen.page.clock.install();
  await offscreen.page.goto(origin, { waitUntil: 'domcontentloaded' });
  await assertHero(offscreen.page);
  await assertAdvancing(offscreen.page);
  await offscreen.page.evaluate(() => {
    const video = document.querySelector('.hero__video');
    window.scrollTo(0, document.querySelector('.hero').getBoundingClientRect().height + 200);
    // WebKit naturally pauses offscreen autoplay media; reproduce that state.
    video.pause();
  });
  await offscreen.page.waitForFunction(() => document.querySelector('.hero__video').getBoundingClientRect().bottom <= 0);
  const offscreenLoads = await offscreen.page.evaluate(() => window.__heroLoadCount);
  await offscreen.page.clock.fastForward(40000);
  // Also advance past the earliest recovery delay: without a viewport guard,
  // the watchdog would schedule a reload rather than perform it immediately.
  await offscreen.page.clock.runFor(2000);
  assert.equal(await offscreen.page.evaluate(() => window.__heroLoadCount), offscreenLoads,
    'A naturally paused video outside the viewport must not restart its download');
  await complete('offscreen-pause-preserves-download', offscreen, { offscreenElapsedMs: 42000 });

  const slow = await fixturePage({}, async (route, attempt) => {
    if (attempt === 1) await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await slow.page.goto(origin, { waitUntil: 'domcontentloaded' });
  await assertHero(slow.page);
  await assertAdvancing(slow.page);
  assert.equal(await slow.page.evaluate(() => window.__heroLoadCount), 0, 'Ordinary buffering must not restart the download');
  await complete('slow-first-video', slow, { firstResponseDelayMs: 1500 });

  // Keep the first request genuinely pending: there is no network error event
  // or rejected play promise to trigger the ordinary error recovery path.
  let releaseHungRequest;
  const heldRequest = new Promise(resolve => { releaseHungRequest = resolve; });
  const hung = await fixturePage({}, async (route, attempt) => {
    if (attempt === 1) {
      await heldRequest;
      await route.abort('failed').catch(() => {});
      return;
    }
    releaseHungRequest();
    return route.continue();
  });
  try {
    await hung.page.goto(origin, { waitUntil: 'domcontentloaded' });
    await assertHero(hung.page);
    await assertAdvancing(hung.page, 45000);
    const recoveries = await hung.page.evaluate(() => window.__heroLoadCount);
    assert(recoveries > 0 && recoveries <= 3, 'A hung download must recover within its automatic retry budget');
    await complete('hung-first-download', hung, { automaticRecoveries: recoveries });
  } finally {
    releaseHungRequest();
  }

  const retry = await fixturePage({}, async (route, attempt) => {
    if (attempt === 1) return route.abort('failed');
    return route.continue();
  });
  await retry.page.goto(origin, { waitUntil: 'domcontentloaded' });
  await assertHero(retry.page);
  await assertAdvancing(retry.page);
  assert(await retry.page.evaluate(() => window.__heroLoadCount) > 0, 'An initial media failure must trigger a recovery');
  await complete('initial-network-failure', retry);

  const unavailable = await fixturePage({}, route => route.abort('failed'));
  await unavailable.page.goto(origin, { waitUntil: 'domcontentloaded' });
  await assertHero(unavailable.page);
  await unavailable.page.getByRole('button', { name: 'Play background video', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  const retries = await unavailable.page.evaluate(() => window.__heroLoadCount);
  assert.equal(retries, 3, 'Persistent failure must stop after three automatic recoveries');
  await unavailable.page.waitForTimeout(1600);
  assert.equal(await unavailable.page.evaluate(() => window.__heroLoadCount), retries, 'Recovery must not become an endless reload loop');
  await complete('bounded-persistent-failure', unavailable, { automaticRecoveries: retries });

  const denied = await fixturePage();
  await denied.page.addInitScript(() => {
    window.__allowHeroPlayback = false;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.classList.contains('hero__video') && !window.__allowHeroPlayback) {
        return Promise.reject(new DOMException('Fixture browser disabled autoplay', 'NotAllowedError'));
      }
      return play.call(this);
    };
    // Native autoplay does not call the JavaScript play() method. Disable its
    // attribute/property too, so this fixture exercises actual denied playback.
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this instanceof HTMLVideoElement && name.toLowerCase() === 'autoplay') return;
      return setAttribute.call(this, name, value);
    };
    const autoplay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'autoplay');
    Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', {
      configurable: true, get() { return autoplay.get.call(this); },
      set() { autoplay.set.call(this, false); },
    });
    document.addEventListener('click', event => {
      if (event.isTrusted && event.target.closest?.('button.hero__play')) window.__allowHeroPlayback = true;
    }, true);
  });
  await denied.page.goto(origin, { waitUntil: 'domcontentloaded' });
  await assertHero(denied.page);
  const playButton = denied.page.getByRole('button', { name: 'Play background video', exact: true });
  await playButton.waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await denied.page.locator('.hero__video').evaluate(video => video.paused), true);
  await playButton.click();
  await assertAdvancing(denied.page);
  await playButton.waitFor({ state: 'detached', timeout: 5000 });
  await complete('autoplay-denied-user-recovery', denied);

  console.log(JSON.stringify({ landingVideoBrowser: 'passed', productionServicesUsed: false, scenarios: outcomes }));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
