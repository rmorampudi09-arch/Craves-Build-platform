/**
 * After approval: who gets in, navigation, first-run kitchen, menu form, money pages.
 * Mirrors what was checked by hand on craves.in for CRV-10021 on 12 Oct 2026.
 */
import { test, expect, rememberChefDevice, APP_ID, type FakeBackend } from "../support/backend";
import type { Page } from "@playwright/test";

async function openApprovedChef(page: Page, backend: FakeBackend, path = "/chef") {
  backend.approvedChef();
  // Home creates the kitchen on first open; other pages expect it to exist already.
  if (path !== "/chef") backend.kitchen = { id: "00000000-0000-4000-8000-000000000900", kitchenName: "E2E Test Kitchen", displayName: "E2E Chef", description: "Synthetic kitchen", phoneNumber: backend.identity.phoneNumber, email: backend.identity.email, addressLine1: "Flat 101", addressLine2: "KPHB Colony", landmark: null, areaName: "Kukatpally", city: "Hyderabad", state: "Telangana", postalCode: "500072", latitude: 17.4948, longitude: 78.4001, status: "INACTIVE", createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" };
  await rememberChefDevice(page);
  // The one-time "You're a Craves chef" sheet is covered by journey.spec.ts.
  await page.addInitScript((key) => localStorage.setItem(key, "seen"), `craves-chef-approved:${APP_ID}:2026-10-12T10:00:00.000Z`);
  await page.goto(path);
}

const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Chef primary navigation" }).or(page.getByRole("navigation", { name: "Chef workspace" })).locator("visible=true").first();

test("a pending applicant is kept out of the chef app", async ({ page, backend }) => {
  await rememberChefDevice(page);
  backend.completeDraft();
  backend.submitted = true;
  backend.application = { ...backend.application, id: APP_ID, status: "PENDING", submittedAt: "2026-10-12T09:00:00.000Z", referenceCode: "CRV-E2E01" };
  await page.goto("/chef/orders");
  await expect(page).toHaveURL(/\/chef\/application\/status$/);
  await expect(page.getByText("Chef tools open once your application is approved.")).toBeVisible();
});

test("a remembered device skips the OTP and opens the kitchen", async ({ page, backend }) => {
  await openApprovedChef(page, backend, "/chef/sign-in");
  await expect(page).toHaveURL(/\/chef$/);
  expect(backend.callsTo("POST", "/api/auth/otp/send")).toHaveLength(0);
});

test("approved but the CHEF role has not arrived yet: a clear wait state, not an OTP loop", async ({ page, backend }) => {
  backend.approvedChef();
  backend.identity.roles = ["CUSTOMER"]; // the role refresh still lacks CHEF
  await rememberChefDevice(page);
  await page.goto("/chef");
  await expect(page.getByText(/chef access is on its way/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("every tab opens its page and marks itself current", async ({ page, backend }) => {
  await openApprovedChef(page, backend);
  for (const [tab, url, heading] of [
    ["Orders", /\/chef\/orders$/, "Orders"],
    ["Menu", /\/chef\/menu$/, "Menu"],
    ["Earnings", /\/chef\/earnings$/, "Earnings"],
    ["Profile", /\/chef\/profile$/, "Profile"],
    ["Home", /\/chef$/, /^Good (morning|afternoon|evening)/],
  ] as const) {
    await nav(page).getByRole("link", { name: tab }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
  }
});

test("the kitchen is created once on first open, not on every visit", async ({ page, backend }) => {
  await openApprovedChef(page, backend);
  await expect(page.getByRole("switch", { name: "Taking orders" })).toBeVisible();
  await expect.poll(() => backend.callsTo("PUT", "/api/chef/kitchen").length).toBe(1);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Taking orders" })).toBeVisible();
  expect(backend.callsTo("PUT", "/api/chef/kitchen")).toHaveLength(1);
});

test("BUG: the kitchen can be opened with no dishes and says customers can order", async ({ page, backend }) => {
  test.fail(true, "P2: live 12 Oct the switch turned on with 0 dishes ('Customers can order now'); readiness page says a dish is required");
  await openApprovedChef(page, backend);
  const kitchen = page.getByRole("region", { name: /^(Open|Closed|Paused)\b/ });
  await kitchen.getByRole("switch", { name: "Taking orders" }).click();
  // No optimistic toggle: the switch stays off while the save runs, so read it only once the region stops being busy.
  await expect(kitchen).not.toHaveAttribute("aria-busy", "true");
  await expect(kitchen.getByRole("switch", { name: "Taking orders" })).not.toBeChecked();
  await expect(page.getByText("Customers can order now.")).toHaveCount(0);
});

test.describe("Add a dish", () => {
  test.beforeEach(async ({ page, backend }) => {
    await openApprovedChef(page, backend, "/chef/menu");
    await page.getByRole("button", { name: "Add dish" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Add a dish" })).toBeVisible();
  });

  test("empty save explains every required field and focuses the first", async ({ page, backend }) => {
    await page.getByRole("button", { name: "Save dish" }).click();
    for (const message of ["Give your dish a name.", "Choose a category, or type your own.", "Choose Veg, Non-veg or Egg.", "Enter a price greater than zero, with up to two decimal places.", "Enter the packed weight in grams."]) {
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("textbox", { name: "Dish name" })).toBeFocused();
    expect(backend.calls.filter((c) => c.method === "POST" && c.path.startsWith("/api/chef/menu"))).toEqual([]);
  });

  test("price allows two decimals at most and packed weight must be at least 1 g", async ({ page }) => {
    await page.getByRole("textbox", { name: "Price" }).fill("12.345");
    await page.getByRole("textbox", { name: "Packed weight (grams)" }).fill("0");
    await page.getByRole("button", { name: "Save dish" }).click();
    await expect(page.getByText("Enter a price greater than zero, with up to two decimal places.")).toBeVisible();
    await expect(page.getByText("Packed weight must be a whole number from 1 to 100,000.")).toBeVisible();
  });

  test("leaving a half-filled dish asks first, and Keep editing keeps the text", async ({ page }) => {
    await page.getByRole("textbox", { name: "Dish name" }).fill("E2E dal");
    await page.getByRole("button", { name: "Cancel" }).click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Discard this dish?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByRole("textbox", { name: "Dish name" })).toHaveValue("E2E dal");
    await page.getByRole("button", { name: "Cancel" }).click();
    await dialog.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();
  });
});

test("Statements: a failed PDF request shows an error and keeps the form usable", async ({ page, backend }) => {
  await openApprovedChef(page, backend, "/chef/statements");
  backend.fail("POST", "/api/documents", 400);
  await page.getByRole("button", { name: "Make PDF" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Ref:/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Make PDF" })).toBeEnabled();
});

test("a new chef with no bank account is asked to add one, not told payouts are on hold", async ({ page, backend }) => {
  await openApprovedChef(page, backend, "/chef/finance");
  await expect(page.getByRole("heading", { level: 1, name: "Balance & payouts" })).toBeVisible();
  // The heading renders before the balance; wait for it, or the count below passes on a page that hasn't loaded.
  await expect(page.getByRole("region", { name: "Money you can take out" }).getByRole("button", { name: /^Withdraw ₹/ })).toBeVisible();
  await expect(page.getByText(/payouts are on hold/i)).toHaveCount(0);
  await expect(page.getByText("Add your bank account to get paid.").first()).toBeVisible();
});

test("Bank account: holder name is locked to the approved chef name", async ({ page, backend }) => {
  await openApprovedChef(page, backend, "/chef/bank");
  const holder = page.getByRole("textbox", { name: /Account holder/ });
  await expect(holder).toHaveValue("E2E Chef");
  await expect(holder).not.toBeEditable();
});
