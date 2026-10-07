import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const app = path.join(root, 'apps/customer-web-next');
const fixture = path.join(tmpdir(), 'craves-web-pilot-fixture-' + randomUUID() + '.json');
const key = 'K'.repeat(43);
writeFileSync(fixture, JSON.stringify({ version: 1, state: { schema: 1, phase: 'waiting', updatedAt: new Date().toISOString() } }));
const child = spawn(process.execPath, ['.next/standalone/server.js'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], env: {
  ...process.env, NODE_ENV: 'production', PORT: '3000', HOSTNAME: '127.0.0.1',
  NODE_OPTIONS: '--import=' + pathToFileURL(path.join(root, 'scripts/release/tests/web-pilot-transport-fixture.mjs')).href,
  CRAVES_DISPOSABLE_WEB_LAUNCH_FIXTURE: fixture,
  CRAVES_WEB_LAUNCH_BLOB_URL: 'https://stcravesprodlowkmqgfy.blob.core.windows.net/web-pilot-launch/state.json',
  CRAVES_WEB_LAUNCH_KEY_SHA256: createHash('sha256').update(key).digest('hex'),
  CRAVES_WEB_LAUNCH_KEY_EXPIRES_AT: '2099-01-01T00:00:00.000Z',
  CRAVES_ADMIN_PORTAL: 'false', IDENTITY_ENDPOINT: 'http://127.0.0.1:42356/msi/token', IDENTITY_HEADER: 'disposable-only',
} });
let logs = '';
child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
const started = new Promise((resolve, reject) => {
  const deadline = setTimeout(() => reject(Error('Standalone server startup deadline exceeded')), 15000);
  child.on('exit', code => { clearTimeout(deadline); reject(Error('Standalone server exited: ' + code)); });
  child.stdout.on('data', () => { if (logs.includes('Ready in')) { clearTimeout(deadline); resolve(); } });
});
const request = (route, init = {}) => fetch('http://127.0.0.1:3000' + route, { ...init, redirect: 'manual', headers: {
  Host: 'craves.in', 'X-Forwarded-Host': 'craves.in', 'X-Forwarded-Proto': 'https', ...init.headers,
} });
try {
  await started;
  for (const route of ['/', '/home', '/landing-v20/index.html', '/api/cart']) {
    const response = await request(route); assert.equal(response.status, 503, route); assert.match(response.headers.get('cache-control'), /no-store/);
    const text = await response.text(); assert(!text.includes('<button'), route);
  }
  assert.deepEqual(await (await request('/api/web-launch/status')).json(), { open: false });
  assert.equal((await request('/api/web-launch/control')).status, 404);
  const owner = await request('/api/web-launch/control', { headers: { Authorization: 'Bearer ' + key } });
  assert.equal(owner.status, 200); assert.equal((await owner.json()).phase, 'waiting');
  const control = await request('/pilot-launch'); assert.equal(control.status, 200);
  assert.match(await control.text(), /id="launch" type="button" hidden/);
  const start = performance.now();
  for (let click = 0; click < 2; click += 1) {
    const response = await request('/api/web-launch/control', { method: 'POST', headers: { Authorization: 'Bearer ' + key, Origin: 'https://craves.in', 'Content-Type': 'application/json' }, body: '{"action":"launch"}' });
    assert.equal(response.status, 200); assert.equal((await response.json()).phase, 'launched');
  }
  let open = false;
  for (let attempt = 0; attempt < 20 && !open; attempt += 1) {
    open = (await (await request('/api/web-launch/status')).json()).open;
    if (!open) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(open, 'Visitors should observe launch within two seconds');
  let response = await request('/');
  for (let attempt = 0; attempt < 20 && response.status === 503; attempt += 1) {
    await response.arrayBuffer();
    await new Promise(resolve => setTimeout(resolve, 100));
    response = await request('/');
  }
  assert.equal(response.status, 200);
  const actual = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(actual, readFileSync(path.join(app, 'public/landing-v20/index.html')), 'Approved landing bytes must be untouched');
  const saved = JSON.parse(readFileSync(fixture, 'utf8')); assert.equal(saved.version, 2, 'Repeat click must not write twice');
  assert.equal(saved.state.phase, 'launched');
  const launchObservedMs = Math.round(performance.now() - start);

  // Exercise the compiled server's actual public-file responses. The active
  // manifest changes across builds; only its generated immutable URLs may cache.
  const manifestResponse = await request('/landing-auth/manifest.json');
  assert.equal(manifestResponse.status, 200, 'Generated authentication manifest should be served');
  const manifestCache = manifestResponse.headers.get('cache-control') || '';
  assert.match(manifestCache, /\bno-store\b/, 'Authentication manifest must be fetched afresh');
  assert.doesNotMatch(manifestCache, /\bimmutable\b/, 'Mutable authentication manifest must never be immutable');
  const manifestBytes = Buffer.from(await manifestResponse.arrayBuffer());
  assert.deepEqual(manifestBytes, readFileSync(path.join(app, 'public/landing-auth/manifest.json')));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.match(manifest.script, /^\/landing-auth\/auth-[A-Za-z0-9_-]{8,64}\.js$/);
  assert.match(manifest.style, /^\/landing-auth\/auth-[0-9a-f]{16}\.css$/);
  const immutableAuthAssets = [];
  for (const route of [manifest.script, manifest.style]) {
    const assetResponse = await request(route);
    assert.equal(assetResponse.status, 200, route);
    assert.equal(assetResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable', route);
    const bytes = Buffer.from(await assetResponse.arrayBuffer());
    assert(bytes.length > 0, 'Generated authentication asset must not be empty: ' + route);
    assert.deepEqual(bytes, readFileSync(path.join(app, 'public', route.slice(1))),
      'Served immutable authentication bytes must match the generated file: ' + route);
    immutableAuthAssets.push(route);
  }

  // Public asset caching must not allow unauthenticated access to private APIs.
  const privateRoutes = [
    ['GET', '/api/auth/email-verification'],
    ['POST', '/api/auth/email-verification/challenges'],
    ['POST', '/api/auth/email-verification/verify'],
    ['POST', '/api/auth/email-verification/resend'],
  ];
  for (const [method, route] of privateRoutes) {
    const denial = await request(route, { method });
    assert.equal(denial.status, 401, route);
    const cache = denial.headers.get('cache-control') || '';
    assert.match(cache, /\bprivate\b/, route);
    assert.match(cache, /\bno-store\b/, route);
    assert.doesNotMatch(cache, /\b(?:public|immutable)\b/, route);
    await denial.arrayBuffer();
  }
  console.log(JSON.stringify({ standalone: 'passed', waitingPaths: 4, unauthorizedControl: 'denied', repeatedClick: 'idempotent', launchObservedMs, approvedLanding: 'byte-identical', authManifest: 'no-store', immutableAuthAssets, authAssetBytes: 'byte-identical', privateUnauthDenials: privateRoutes.length, productionServicesUsed: false }));
} finally {
  child.kill('SIGTERM'); unlinkSync(fixture);
}
