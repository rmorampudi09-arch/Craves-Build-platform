import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const hero = source(
  "../components/sections/landing-reference/ReferenceHeroDesktop.tsx",
);
const landing = source("../screens/public/LandingPage/LandingPage.tsx");
const authModal = source("../components/auth/AuthModal.tsx");
const landingAuthBridge = source("../../../landing-v20/src/components/CustomerAuth.tsx");

test("landing keeps dedicated CTAs locked while general auth can switch roles", () => {
  assert.match(hero, /Sign up \/ Sign in/);
  assert.match(hero, /onOpenAuth\("login"\)/);
  assert.match(hero, /onOrderFood/);
  assert.match(hero, /onBecomeChef\(\)/);
  assert.match(landing, /onOpenAuth=\{\(mode\) => openAuth\(mode, "customer", false\)\}/);
  assert.match(landing, /onOrderFood=\{\(\) => openAuth\("login", "customer", true\)\}/);
  assert.match(landing, /onBecomeChef=\{\(\) => openAuth\("register", "chef", true\)\}/);
  assert.match(landing, /lockAccountMode=\{authAccountLocked\}/);
});

test("committed landing v20 bundle includes the shared customer auth bridge", () => {
  const index = source("../../public/landing-v20/index.html");
  const scripts = Array.from(
    index.matchAll(/src="\/landing-v20\/assets\/([^"]+\.js)"/g),
    (match) => match[1],
  );
  assert.ok(scripts.length > 0, "landing v20 must load a compiled script");
  const bundle = scripts
    .map((filename) => source(`../../public/landing-v20/assets/${filename}`))
    .join("\n");
  assert.match(bundle, /\/landing-auth\/manifest\.json/);
  assert.match(bundle, /a\[href="#sign-in"\]/);
  assert.match(bundle, /aria-busy/);

  const builtScripts = readdirSync(
    new URL("../../public/landing-v20/assets/", import.meta.url),
  ).filter((filename) => filename.endsWith(".js"));
  assert.ok(
    builtScripts.some((filename) =>
      source(`../../public/landing-v20/assets/${filename}`).includes(
        "/landing-auth/manifest.json",
      ),
    ),
    "at least one committed landing bundle must contain the auth bridge",
  );
});

test("landing v20 auth bridge never blocks sign-in on stylesheet load events", () => {
  assert.match(landingAuthBridge, /\/landing-auth\/manifest\.json/);
  assert.match(landingAuthBridge, /style\.onerror = \(\) => \{ clearTimeout\(timer\); style\.remove\(\); resolve\(\); \}/);
  assert.doesNotMatch(landingAuthBridge, /new Promise<void>\(\(resolve, reject\)/);
});

test("general auth clearly identifies and switches between customer and home chef", () => {
  assert.match(authModal, /Choose your Craves role/);
  assert.match(authModal, /Customer sign in/);
  assert.match(authModal, /Home Chef sign in/);
  assert.match(authModal, /Create your customer account/);
  assert.match(authModal, /Join Craves as a Home Chef/);
  assert.match(authModal, /Order homemade food/);
  assert.match(authModal, /Cook and grow with Craves/);
  assert.match(authModal, /switchAccountMode\("customer"\)/);
  assert.match(authModal, /switchAccountMode\("chef"\)/);
  assert.match(authModal, /aria-pressed=\{accountMode === "customer"\}/);
  assert.match(authModal, /aria-pressed=\{accountMode === "chef"\}/);
});

test("selected auth role stays highlighted in the Craves logo red", () => {
  assert.match(landing, /\[&_\[aria-pressed=true\]\]:!bg-\[#F62E18\]/);
  assert.match(landing, /\[&_\[aria-pressed=true\]\]:!border-\[#F62E18\]/);
  assert.match(landing, /\[&_\[aria-pressed=true\]\]:!text-white/);
});

test("auth copy is customer and chef focused rather than implementation focused", () => {
  assert.match(authModal, /Your next homemade favourite is waiting/);
  assert.match(authModal, /Turn your passion for cooking into opportunity/);
  assert.match(authModal, /verification code is on its way/);
  assert.doesNotMatch(authModal, /Your phone is verified with Firebase/);
  assert.doesNotMatch(authModal, /session in secure HTTP-only cookies/);
  assert.doesNotMatch(authModal, /OTP sent securely through Firebase/);
});

test("landing auth modal keeps the glass backdrop with a pure white internal surface", () => {
  assert.match(landing, /data-auth-context=\{authAccountMode\}/);
  assert.match(landing, /backdrop-blur-xl/);
  assert.match(landing, /backdrop-blur-2xl/);
  assert.match(landing, /\[&_\[role=dialog\]\]:bg-white/);
  assert.doesNotMatch(landing, /\[&_\[role=dialog\]\]:bg-white\/80/);
  assert.doesNotMatch(landing, /\[&_\[role=dialog\]_fieldset\]:hidden/);
});
