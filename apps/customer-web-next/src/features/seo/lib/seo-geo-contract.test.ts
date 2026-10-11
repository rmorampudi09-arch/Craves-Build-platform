import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("seo discovery covers Hyderabad, Bangalore and major food intents", () => {
  const seo = source("./seo-craves.ts");
  const sitemap = source("../../../app/sitemap.ts");
  const cityPage = source("../../../app/[city]/page.tsx");
  const cityFoodPage = source("../../../app/[city]/[food]/page.tsx");
  const foodPage = source("../../../app/food/[food]/page.tsx");

  assert.match(seo, /slug: "hyderabad"/);
  assert.match(seo, /slug: "bangalore"/);
  assert.match(seo, /Bangalore and Bengaluru/);
  assert.match(seo, /slug: "biryani"/);
  assert.match(seo, /slug: "homemade-food"/);
  assert.match(seo, /SearchAction/);
  assert.match(seo, /Restaurant/);
  assert.match(seo, /FAQPage/);
  assert.match(sitemap, /cityFoodUrl/);
  assert.match(cityPage, /generateStaticParams/);
  assert.match(cityFoodPage, /foodIntents/);
  assert.match(foodPage, /launchCities/);
});

test("every neighborhood has its own page slug that never collides with a food slug", async () => {
  const { launchCities, foodIntents, areaSlug } = await import("./seo-craves.ts");
  const foodSlugs = new Set(foodIntents.map((food) => food.slug));
  for (const city of launchCities) {
    const slugs = city.neighborhoods.map(areaSlug);
    assert.equal(new Set(slugs).size, slugs.length, `duplicate area in ${city.slug}`);
    for (const slug of slugs) {
      assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.ok(!foodSlugs.has(slug), `area slug ${slug} collides with a food slug`);
    }
  }
  assert.ok(launchCities[0].neighborhoods.includes("Kukatpally"));
});

test("ai search crawler files advertise Craves facts without exposing private routes", () => {
  const robots = source("../../../../public/robots.txt");
  const llms = source("../../../../public/llms.txt");

  assert.match(robots, /User-agent: OAI-SearchBot/);
  assert.match(robots, /User-agent: ChatGPT-User/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/craves\.in\/sitemap\.xml/);
  assert.match(llms, /Hyderabad/);
  assert.match(llms, /Bangalore/);
  assert.match(llms, /homemade food marketplace/i);
  assert.match(llms, /\/hyderabad\/biryani/);
  assert.match(llms, /\/hyderabad\/gachibowli/);
});
