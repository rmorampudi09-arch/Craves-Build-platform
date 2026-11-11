/**
 * Slow and failing saves. Reproduces the 12 Oct live incident in milliseconds: a PUT the
 * server committed but the browser never heard back from (20 s on prod, past the client
 * timeout) left every later save on 409 ONBOARDING_VERSION_CHANGED until a full reload.
 */
import { test, expect, rememberChefDevice } from "../support/backend";
import type { Page } from "@playwright/test";

const PNG = { name: "kitchen.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
const save = (page: Page) => page.getByRole("button", { name: "Save and continue" });
const errorBanner = (page: Page) => page.getByRole("alert").filter({ hasText: /Ref:|try again|connection/i }).first();

test.beforeEach(async ({ page, backend }) => {
  await rememberChefDevice(page);
  backend.completeDraft();
  await page.goto("/chef/application?step=kitchen");
  await expect(page.getByRole("heading", { level: 1, name: "Your kitchen" })).toBeVisible();
  await page.getByRole("textbox", { name: "Kitchen name", exact: true }).fill("Renamed Kitchen");
});

test("a dropped save that never reached the server can simply be saved again", async ({ page, backend }) => {
  backend.fail("PUT", "/api/chef/onboarding", "abort");
  await save(page).click();
  await expect(errorBanner(page)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Kitchen name", exact: true })).toHaveValue("Renamed Kitchen");
  await save(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Identity verification" })).toBeVisible();
  expect(backend.details).toMatchObject({ kitchenName: "Renamed Kitchen" });
});

test("BUG: after a save the server committed but the browser timed out, the next save is stuck on 409", async ({ page, backend }) => {
  test.fail(true, "P1: client keeps the stale expectedVersion; Retry and Save never re-read it (use-chef-onboarding.ts accept/persist)");
  backend.fail("PUT", "/api/chef/onboarding", "commit-then-abort");
  await save(page).click();
  await expect(errorBanner(page)).toBeVisible();
  expect(backend.details).toMatchObject({ kitchenName: "Renamed Kitchen" }); // the server did save it
  await save(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Identity verification" })).toBeVisible();
});

test("the stuck 409 asks for a reload (prod copy says 'another tab' even with one tab open)", async ({ page, backend }) => {
  backend.fail("PUT", "/api/chef/onboarding", "commit-then-abort");
  await save(page).click();
  await expect(errorBanner(page)).toBeVisible();
  await save(page).click();
  // Documents today's behaviour so a fix that changes the copy is noticed.
  await expect(page.getByRole("alert").filter({ hasText: "Ref: ONBOARDING_VERSION_CHANGED" })).toContainText(/application changed/i);
  expect(backend.callsTo("PUT", "/api/chef/onboarding").length).toBe(2);
});

test("a reload recovers from the stuck 409 without losing saved work", async ({ page, backend }) => {
  backend.fail("PUT", "/api/chef/onboarding", "commit-then-abort");
  await save(page).click();
  await expect(errorBanner(page)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Kitchen name", exact: true })).toHaveValue("Renamed Kitchen");
  await save(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Identity verification" })).toBeVisible();
});

test("BUG: Retry on a failed photo upload never recovers from the stale version", async ({ page, backend }) => {
  test.fail(true, "P1: uploadFile() persists with the stale expectedVersion before any GET (chef-onboarding-upload.tsx Retry)");
  await page.goto("/chef/application?step=documents");
  await expect(page.getByRole("heading", { level: 1, name: "Identity verification" })).toBeVisible();
  backend.documents = backend.documents.filter((d) => d.documentType !== "SELECTED_PROOF_FRONT");
  backend.fail("PUT", "/api/chef/onboarding", "commit-then-abort");
  await page.locator('input[type=file][aria-label="PAN card"]').setInputFiles({ ...PNG, name: "pan.png" });
  await expect(page.getByText("Upload failed").first()).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByRole("button", { name: /Remove PAN card/i })).toBeVisible();
});
