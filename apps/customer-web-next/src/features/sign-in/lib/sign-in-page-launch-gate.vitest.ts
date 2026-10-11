import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./customer-launch", async (original) => ({
  ...await original<typeof import("./customer-launch")>(),
  CUSTOMER_EARLY_ACCESS_SHA256: createHash("sha256").update("test-key").digest("hex"),
}));
vi.mock("next/link", () => ({ default: (props: { href: string; children?: unknown }) => createElement("a", { href: props.href }, props.children as never) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/features/sign-in/components/phone-auth-form", () => ({ PhoneAuthForm: () => createElement("form", { id: "phone-auth-form" }) }));
vi.mock("@/shared/components/brand/CravesLogo", () => ({ CravesLogo: () => createElement("span", null, "Craves") }));

const { default: SignInPage } = await import("@/app/sign-in/page");
const page = async (query: Record<string, string>) => renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(query) }));

// The admin build runs these tests with CRAVES_ADMIN_PORTAL=true; each test sets the host it means.
beforeEach(() => vi.stubEnv("CRAVES_ADMIN_PORTAL", ""));
afterEach(() => vi.unstubAllEnvs());

it("shows customers the launching-soon note unless the private link is used", async () => {
  expect(await page({})).toContain("Craves is launching soon for customers");
  expect(await page({})).not.toContain("phone-auth-form");
  expect(await page({ access: "wrong-key", returnTo: "/home" })).not.toContain("phone-auth-form");
  expect(await page({ access: "test-key", returnTo: "/home" })).toContain("phone-auth-form");
});

it("leaves chef return paths and the admin portal sign-in unchanged", async () => {
  await expect(page({ returnTo: "/chef/orders" })).rejects.toThrow("redirect:/chef/sign-in?returnTo=%2Fchef%2Forders");
  vi.stubEnv("CRAVES_ADMIN_PORTAL", "true");
  const admin = await page({});
  expect(admin).toContain("Administrator access");
  expect(admin).toContain("phone-auth-form");
});
