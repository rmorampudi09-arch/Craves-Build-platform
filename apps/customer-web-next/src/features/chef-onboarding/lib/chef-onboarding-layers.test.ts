import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

// jsdom paints nothing, so only this catches a sheet (date of birth, video language) opening behind
// the application screen, which is itself a full-screen layer.
test("sheets opened inside the chef application paint above it", () => {
  const screen = Number(source("../styles/chef-onboarding.css").match(/\.cob-modal \{[^}]*z-index: (\d+)/)?.[1]);
  const sheet = [...source("../../../shared/ui/overlays/overlay.tsx").matchAll(/fixed inset[^"]* z-\[(\d+)\]/g)].map((match) => Number(match[1]));
  assert.ok(screen > 0, "the application screen has a z-index");
  assert.equal(sheet.length, 3, "the sheet backdrop and both layouts have a z-index");
  for (const layer of sheet) assert.ok(layer > screen, `sheet layer ${layer} must sit above the application screen (${screen})`);
});
