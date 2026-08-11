import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("approved landing reference uses the canonical Craves logo", () => {
  const hero = source(
    "../components/sections/landing-reference/ReferenceHeroDesktop.tsx",
  );

  assert.match(
    hero,
    /import \{ CravesLogo \} from "@\/components\/brand\/CravesLogo"/,
  );
  assert.match(hero, /<CravesLogo/);
  assert.match(hero, /src="\/landing\/reference\/hero-reference\.png"/);
});

test("approved landing reference uses the three supplied desktop sections", () => {
  const artwork = source(
    "../components/sections/landing-reference/ReferenceArtworkSection.tsx",
  );

  assert.match(
    artwork,
    /\/landing\/reference\/how-craves-works-reference\.png/,
  );
  assert.match(artwork, /\/landing\/reference\/why-craves-reference\.png/);
  assert.match(
    artwork,
    /\/landing\/reference\/home-chefs-app-reference\.png/,
  );
});

test("approved landing reference keeps the existing responsive landing below desktop", () => {
  const landing = source("../screens/public/LandingPage/LandingPage.tsx");

  assert.match(landing, /<ReferenceHeroDesktop/);
  assert.match(landing, /<ReferenceArtworkSection variant="how"/);
  assert.match(landing, /<ReferenceArtworkSection variant="why"/);
  assert.match(landing, /<ReferenceArtworkSection variant="chefs-app"/);
  assert.match(landing, /className="lg:hidden"/);
});

test("approved landing reference is vendored and verified without a network dependency", () => {
  const script = source("../../scripts/extract-landing-reference-assets.mjs");

  assert.match(script, /readFile/);
  assert.doesNotMatch(script, /https?:\/\//);
  assert.doesNotMatch(script, /\bfetch\s*\(/);

  assert.match(script, /hero-reference\.png/);
  assert.match(script, /how-craves-works-reference\.png/);
  assert.match(script, /why-craves-reference\.png/);
  assert.match(script, /home-chefs-app-reference\.png/);

  assert.match(
    script,
    /51d8f9f7e8fa852fcf0db35f1b52a6b8303e0ea869fb890855cb35156fa68655/,
  );
  assert.match(
    script,
    /3e149fda7da24782a129bacdad7d652aae07358e90fd15182ccdf9730aff4796/,
  );
  assert.match(
    script,
    /94592a5ac7a5ed5d4466e8ab6104bae0a062f6fb870eafb786ee36692d56f400/,
  );
  assert.match(
    script,
    /b3331ae6d53b85ba5face0383b82e25420527e208fcedee36c04a12eb19aa9bd/,
  );
});
