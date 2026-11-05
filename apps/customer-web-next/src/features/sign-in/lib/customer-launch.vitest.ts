// @vitest-environment jsdom
// The early-access link on this device. No network; the sign-in form is a stand-in.
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CUSTOMER_EARLY_ACCESS_SHA256, CUSTOMERS_LAUNCHING_SOON, hasEarlyAccess, isDeletionPath, opensSignInDuringLaunch, rememberEarlyAccess } from "./customer-launch";
import { CustomerSignIn } from "../components/customer-sign-in";
import SignInPage from "@/app/sign-in/page";

vi.mock("@/features/sign-in/components/phone-auth-form", () => ({ PhoneAuthForm: () => createElement("form") }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("opens the customer sign-in during the launch for the delete page only", () => {
  for (const returnTo of ["/account/delete", "/account/delete?side=chef", "/account/delete#confirm"])
    expect(opensSignInDuringLaunch(returnTo), returnTo).toBe(true);
  for (const returnTo of ["/home", "/", "/account", "/account-deletion", "/account/delete/more", "/account/deleted", "/home?next=/account/delete"])
    expect(opensSignInDuringLaunch(returnTo), returnTo).toBe(false);
});

it("names the account deletion pages, and no other page", () => {
  for (const pathname of ["/account/delete", "/account/delete?side=chef", "/account/delete/more", "/account-deletion", "/account-deletion#how"])
    expect(isDeletionPath(pathname), pathname).toBe(true);
  for (const pathname of ["/account", "/account/deleted", "/account-deletions", "/home", "/home?next=/account/delete", "/chef/account/delete"])
    expect(isDeletionPath(pathname), pathname).toBe(false);
});

it("never remembers early access when the sign-in opens for the delete page during the launch", async () => {
  expect(CUSTOMERS_LAUNCHING_SOON).toBe(true);
  // The admin build runs the tests with CRAVES_ADMIN_PORTAL=true.
  vi.stubEnv("CRAVES_ADMIN_PORTAL", "");
  const { container } = render(await SignInPage({ searchParams: Promise.resolve({ returnTo: "/account/delete" }) }));
  expect(container.querySelector("form")).not.toBeNull();
  expect(hasEarlyAccess()).toBe(false);
});

it("remembers the early-access link on this device by its hash, never the key", () => {
  expect(hasEarlyAccess()).toBe(false);
  rememberEarlyAccess();
  expect(hasEarlyAccess()).toBe(true);
  expect(localStorage.getItem("craves.customer-early-access")).toBe(CUSTOMER_EARLY_ACCESS_SHA256);
  // Remembered under an older key: that key was retired.
  localStorage.setItem("craves.customer-early-access", "0".repeat(64));
  expect(hasEarlyAccess()).toBe(false);
});

it("treats blocked storage as no early access", () => {
  const blocked = () => {
    throw new DOMException("Storage is blocked", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  expect(() => rememberEarlyAccess()).not.toThrow();
  expect(hasEarlyAccess()).toBe(false);
});

it("is remembered by the customer sign-in only when the early-access link opened it", () => {
  const signIn = (earlyAccess: boolean) =>
    render(createElement(CustomerSignIn, { returnTo: "/home", centralOtp: true, confirm: false, earlyAccess }));
  signIn(false);
  expect(hasEarlyAccess()).toBe(false);
  cleanup();
  signIn(true);
  expect(hasEarlyAccess()).toBe(true);
});
