/**
 * Each application step on its own: validation, persistence and the bugs found on
 * craves.in on 12 Oct 2026. Known bugs use test.fail(): they pass while the bug exists
 * and turn red once it is fixed, so the marker gets removed with the fix.
 */
import { test, expect, rememberChefDevice, type FakeBackend } from "../support/backend";
import type { Page } from "@playwright/test";

const PNG = { name: "kitchen.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
const box = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const save = (page: Page) => page.getByRole("button", { name: "Save and continue" });

async function pickDob(page: Page, year: number, month: string, day: number) {
  await page.getByRole("button", { name: /^Date of birth/ }).click();
  await page.getByRole("button", { name: String(year), exact: true }).click();
  await page.getByRole("button", { name: `${month} ${year}` }).click();
  await page.getByRole("button", { name: `${day} ${month} ${year}` }).click();
  await page.getByRole("button", { name: "Done" }).click();
}

/** Signed-in applicant who has finished every section up to (not including) `step`. */
async function draftUpTo(page: Page, backend: FakeBackend, step: "personal" | "kitchen" | "fssai" | "documents") {
  await rememberChefDevice(page);
  backend.completeDraft();
  const d = backend.details as Record<string, unknown>;
  if (step === "personal") Object.assign(d, { firstName: "", lastName: "", dateOfBirth: "" });
  if (step === "personal" || step === "kitchen") {
    Object.assign(d, { kitchenName: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", latitude: null, longitude: null });
    backend.documents = backend.documents.filter((x) => !String(x.documentType).startsWith("KITCHEN"));
  }
  if (step !== "documents") d.fssaiNumber = "";
  d.proofKind = null;
  backend.documents = backend.documents.filter((x) => !String(x.documentType).startsWith("SELECTED_PROOF"));
}

test.describe("Basic details", () => {
  test.beforeEach(async ({ page, backend }) => {
    await draftUpTo(page, backend, "personal");
    await page.goto("/chef/application?step=personal");
    await expect(page.getByRole("heading", { level: 1, name: "Basic details" })).toBeVisible();
  });

  test("empty save focuses the name error and sends nothing", async ({ page, backend }) => {
    const before = backend.calls.length;
    await save(page).click();
    await expect(page.getByText("Enter your full name, including your first and last name.")).toBeVisible();
    await expect(box(page, "Full name")).toBeFocused();
    await expect(box(page, "Full name")).toHaveAttribute("aria-invalid", "true");
    expect(backend.calls.slice(before).filter((c) => c.method !== "GET")).toEqual([]);
  });

  test("UX: missing fields are reported one at a time (Kitchen reports all at once)", async ({ page }) => {
    test.fail(true, "Basic details flags only the first empty field per save (P3, inconsistent with Your kitchen)");
    await save(page).click();
    await expect(page.getByText("Enter your full name, including your first and last name.")).toBeVisible();
    await expect(page.getByText("Enter a valid date of birth.")).toBeVisible({ timeout: 2_000 });
  });

  test("a single name is not enough", async ({ page }) => {
    await box(page, "Full name").fill("Chef");
    await save(page).click();
    await expect(page.getByText("Enter your full name, including your first and last name.")).toBeVisible();
  });

  test("date of birth allows exactly 18 years and no less", async ({ page }) => {
    await page.getByRole("button", { name: /^Date of birth/ }).click();
    await page.getByRole("button", { name: "2008", exact: true }).click();
    await expect(page.getByRole("button", { name: "November 2008" })).toBeDisabled();
    await page.getByRole("button", { name: "October 2008" }).click();
    await expect(page.getByRole("button", { name: "12 October 2008" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "13 October 2008" })).toBeDisabled();
  });

  test("BUG: digits in the name are accepted although it must match the bank name", async ({ page, backend }) => {
    test.fail(true, "Live 12 Oct: 'Qa Test Chef 123' passes validation (P2)");
    await box(page, "Full name").fill("E2E Chef 123");
    await pickDob(page, 1990, "June", 15);
    await save(page).click();
    await expect(box(page, "Full name")).toHaveAttribute("aria-invalid", "true");
    expect(backend.callsTo("PUT", "/api/chef/onboarding")).toHaveLength(0);
  });
});

test("an unverified email blocks saving Basic details", async ({ page, backend }) => {
  await draftUpTo(page, backend, "personal");
  backend.identity.emailVerified = false;
  await page.goto("/chef/application?step=personal");
  await box(page, "Full name").fill("E2E Chef");
  await pickDob(page, 1990, "June", 15);
  await save(page).click();
  await expect(page.getByText("Verify your email address before saving these details.")).toBeVisible();
  expect(backend.callsTo("PUT", "/api/chef/onboarding")).toHaveLength(0);
});

test.describe("Your kitchen", () => {
  test.beforeEach(async ({ page, backend }) => {
    await draftUpTo(page, backend, "kitchen");
    await page.goto("/chef/application?step=kitchen");
    await expect(page.getByRole("heading", { level: 1, name: "Your kitchen" })).toBeVisible();
  });

  test("empty save lists every missing field at once", async ({ page }) => {
    await save(page).click();
    for (const message of ["Add your kitchen name.", "Add your flat, house number or building.", "Enter a six-digit PIN code.", "Add your city.", "Add your state."]) {
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }
    await expect(box(page, "Kitchen name")).toBeFocused();
  });

  test("address search fills the pin, PIN, city and state; a reload keeps everything", async ({ page, backend }) => {
    await box(page, "Kitchen name").fill("E2E Test Kitchen");
    await page.getByRole("searchbox", { name: "Search location" }).fill("KPHB");
    await page.getByRole("button", { name: "Search address" }).click();
    await page.getByRole("button", { name: /KPHB Colony Bus Stop/ }).click();
    await expect(box(page, "PIN code")).toHaveValue("500072");
    await expect(box(page, "State")).toHaveValue("Telangana");
    await box(page, "Flat / house number / building").fill("Flat 101");
    await page.locator('input[type=file][aria-label="Overall kitchen photo"]').setInputFiles(PNG);
    await expect(page.getByRole("button", { name: "Remove overall kitchen photo" })).toBeVisible();
    expect(backend.details).toMatchObject({ kitchenName: "E2E Test Kitchen", postalCode: "500072", latitude: 17.4948 });

    await page.reload();
    await expect(box(page, "Kitchen name")).toHaveValue("E2E Test Kitchen");
    await expect(box(page, "Flat / house number / building")).toHaveValue("Flat 101");
    await expect(page.getByRole("button", { name: "Remove overall kitchen photo" })).toBeVisible();
  });

  test("a GIF and a file over 10 MB are refused before any upload", async ({ page, backend }) => {
    await box(page, "Kitchen name").fill("E2E Test Kitchen");
    await page.getByRole("searchbox", { name: "Search location" }).fill("KPHB");
    await page.getByRole("button", { name: "Search address" }).click();
    await page.getByRole("button", { name: /KPHB Colony Bus Stop/ }).click();
    await box(page, "Flat / house number / building").fill("Flat 101");
    await expect(box(page, "PIN code")).toHaveValue("500072");
    const input = page.locator('input[type=file][aria-label="Overall kitchen photo"]');
    await input.setInputFiles({ name: "k.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await expect(page.getByText("Choose a JPG, PNG, HEIC or WebP photo.")).toBeVisible();
    await input.setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(page.getByText("Choose a file up to 10 MB.")).toBeVisible();
    expect(backend.callsTo("POST", "/api/chef/application/proof-files")).toHaveLength(0);
  });

  test("BUG: a PIN pasted with a space loses its last digit", async ({ page }) => {
    test.fail(true, "maxLength=6 truncates '500 072' to '500 07' before digits are kept (P2)");
    await box(page, "PIN code").fill("500 072");
    await expect(box(page, "PIN code")).toHaveValue("500072");
  });

  test("each photo slot is a labelled region with a named Add photo button", async ({ page }) => {
    for (const slot of ["Overall kitchen photo", "Cooking setup photo"]) {
      await expect(page.getByRole("region", { name: slot }).getByRole("button", { name: /^Add photo/ })).toBeVisible();
    }
  });
});

test.describe("FSSAI", () => {
  test.beforeEach(async ({ page, backend }) => {
    await draftUpTo(page, backend, "fssai");
    await page.goto("/chef/application?step=fssai");
    await expect(page.getByRole("heading", { level: 1, name: "FSSAI details" })).toBeVisible();
  });

  test("13 digits are not a registration number", async ({ page, backend }) => {
    await box(page, "FSSAI registration number").fill("1234567890123");
    await save(page).click();
    await expect(page.getByText(/14-digit FSSAI/).first()).toBeVisible();
    expect(backend.callsTo("PUT", "/api/chef/onboarding")).toHaveLength(0);
  });

  test("a chef without FSSAI can continue from the help view and is told to add it before submitting", async ({ page }) => {
    await page.getByRole("button", { name: "Don’t have FSSAI?" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "How to apply for FSSAI" })).toBeVisible();
    await expect(page.getByText("Add your FSSAI number before you submit your application.")).toBeVisible();
    await save(page).click();
    await expect(page.getByRole("heading", { level: 1, name: "Identity verification" })).toBeVisible();
  });

  test("BUG: a spaced FSSAI number from the certificate loses digits", async ({ page }) => {
    test.fail(true, "maxLength=14 applies before spaces are removed (P2)");
    await box(page, "FSSAI registration number").fill("1234 5678 9012 34");
    await expect(box(page, "FSSAI registration number")).toHaveValue("12345678901234");
  });
});

test.describe("Identity verification", () => {
  test.beforeEach(async ({ page, backend }) => {
    await draftUpTo(page, backend, "documents");
    await page.goto("/chef/application?step=documents");
    await expect(page.getByRole("heading", { level: 1, name: "Identity verification" })).toBeVisible();
  });

  test("Aadhaar needs both sides; PAN needs one", async ({ page }) => {
    await page.getByText("Aadhaar card", { exact: true }).click();
    await expect(page.locator('input[type=file][aria-label="Front side"]')).toHaveCount(1);
    await expect(page.locator('input[type=file][aria-label="Back side"]')).toHaveCount(1);
    await page.getByText("PAN card", { exact: true }).click();
    await expect(page.locator('input[type=file][aria-label="Back side"]')).toHaveCount(0);
    await expect(page.locator('input[type=file][aria-label="PAN card"]')).toHaveCount(1);
  });

  test("once a proof file is uploaded, the other document types are locked", async ({ page }) => {
    await page.getByText("PAN card", { exact: true }).click();
    await page.locator('input[type=file][aria-label="PAN card"]').setInputFiles({ ...PNG, name: "pan.png" });
    await expect(page.getByRole("button", { name: /Remove PAN card/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Aadhaar card" })).toBeDisabled();
  });
});

test("Review lists every section and submit needs the terms", async ({ page, backend }) => {
  await rememberChefDevice(page);
  backend.completeDraft();
  await page.goto("/chef/application?step=review");
  await expect(page.getByRole("heading", { level: 1, name: "Review your application" })).toBeVisible();
  for (const text of ["E2E Test Kitchen", "500072", "1234 5678 9012 34"]) await expect(page.getByText(text).first()).toBeVisible();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Accept the terms before submitting your application.")).toBeVisible();
  expect(backend.callsTo("POST", "/api/chef/onboarding/submit")).toHaveLength(0);
});
