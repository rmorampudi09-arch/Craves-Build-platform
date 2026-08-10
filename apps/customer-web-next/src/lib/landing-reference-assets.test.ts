import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(resolve(appRoot, path), "utf8");
}

describe("approved landing reference integration", () => {
  it("uses the canonical Craves logo instead of changing the logo asset", async () => {
    const hero = await source(
      "src/components/sections/landing-reference/ReferenceHeroDesktop.tsx",
    );
    expect(hero).toContain('import { CravesLogo } from "@/components/brand/CravesLogo"');
    expect(hero).toContain("<CravesLogo");
    expect(hero).toContain('src="/landing/reference/hero-reference.png"');
  });

  it("uses the three supplied desktop reference sections", async () => {
    const artwork = await source(
      "src/components/sections/landing-reference/ReferenceArtworkSection.tsx",
    );
    expect(artwork).toContain("/landing/reference/how-craves-works-reference.png");
    expect(artwork).toContain("/landing/reference/why-craves-reference.png");
    expect(artwork).toContain("/landing/reference/home-chefs-app-reference.png");
  });

  it("keeps the existing responsive landing experience below desktop", async () => {
    const landing = await source(
      "src/screens/public/LandingPage/LandingPage.tsx",
    );
    expect(landing).toContain("<ReferenceHeroDesktop");
    expect(landing).toContain('<ReferenceArtworkSection variant="how"');
    expect(landing).toContain('<ReferenceArtworkSection variant="why"');
    expect(landing).toContain('<ReferenceArtworkSection variant="chefs-app"');
    expect(landing).toContain('className="lg:hidden"');
  });

  it("pins the four approved PNG hashes in the build preparation script", async () => {
    const script = await source("scripts/extract-landing-reference-assets.mjs");
    expect(script).toContain("51d8f9f7e8fa852fcf0db35f1b52a6b8303e0ea869fb890855cb35156fa68655");
    expect(script).toContain("3e149fda7da24782a129bacdad7d652aae07358e90fd15182ccdf9730aff4796");
    expect(script).toContain("94592a5ac7a5ed5d4466e8ab6104bae0a062f6fb870eafb786ee36692d56f400");
    expect(script).toContain("b3331ae6d53b85ba5face0383b82e25420527e208fcedee36c04a12eb19aa9bd");
  });
});
