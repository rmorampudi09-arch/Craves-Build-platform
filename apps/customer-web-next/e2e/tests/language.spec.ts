/**
 * The language comes first: chef sign-in and the application ask before anything else,
 * and the choice stays on this device (craves_lang cookie). The other specs start in English.
 */
import { test, expect, rememberChefDevice } from "../support/backend";

// Cleared in the test body: the backend fixture sets the English cookie when it starts.
test("sign-in asks for the language first, then speaks it and remembers it", async ({ page, context, backend }) => {
  backend.signedIn = false;
  await context.clearCookies({ name: "craves_lang" });
  await page.goto("/chef/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Choose your language" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /mobile/i })).toHaveCount(0);

  await page.getByRole("button", { name: /Telugu/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "మీ వంటగదిలోకి సైన్ ఇన్ చేయండి" })).toBeVisible();
  expect((await context.cookies()).find((cookie) => cookie.name === "craves_lang")?.value).toBe("te");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "మీ వంటగదిలోకి సైన్ ఇన్ చేయండి" })).toBeVisible();
  await expect(page.locator("html [lang='te']").first()).toBeAttached();
});

test("the application starts with the language, before Basic details", async ({ page, context, backend }) => {
  await context.clearCookies({ name: "craves_lang" });
  backend.signedIn = true;
  await rememberChefDevice(page);
  await page.goto("/chef/application");
  await expect(page.getByRole("heading", { level: 1, name: "Choose your language" })).toBeVisible();

  await page.getByRole("button", { name: /Kannada/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ನಿಮ್ಮ ವಿವರಗಳು" })).toBeVisible();
});
