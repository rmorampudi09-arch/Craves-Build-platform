import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("customer web exposes the exact running Git commit without caching", () => {
  const route = source("../app/api/version/route.ts");
  assert.match(route, /process\.env\.CRAVES_BUILD_SHA/);
  assert.match(route, /\^\[0-9a-f\]\{40\}\$/i);
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
});

test("deployment shifts Container Apps traffic and verifies the public commit", () => {
  const pipeline = source(
    "../../../../azure-pipelines-customer-web-next-delivery-tracking.yml",
  );

  assert.match(pipeline, /activeRevisionsMode/);
  assert.match(pipeline, /az containerapp ingress traffic set/);
  assert.match(pipeline, /--revision-weight "\$NEW_REVISION=100"/);
  assert.match(pipeline, /CRAVES_BUILD_SHA="\$EXPECTED_SHA"/);
  assert.match(pipeline, /\/api\/version\?release=\$EXPECTED_SHA/);
  assert.match(pipeline, /"\$LIVE_SHA" == "\$EXPECTED_SHA"/);
  assert.match(pipeline, /Secure Craves access/);
  assert.match(pipeline, /ROLLBACK_TRAFFIC_B64/);
});

test("customer and chef pages are not edge cached across web releases", () => {
  const config = source("../../next.config.ts");

  assert.match(config, /chef\|chefs\|home\|discover\|cart\|checkout\|orders/);
  assert.match(config, /profile\|subscriptions\|tracking\|wishlist\|sign-in/);
  assert.match(config, /private, no-store, no-cache, max-age=0, must-revalidate/);
});

test("seo sitemap is published and advertised to crawlers", () => {
  const sitemapRoute = source("../app/sitemap.ts");
  const robots = source("../../public/robots.txt");

  assert.match(sitemapRoute, /https:\/\/craves\.in/);
  assert.match(sitemapRoute, /\/subscriptions\/plans/);
  assert.match(robots, /Sitemap: https:\/\/craves\.in\/sitemap\.xml/);
});

test("home first load keeps non-critical sections out of the initial bundle", () => {
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");

  assert.match(home, /from "next\/dynamic"/);
  assert.match(home, /const HomeBottomSections = dynamic/);
  assert.match(home, /const HomeSearchOverlay = dynamic/);
  assert.doesNotMatch(
    home,
    /import \{ HomeBottomSections \} from "@\/components\/home\/HomeBottomSections"/,
  );
});
