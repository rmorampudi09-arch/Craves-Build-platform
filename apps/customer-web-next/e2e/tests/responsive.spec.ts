/**
 * Layout matrix (projects small-320, layout-375, tablet-768, layout-1440): every screen of
 * the chef journey renders its heading with no sideways scroll, and a screenshot is
 * attached to the report for visual review (not a pixel diff, so it cannot flake).
 */
import { test, expect, rememberChefDevice, APP_ID, type FakeBackend } from "../support/backend";
import type { Page } from "@playwright/test";

type Screen = { name: string; path: string; h1: string | RegExp; setup: (b: FakeBackend) => void };
const draft = (b: FakeBackend) => b.completeDraft();
const approved = (b: FakeBackend) => {
  b.approvedChef();
  b.kitchen = { id: "00000000-0000-4000-8000-000000000900", kitchenName: "E2E Test Kitchen", displayName: "E2E Chef", description: "Synthetic kitchen", phoneNumber: b.identity.phoneNumber, email: b.identity.email, addressLine1: "Flat 101", addressLine2: "KPHB Colony", landmark: null, areaName: "Kukatpally", city: "Hyderabad", state: "Telangana", postalCode: "500072", latitude: 17.4948, longitude: 78.4001, status: "INACTIVE", createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" };
};

const screens: Screen[] = [
  { name: "sign-in", path: "/chef/sign-in", h1: "Sign in to your kitchen", setup: () => {} },
  { name: "basic-details", path: "/chef/application?step=personal", h1: "Basic details", setup: draft },
  { name: "kitchen", path: "/chef/application?step=kitchen", h1: "Your kitchen", setup: draft },
  { name: "fssai", path: "/chef/application?step=fssai", h1: "FSSAI details", setup: draft },
  { name: "identity", path: "/chef/application?step=documents", h1: "Identity verification", setup: draft },
  { name: "review", path: "/chef/application?step=review", h1: "Review your application", setup: draft },
  { name: "status-approved", path: "/chef/application/status", h1: "Your application", setup: approved },
  { name: "home", path: "/chef", h1: /^Good (morning|afternoon|evening)/, setup: approved },
  { name: "orders", path: "/chef/orders", h1: "Orders", setup: approved },
  { name: "menu", path: "/chef/menu", h1: "Menu", setup: approved },
  { name: "earnings", path: "/chef/earnings", h1: "Earnings", setup: approved },
  { name: "finance", path: "/chef/finance", h1: "Balance & payouts", setup: approved },
  { name: "bank", path: "/chef/bank", h1: "Bank account", setup: approved },
  { name: "statements", path: "/chef/statements", h1: "Statements", setup: approved },
  { name: "more", path: "/chef/profile", h1: "Profile", setup: approved },
  { name: "kitchen-details", path: "/chef/kitchen", h1: "Kitchen", setup: approved },
  { name: "readiness", path: "/chef/operations", h1: "Can customers find you?", setup: approved },
];

async function noSidewaysScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, "page must not scroll sideways").toBeLessThanOrEqual(innerWidth);
}

for (const screen of screens) {
  test(`${screen.name} fits the screen`, async ({ page, backend }, testInfo) => {
    screen.setup(backend);
    if (screen.name !== "sign-in") await rememberChefDevice(page);
    await page.addInitScript((key) => localStorage.setItem(key, "seen"), `craves-chef-approved:${APP_ID}:2026-10-12T10:00:00.000Z`);
    await page.goto(screen.path);
    await expect(page.getByRole("heading", { level: 1, name: screen.h1 })).toBeVisible();
    await noSidewaysScroll(page);
    // The main call to action must be a comfortable touch target on phones.
    const primary = page.getByRole("button", { name: /^(Send OTP|Save and continue|Submit application|Add dish|Make PDF)$/ }).first();
    if ((testInfo.project.use.viewport?.width ?? 1440) < 768 && (await primary.count())) {
      const box = await primary.boundingBox();
      expect(box?.height ?? 0, "primary button height").toBeGreaterThanOrEqual(44);
    }
    await testInfo.attach(`${screen.name}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}
