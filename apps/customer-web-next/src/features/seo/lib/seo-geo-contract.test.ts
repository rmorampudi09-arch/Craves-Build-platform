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

test("FAQ schema matches the FAQ rendered on the page and nearby areas stay local", async () => {
  const { launchCities, localFaq, nearbyAreas, cityStructuredData } = await import("./seo-craves.ts");
  const hyderabad = launchCities[0];
  const graph = cityStructuredData(hyderabad, undefined, "Kukatpally")["@graph"];
  const faqNode = graph.find((node: { "@type": string }) => node["@type"] === "FAQPage") as {
    mainEntity: { name: string }[];
  };
  assert.deepEqual(
    faqNode.mainEntity.map((q) => q.name),
    localFaq(hyderabad, undefined, "Kukatpally").map((q) => q.question),
  );
  assert.match(source("../components/LocalDiscoveryPage.tsx"), /localFaq\(/);

  for (const area of [hyderabad.neighborhoods[0], "Kukatpally", hyderabad.neighborhoods.at(-1)!]) {
    const nearby = nearbyAreas(hyderabad, area);
    assert.equal(nearby.length, 6, area);
    assert.ok(!nearby.includes(area));
  }
});

test("static homepage ships SEO head and crawlable content", () => {
  const landing = source("../../../../public/landing-v20/index.html");
  assert.match(landing, /<link rel="canonical" href="https:\/\/craves\.in\/"/);
  assert.match(landing, /property="og:image" content="https:\/\/craves\.in\/opengraph-image"/);
  assert.match(landing, /"@id":"https:\/\/craves\.in\/#organization"/);
  assert.match(landing, /<div id="root">.*<h1>.*href="\/hyderabad\/gachibowli"/s);
});

test("ai search crawler files advertise Craves facts without exposing private routes", () => {
  const robots = source("../../../../public/robots.txt");
  const llms = source("../../../../public/llms.txt");

  assert.match(robots, /User-agent: OAI-SearchBot/);
  assert.match(robots, /User-agent: ChatGPT-User/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/checkout/);
  assert.match(robots, /Disallow: \/admin/);
  assert.doesNotMatch(robots, /Disallow: \/chefs/);
  assert.match(robots, /Sitemap: https:\/\/craves\.in\/sitemap\.xml/);
  assert.match(llms, /Hyderabad/);
  assert.match(llms, /Bangalore/);
  assert.match(llms, /homemade food marketplace/i);
  assert.match(llms, /\/hyderabad\/biryani/);
  assert.match(llms, /\/hyderabad\/gachibowli/);
});
