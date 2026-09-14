import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Exercise the built Next.js adapter without credentials, OTPs or backend calls.
const serverPath = resolve(".next/standalone/server.js");
assert.ok(existsSync(serverPath), "Build the standalone application first");
const reservation = createServer();
await new Promise((done, reject) => reservation.once("error", reject).listen(0, "127.0.0.1", done));
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [serverPath], {
  env: { PATH: process.env.PATH, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port),
    NEXT_TELEMETRY_DISABLED: "1", CRAVES_ADMIN_PORTAL: "true", CRAVES_API_BASE_URL: "https://example.invalid/api/v1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let diagnostic = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { diagnostic = (diagnostic + chunk).slice(-2000); });
let spawnError;
child.on("error", error => { spawnError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Standalone server exited: ${diagnostic}`);
    try { await fetch(`${origin}/api/auth/session`, { signal: AbortSignal.timeout(1000) }); ready = true; break; }
    catch { await delay(100); }
  }
  assert.ok(ready, `Standalone server did not start: ${diagnostic}`);
  const cases = [
    { name: "same-origin sign-in JSON", origin, body: "{}", status: 400, code: "INVALID_FIREBASE_TOKEN" },
    { name: "cross-origin sign-in", origin: "https://attacker.invalid", body: "{}", status: 403, code: "ORIGIN_REJECTED" },
    { name: "oversized sign-in", origin, body: JSON.stringify({ padding: "x".repeat(65_536) }), status: 413, code: "REQUEST_BODY_TOO_LARGE" },
  ];
  for (const item of cases) {
    const response = await fetch(`${origin}/api/auth/session`, { method: "POST",
      headers: { Origin: item.origin, "Content-Type": "application/json" }, body: item.body, signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    assert.equal(response.status, item.status, item.name);
    assert.equal(body.code, item.code, item.name);
    assert.equal(response.headers.has("set-cookie"), false, item.name);
  }
  console.log("PASS: built sign-in accepts JSON before Firebase validation; origin and size guards remain enforced");
} finally {
  child.kill("SIGTERM");
  const hardStop = setTimeout(() => child.kill("SIGKILL"), 5000);
  hardStop.unref();
  if (child.exitCode === null) await new Promise(done => child.once("exit", done));
  clearTimeout(hardStop);
}
