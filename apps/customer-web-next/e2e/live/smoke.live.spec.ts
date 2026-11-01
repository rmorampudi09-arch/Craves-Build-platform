/**
 * Read-only smoke test against craves.in. Run after every release:
 *   CRAVES_LIVE=1 CRAVES_LIVE_STORAGE=./chef-state.json npx playwright test --project=live
 * chef-state.json is a Playwright storage state saved from a signed-in, approved test chef
 * (npx playwright open https://craves.in/chef/sign-in --save-storage=chef-state.json).
 * Nothing here clicks a button that writes data.
 */
import { test, expect } from "@playwright/test";

const storage = process.env.CRAVES_LIVE_STORAGE;

test("release answers and the chef sign-in illustration loads", async ({ page, request }) => {
  const version = await request.get("/api/version");
  expect(version.ok()).toBeTruthy();
  expect((await version.json()).commitSha).toMatch(/^[0-9a-f]{40}$/);

  await page.goto("/chef/sign-in");
  // A new device is asked for its language first (saved only in a cookie on this device).
  await expect(page.getByRole("heading", { level: 1, name: "Choose your language" })).toBeVisible();
  await page.getByRole("button", { name: /^English/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to your kitchen" })).toBeVisible();
  // Regression: on 12 Oct the optimised pack-delivery image answered 504 after 30 s.
  const hero = page.getByRole("img", { name: /home chef packing/i });
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 15_000 }).toBe(true);
});

test.describe("approved chef", () => {
  test.skip(!storage, "set CRAVES_LIVE_STORAGE to a signed-in approved chef's storage state");
  test.use({ storageState: storage });

  for (const [path, h1] of [
    ["/chef", /^Good (morning|afternoon|evening)/],
    ["/chef/orders", "Orders"],
    ["/chef/menu", "Menu"],
    ["/chef/earnings", "Earnings"],
    ["/chef/finance", "Balance & payouts"],
    ["/chef/bank", "Bank account"],
    ["/chef/statements", "Statements"],
    ["/chef/profile", "Profile"],
    ["/chef/kitchen", "Kitchen"],
    ["/chef/operations", "Can customers find you?"],
  ] as const) {
    test(`${path} opens without an error`, async ({ page }) => {
      const failures: string[] = [];
      page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) failures.push(`${r.status()} ${r.url()}`); });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("This page didn’t load")).toHaveCount(0);
      expect(failures).toEqual([]);
    });
  }
});
