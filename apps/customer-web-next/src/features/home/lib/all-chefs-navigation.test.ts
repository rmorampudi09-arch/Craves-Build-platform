import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile Chefs navigation opens the dedicated all-chefs page", () => {
  const nav = source("../../customer-shell/components/BottomNav.tsx");
  const route = source("../../../app/chefs/page.tsx");
  const page = source("../../chefs/screens/AllChefs.tsx");
  const returnNavigation = source("../../../shared/lib/return-navigation.ts");

  assert.match(nav, /href: "\/chefs"/);
  assert.match(nav, /pathname === "\/chefs"/);
  assert.doesNotMatch(nav, /home#nearby-kitchens-heading/);
  assert.match(route, /AllChefsPage/);
  assert.match(page, /discoverKitchens\(/);
  assert.match(page, /DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(page, /loadSelectedAddress\(\)/);
  assert.match(page, /<KitchensGrid/);
  assert.match(page, /returnPath="\/chefs"/);
  assert.match(page, /rememberReturnRoute\("\/addresses", "\/chefs"\)/);
  assert.match(returnNavigation, /\| "\/chefs"/);
  assert.match(returnNavigation, /value === "\/chefs"/);
});

test("delivery location control uses the compact Swiggy-Zomato style address button", () => {
  const header = source("../components/BrowseHeader.tsx");

  assert.match(header, /data-craves-location-button="mobile"/);
  assert.match(header, /rounded-\[1\.1rem\] border px-2\.5/);
  // White header: a bordered white card; Home's red top: bare white text on the red.
  assert.match(header, /"border-\[#E5E7EB\] !bg-white !text-\[#1A1A1A\] shadow-\[0_4px_16px_rgba\(26,26,26,0\.07\)\]"/);
  assert.match(header, /red \? "border-transparent bg-transparent px-0 text-white"/);
  assert.match(header, /<FaMapMarkerAlt/);
  assert.match(header, /<ChevronDown/);
  assert.match(header, /\{locationTypeLabel\}/);
  assert.match(header, /\{locationLabel\}/);
});
