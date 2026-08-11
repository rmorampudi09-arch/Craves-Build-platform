import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const hero = source(
  "../components/sections/landing-reference/ReferenceHeroDesktop.tsx",
);
const landing = source("../screens/public/LandingPage/LandingPage.tsx");

test("landing keeps customer and chef auth entrypoints separated", () => {
  assert.match(hero, /Sign up \/ Sign in/);
  assert.match(hero, /onOpenAuth\("login"\)/);
  assert.match(hero, /onBecomeChef\(\)/);
  assert.match(landing, /onOpenAuth=\{\(mode\) => openAuth\(mode, "customer"\)\}/);
  assert.match(landing, /onBecomeChef=\{\(\) => openAuth\("register", "chef"\)\}/);
  assert.match(landing, /initialAccountMode=\{authAccountMode\}/);
});

test("landing auth modal uses a glass backdrop and hides cross-role switching", () => {
  assert.match(landing, /data-auth-context=\{authAccountMode\}/);
  assert.match(landing, /backdrop-blur-xl/);
  assert.match(landing, /backdrop-blur-2xl/);
  assert.match(landing, /bg-white\/80/);
  assert.match(landing, /\[&_\[role=dialog\]_fieldset\]:hidden/);
});
