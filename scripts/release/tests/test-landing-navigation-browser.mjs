/** Browser regressions against the released landing and real authentication bundle. */
import assert from 'node:assert/strict';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const publicRoot = path.join(root, 'apps/customer-web-next/public');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_ROOT || '/tmp/craves-browser/package.json');
const { chromium } = require('playwright');
const manifest = JSON.parse(readFileSync(path.join(publicRoot, 'landing-auth/manifest.json'), 'utf8'));
const cases = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const publicDestinations = ['/contact', '/privacy', '/terms', '/chef/application'];
const server = createServer(async (request, response) => {
  const label = request.headers['x-craves-navigation-case'];
  const state = cases.get(label);
  const pathname = new URL(request.url, 'http://fixture.invalid').pathname;
  if (!state) { response.writeHead(404).end(); return; }
  state.requests.push({ method: request.method, path: pathname, url: request.url });
  if (pathname.startsWith('/api/')) {
    // These are local anonymous-session receipts, never production services.
    const allowed = (pathname === '/api/auth/me' && request.method === 'GET') ||
      (pathname === '/api/auth/refresh' && request.method === 'POST');
    response.writeHead(allowed ? 401 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ code: 'AUTHENTICATION_REQUIRED' }));
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  if (pathname === '/landing-auth/manifest.json' && state.manifestFailures > 0) {
    state.manifestFailures -= 1;
    response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{}');
    return;
  }
  if (pathname === manifest.script && state.scriptFailures > 0) {
    state.scriptFailures -= 1;
    response.writeHead(503, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end('');
    return;
  }
  if (pathname === manifest.style && state.cssGate) await state.cssGate;
  if (publicDestinations.includes(pathname)) {
    // Route receipts prove the compiled links retain their destinations.
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><html><body><main><h1>Public route ' + pathname + '</h1></main></body></html>');
    return;
  }
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400).end(); return; }
  const filename = path.resolve(publicRoot, decoded === '/' ? 'landing-v20/index.html' : '.' + decoded);
  if (!filename.startsWith(publicRoot + path.sep)) { response.writeHead(404).end(); return; }
  let info;
  try { info = statSync(filename); } catch { response.writeHead(404).end(); return; }
  if (!info.isFile()) { response.writeHead(404).end(); return; }
  const headers = { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  let start = 0, end = info.size - 1, status = 200;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
    } else start = info.size;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= info.size) {
      response.writeHead(416, { 'Content-Range': 'bytes */' + info.size }).end(); return;
    }
    status = 206;
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + info.size;
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
const origin = 'http://127.0.0.1:' + server.address().port;
const outcomes = [];
let browser;
const count = (state, pathname) => state.requests.filter(request => request.path === pathname).length;
const providerPattern = /identitytoolkit|securetoken|msg91|recaptcha|firebaseapp|accounts\.google/i;

async function fixture(label, options = {}, failures = {}) {
  const state = { requests: [], external: [], errors: [], manifestFailures: 0, scriptFailures: 0, ...failures };
  if (state.holdCss) state.cssGate = new Promise(resolve => { state.releaseCss = resolve; });
  cases.set(label, state);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.setExtraHTTPHeaders({ 'x-craves-navigation-case': label });
  const page = await context.newPage();
  page.on('pageerror', error => state.errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    state.external.push(url.origin + url.pathname);
    return route.abort();
  });
  await page.addInitScript(() => {
    window.__landingAuthPaint = { trustedClickMs: null, firstPaint: null, unstyledPaints: [] };
    document.addEventListener('click', event => {
      if (event.isTrusted && event.target.closest?.('a[href="#sign-in"]')) {
        window.__landingAuthPaint.trustedClickMs = performance.now();
      }
    }, true);
    const inspect = () => {
      const modal = document.querySelector('.auth-modal');
      if (!modal) return;
      const style = getComputedStyle(modal);
      const panel = modal.querySelector('.auth-modal__panel');
      const snapshot = {
        atMs: performance.now(), position: style.position, display: style.display,
        panelRadius: panel ? getComputedStyle(panel).borderRadius : '',
        sheetReady: [...document.querySelectorAll('link[rel="stylesheet"]')].some(link =>
          new URL(link.href).pathname.startsWith('/landing-auth/') && Boolean(link.sheet)),
      };
      window.__landingAuthPaint.firstPaint ||= snapshot;
      if (snapshot.position !== 'fixed' || snapshot.display !== 'grid' || !snapshot.sheetReady) {
        window.__landingAuthPaint.unstyledPaints.push(snapshot);
      }
    };
    new MutationObserver(inspect).observe(document, { childList: true, subtree: true });
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.navbar') &&
    !document.querySelector('.splash') && !document.getElementById('craves-boot') &&
    !document.body.classList.contains('splash-active'), null, { timeout: 15000 });
  assert.equal(count(state, '/landing-auth/manifest.json'), 0, 'No authentication download before user intent');
  return { context, page, state, link: page.locator('a[href="#sign-in"]').first() };
}
async function waitForRequests(page, state, pathname, expected) {
  await page.waitForTimeout(50);
  const started = Date.now();
  while (count(state, pathname) < expected && Date.now() - started < 5000) await page.waitForTimeout(25);
  assert(count(state, pathname) >= expected, 'Expected local request ' + pathname);
}
async function assertPrewarmOnly(fixture) {
  assert.equal(await fixture.page.locator('.auth-modal').count(), 0, 'Prewarm must not open or change the popup');
  assert.equal(fixture.state.requests.filter(request => request.path.startsWith('/api/')).length, 0,
    'Importing the real auth bundle must not read or change a customer session');
  assert.deepEqual(fixture.state.external.filter(url => providerPattern.test(url)), [],
    'Prewarm must not contact an OTP, identity, captcha, or authentication provider');
  assert.equal(await fixture.link.getAttribute('aria-busy'), null, 'Prewarm must preserve the existing link state');
  assert.equal(await fixture.link.innerText(), 'Sign up / Sign in');
}
async function assertStyledPopup(fixture) {
  await fixture.page.locator('.auth-modal').waitFor({ state: 'visible', timeout: 10000 });
  const paint = await fixture.page.evaluate(() => window.__landingAuthPaint);
  assert(paint.trustedClickMs !== null, 'The popup must be opened by an actual trusted user click');
  assert(paint.firstPaint?.sheetReady && paint.firstPaint.position === 'fixed' && paint.firstPaint.display === 'grid',
    'The popup stylesheet must be applied before its first visible DOM paint');
  assert.deepEqual(paint.unstyledPaints, [], 'No unstyled authentication frame may be exposed');
  assert.equal(await fixture.page.locator('.auth-modal').count(), 1, 'Exactly one popup is opened');
  assert.deepEqual(fixture.state.external.filter(url => providerPattern.test(url)), [], 'Opening the form must not send OTP/provider requests');
  assert(fixture.state.requests.filter(request => request.path.startsWith('/api/')).every(request =>
    request.path === '/api/auth/me' || request.path === '/api/auth/refresh'), 'No customer form or OTP API is called');
  await fixture.page.waitForFunction(() => !document.querySelector('a[href="#sign-in"]').hasAttribute('aria-busy'));
  assert.equal(await fixture.link.innerText(), 'Sign up / Sign in');
  return { clickToStyledPopupMs: Math.round(paint.firstPaint.atMs - paint.trustedClickMs) };
}
async function finish(name, fixture, details = {}) {
  fixture.state.releaseCss?.();
  assert.deepEqual(fixture.state.errors, [], name + ': unexpected application exception');
  outcomes.push({ name, passed: true, ...details });
  await fixture.context.close();
}

try {
  browser = await chromium.launch({ headless: true });
  const prewarm = await fixture('pointer-focus-prewarm');
  await prewarm.link.hover();
  await prewarm.link.focus();
  await waitForRequests(prewarm.page, prewarm.state, manifest.script, 1);
  await prewarm.page.waitForFunction(pathname => [...document.querySelectorAll('link')].some(link =>
    new URL(link.href).pathname === pathname && Boolean(link.sheet)), manifest.style);
  await prewarm.page.waitForTimeout(150);
  await assertPrewarmOnly(prewarm);
  assert.equal(count(prewarm.state, '/landing-auth/manifest.json'), 1, 'Pointer and keyboard intent share the manifest request');
  assert.equal(count(prewarm.state, manifest.script), 1, 'Pointer and keyboard intent share the real module request');
  await prewarm.link.click();
  const prewarmPopup = await assertStyledPopup(prewarm);
  assert.equal(count(prewarm.state, '/landing-auth/manifest.json'), 1, 'Click must reuse the completed prewarm');
  assert.equal(count(prewarm.state, manifest.script), 1, 'Click must not fetch a second auth entry');
  await finish('pointer-focus-prewarm-deduplicates-without-auth-calls', prewarm, prewarmPopup);

  const touch = await fixture('touch-css-ready', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { holdCss: true });
  try {
    await touch.link.tap();
    await waitForRequests(touch.page, touch.state, manifest.script, 1);
    await touch.page.waitForTimeout(150);
    assert.equal(await touch.page.locator('.auth-modal').count(), 0, 'A cold touch click must wait for the pending stylesheet');
    touch.state.releaseCss();
    const touchPopup = await assertStyledPopup(touch);
    assert.equal(count(touch.state, '/landing-auth/manifest.json'), 1, 'Touch intent and click share the same load');
    assert.equal(count(touch.state, manifest.script), 1);
    await finish('touch-click-waits-for-popup-css', touch, touchPopup);
  } finally { touch.state.releaseCss(); }

  for (const failure of ['manifest', 'script']) {
    const retry = await fixture(failure + '-retry', {}, failure === 'manifest' ? { manifestFailures: 1 } : { scriptFailures: 1 });
    const failedPath = failure === 'manifest' ? '/landing-auth/manifest.json' : manifest.script;
    const failureResponse = retry.page.waitForResponse(response => new URL(response.url()).pathname === failedPath && response.status() === 503);
    await retry.link.hover();
    await failureResponse;
    await retry.page.waitForTimeout(150);
    await assertPrewarmOnly(retry);
    await retry.link.focus();
    await waitForRequests(retry.page, retry.state, '/landing-auth/manifest.json', 2);
    await retry.page.waitForTimeout(200);
    await assertPrewarmOnly(retry);
    await retry.link.click();
    const retryPopup = await assertStyledPopup(retry);
    assert.equal(count(retry.state, '/landing-auth/manifest.json'), 2, 'A failed prewarm must leave one shared retry, not duplicate loaders');
    assert.equal(count(retry.state, manifest.script), failure === 'script' ? 2 : 1, 'A transient entry fetch failure must recover in the real browser');
    await finish(failure + '-failure-retries-real-auth-bundle', retry, retryPopup);
  }

  const navigation = await fixture('canonical-homepage-links');
  for (const [label, hash] of [['Why Craves', '#why-craves'], ['Features', '#delivery'], ['For Chefs', '#for-chefs'], ['Contact', '#contact']]) {
    const link = navigation.page.locator('.navbar__links a').filter({ hasText: label });
    assert.equal(await link.getAttribute('href'), hash);
    const before = await navigation.page.locator(hash).evaluate(element => element.getBoundingClientRect().top);
    await link.click();
    await navigation.page.waitForFunction(hash => location.hash === hash, hash, { timeout: 5000 });
    await navigation.page.waitForFunction(({ hash, before }) => {
      const target = document.querySelector(hash);
      const bounds = target.getBoundingClientRect();
      return bounds.top < innerHeight && bounds.bottom > 0 && (Math.abs(bounds.top - before) > 5 || Math.abs(bounds.top) < 200);
    }, { hash, before }, { timeout: 5000 });
  }
  assert.equal(navigation.state.requests.filter(request => request.path === '/').length, 1, 'Section links must preserve in-page navigation');
  await assertPrewarmOnly(navigation);
  await finish('canonical-section-links-preserve-destinations', navigation);

  for (const destination of publicDestinations) {
    const route = await fixture('public-' + destination.replace(/[^a-z]/g, '-'));
    const link = route.page.locator('footer a[href="' + destination + '"]').first();
    assert.equal(await link.getAttribute('href'), destination);
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await route.page.waitForURL(origin + destination);
    assert.equal(await route.page.locator('h1').innerText(), 'Public route ' + destination);
    assert(route.state.requests.some(request => request.method === 'GET' && request.path === destination));
    assert.equal(route.state.requests.filter(request => request.path.startsWith('/api/')).length, 0, 'Public links must not initiate authentication');
    await finish('public-link-preserves-' + destination.slice(1).replaceAll('/', '-'), route);
  }
  console.log(JSON.stringify({ landingNavigationBrowser: 'passed', productionServicesUsed: false, otpOrFormRequests: 0, scenarios: outcomes }));
} catch (error) {
  console.log(JSON.stringify({ landingNavigationBrowser: 'failed', productionServicesUsed: false,
    passedScenarios: outcomes, error: error.message,
    requestsByScenario: [...cases.entries()].map(([name, state]) => ({ name,
      authRequests: state.requests.filter(request => request.path.startsWith('/landing-auth/') || request.path.startsWith('/api/')),
      providerRequests: state.external.filter(url => providerPattern.test(url)), errors: state.errors,
    })),
  }));
  throw error;
} finally {
  for (const state of cases.values()) state.releaseCss?.();
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
