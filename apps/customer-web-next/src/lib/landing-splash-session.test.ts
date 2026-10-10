import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("the landing splash plays once per browser session and repeat visits fade in quickly", () => {
  const index = source("../../public/landing-v20/index.html");
  const app = source("../../../landing-v20/src/App.tsx");

  // The first-paint cover is plain white once the splash has been seen this session.
  assert.match(index, /sessionStorage\.getItem\('craves\.landing\.splashSeen'\) === '1'/);
  assert.match(index, /root\.setAttribute\('data-craves-boot', seen \? 'quiet' : 'pending'\)/);
  assert.match(index, /html\[data-craves-boot="quiet"\] #craves-boot-brand \{ display: none; \}/);

  assert.match(app, /const SPLASH_SEEN_KEY = 'craves\.landing\.splashSeen'/);
  const fade = Number(/const BOOT_FADE_MS = (\d+);/.exec(app)?.[1]);
  assert.ok(fade > 0 && fade <= 360, `boot cover fade must be at most 360 ms, got ${fade}`);

  // The published bundle is the one built from this source.
  const bundle = /src="\/landing-v20\/assets\/(index-[\w-]+\.js)"/.exec(index)?.[1];
  assert.ok(bundle, "landing bundle script must be referenced");
  assert.match(source(`../../public/landing-v20/assets/${bundle}`), /craves\.landing\.splashSeen/);
});
