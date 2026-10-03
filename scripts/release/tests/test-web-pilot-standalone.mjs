import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const app = path.join(root, 'apps/customer-web-next');
const fixture = '/tmp/craves-web-pilot-fixture-' + randomUUID() + '.json';
const key = 'K'.repeat(43);
writeFileSync(fixture, JSON.stringify({ version: 1, state: { schema: 1, phase: 'waiting', updatedAt: new Date().toISOString() } }));
const child = spawn(process.execPath, ['.next/standalone/server.js'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], env: {
  ...process.env, NODE_ENV: 'production', PORT: '3000', HOSTNAME: '127.0.0.1',
  NODE_OPTIONS: '--import=' + path.join(root, 'scripts/release/tests/web-pilot-transport-fixture.mjs'),
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
  console.log(JSON.stringify({ standalone: 'passed', waitingPaths: 4, unauthorizedControl: 'denied', repeatedClick: 'idempotent', launchObservedMs: Math.round(performance.now() - start), approvedLanding: 'byte-identical', productionServicesUsed: false }));
} finally {
  child.kill('SIGTERM'); unlinkSync(fixture);
}
