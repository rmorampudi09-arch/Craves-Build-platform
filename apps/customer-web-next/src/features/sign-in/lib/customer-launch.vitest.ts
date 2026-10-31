// @vitest-environment jsdom
// The early-access link on this device. No network; the sign-in form is a stand-in.
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CUSTOMER_EARLY_ACCESS_SHA256, hasEarlyAccess, rememberEarlyAccess } from "./customer-launch";
import { CustomerSignIn } from "../components/customer-sign-in";

vi.mock("@/features/sign-in/components/phone-auth-form", () => ({ PhoneAuthForm: () => createElement("form") }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
