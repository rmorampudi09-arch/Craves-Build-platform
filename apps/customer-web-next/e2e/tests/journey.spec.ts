/**
 * Golden path, regression-locked: new number → OTP → application (every section) →
 * submit → pending status → admin approves → chef app opens without a second OTP.
 */
import { test, expect, PHONE, type FakeBackend } from "../support/backend";
import type { Page } from "@playwright/test";

const PNG = { name: "kitchen.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
const save = (page: Page) => page.getByRole("button", { name: "Save and continue" });

async function signInWithOtp(page: Page) {
  await page.goto("/chef/sign-in");
  await page.getByLabel("Mobile number").fill(PHONE);
  await page.getByRole("button", { name: "Send OTP" }).click();
  // The sixth digit submits by itself; no Verify click needed.
  await page.getByLabel("Six-digit OTP").pressSequentially("123456");
}

async function basicDetails(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Basic details" })).toBeVisible();
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("E2E Chef");
  await page.getByRole("button", { name: /^Date of birth/ }).click();
  await page.getByRole("button", { name: "1990", exact: true }).click();
  await page.getByRole("button", { name: "June 1990" }).click();
  await page.getByRole("button", { name: "15 June 1990" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await save(page).click();
}

async function kitchen(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Your kitchen" })).toBeVisible();
  await expect(page).toHaveURL(/step=kitchen/);
  await page.getByRole("textbox", { name: "Kitchen name", exact: true }).fill("E2E Test Kitchen");
  await page.getByRole("searchbox", { name: "Search location" }).fill("KPHB Colony");
  await page.getByRole("button", { name: "Search address" }).click();
  await page.getByRole("button", { name: /KPHB Colony Bus Stop/ }).click();
  // Reverse geocode fills PIN, city and state from the pin.
  await expect(page.getByRole("textbox", { name: "PIN code", exact: true })).toHaveValue("500072");
  await expect(page.getByRole("textbox", { name: "City", exact: true })).toHaveValue("Hyderabad");
  await page.getByRole("textbox", { name: "Flat / house number / building", exact: true }).fill("Flat 101");
  await page.locator('input[type=file][aria-label="Overall kitchen photo"]').setInputFiles(PNG);
  await expect(page.getByRole("button", { name: "Remove overall kitchen photo" })).toBeVisible();
  await page.locator('input[type=file][aria-label="Cooking setup photo"]').setInputFiles(PNG);
  await expect(page.getByRole("button", { name: "Remove cooking setup photo" })).toBeVisible();
  await save(page).click();
}

async function fssai(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "FSSAI details" })).toBeVisible();
  await page.getByRole("textbox", { name: "FSSAI registration number", exact: true }).fill("12345678901234");
  await save(page).click();
}

async function identity(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Identity verification" })).toBeVisible();
  await page.getByText("PAN card", { exact: true }).click();
  await page.locator('input[type=file][aria-label="PAN card"]').setInputFiles({ ...PNG, name: "pan.png" });
  await expect(page.getByRole("button", { name: /Remove PAN card/i })).toBeVisible();
  await save(page).click();
}

async function reviewAndSubmit(page: Page, backend: FakeBackend) {
  await expect(page.getByRole("heading", { level: 1, name: "Review your application" })).toBeVisible();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Accept the terms before submitting your application.")).toBeVisible();
  expect(backend.callsTo("POST", "/api/chef/onboarding/submit")).toHaveLength(0);
  await page.getByRole("checkbox", { name: /Craves Chef Terms/ }).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page).toHaveURL(/\/chef\/application\/status$/);
}

test("new chef applies, is approved, and lands in the chef app", async ({ page, backend }) => {
  await signInWithOtp(page);
  await expect(page).toHaveURL(/\/chef\/application/);
  await basicDetails(page);
  await kitchen(page);
  await fssai(page);
  await identity(page);
  await reviewAndSubmit(page, backend);

  // Pending: no chef tools yet.
  await expect(page.getByRole("heading", { level: 1, name: "Your application" })).toBeVisible();
  await expect(page.getByText("Chef tools open once your application is approved.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Chef primary navigation" })).toHaveCount(0);

  // Admin approves; the chef refreshes the status.
  backend.approve();
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open your kitchen" }).click();

  // Role refresh adds CHEF without a second OTP; the welcome sheet offers the first dish.
  await expect(page).toHaveURL(/\/chef$/);
  await expect(page.getByRole("dialog", { name: "You’re a Craves chef" })).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), E2E/ })).toBeVisible();
  expect(backend.callsTo("POST", "/api/auth/otp/send")).toHaveLength(1);

  // What the chef submitted is what the server stored.
  expect(backend.details).toMatchObject({ firstName: "E2E", lastName: "Chef", dateOfBirth: "1990-06-15", kitchenName: "E2E Test Kitchen", postalCode: "500072", fssaiNumber: "12345678901234", proofKind: "PAN" });
});

test("a wrong OTP is rejected and the slots clear for another try", async ({ page, backend }) => {
  await page.goto("/chef/sign-in");
  await page.getByLabel("Mobile number").fill(PHONE);
  await page.getByRole("button", { name: "Send OTP" }).click();
  await page.getByLabel("Six-digit OTP").pressSequentially("000000");
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /code|OTP/i }).first()).toBeVisible();
  await expect(page.getByLabel("Six-digit OTP")).toHaveValue("");
  expect(backend.signedIn).toBe(false);
});

test("sign-in rejects a number that is not an Indian mobile", async ({ page, backend }) => {
  await page.goto("/chef/sign-in");
  await page.getByLabel("Mobile number").fill("1234567890");
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByLabel("Mobile number")).toHaveAttribute("aria-invalid", "true");
  expect(backend.callsTo("POST", "/api/auth/otp/send")).toHaveLength(0);
});
