// Disposable standalone-server verification only. Never loaded by production.
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.env.CRAVES_DISPOSABLE_WEB_LAUNCH_FIXTURE;
if (!file || !file.startsWith('/tmp/craves-web-pilot-fixture-')) throw Error('Disposable fixture path required');
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith('http://127.0.0.1:42356/msi/token?')) {
    return Response.json({ access_token: 'disposable-test-storage-token', expires_on: String(Math.floor(Date.now() / 1000) + 3600) });
  }
  if (url === 'https://stcravesprodlowkmqgfy.blob.core.windows.net/web-pilot-launch/state.json') {
    const fixture = JSON.parse(readFileSync(file, 'utf8'));
    if (init.method === 'PUT') {
      if (new Headers(init.headers).get('If-Match') !== `"v${fixture.version}"`) return new Response(null, { status: 412 });
      fixture.state = JSON.parse(String(init.body)); fixture.version += 1;
      writeFileSync(file, JSON.stringify(fixture));
      return new Response(null, { status: 201 });
    }
    return Response.json(fixture.state, { headers: { ETag: `"v${fixture.version}"` } });
  }
  // No real Craves service or credential is used during this standalone test.
  if (/^https?:\/\/127\.0\.0\.1:3000\//.test(url)) return nativeFetch(input, init);
  throw Error('External network prohibited in disposable launch test');
};
