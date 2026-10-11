// @vitest-environment jsdom
// Isolated identities and responses; no production auth or OTP service is called.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefSignIn } from "../components/chef-sign-in";
import { isChefModeVerified, markChefModeVerified } from "./chef-mode";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "../../auth/api/cravesAuth";
import type { CravesIdentity } from "../../auth/lib/auth-contract";

const mocks = vi.hoisted(() => ({ msg91: vi.fn(), navigate: vi.fn() }));
vi.mock("firebase/auth", () => ({ RecaptchaVerifier: class { render = vi.fn(); clear = vi.fn(); }, signInWithPhoneNumber: vi.fn() }));
vi.mock("@/features/auth/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));
vi.mock("@/features/sign-in/lib/msg91-browser", () => ({ beginMsg91PhoneSignIn: mocks.msg91, parkMsg91Captcha: vi.fn() }));
// next/image needs a real location; the logo is not under test here.
vi.mock("../../../shared/components/brand/CravesLogo", () => ({ CravesLogo: () => null }));

const customer: CravesIdentity = { id: "31111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", displayName: "Fixture", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"] };
let application: { status: string; documents: [] };
let refreshed: CravesIdentity;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  sessionStorage.clear();
  application = { status: "NOT_SUBMITTED", documents: [] };
  refreshed = customer;
  setSessionIdentity(customer);
  fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json(customer);
    if (url === "/api/auth/refresh") return Response.json({ identity: refreshed });
    if (url === "/api/auth/session") return Response.json({ identity: customer });
    if (url === "/api/chef/application") return Response.json(application);
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  const browser = window;
  vi.stubGlobal("window", new Proxy(browser, { get: (target, key) => key === "location" ? { replace: mocks.navigate, assign: mocks.navigate } : Reflect.get(target, key, target) }));
  mocks.navigate.mockReset();
  mocks.msg91.mockReset().mockResolvedValue({ confirm: vi.fn().mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue("t".repeat(120)) } }) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  invalidateSession(captureSessionContext());
});

it("shows the signed-in number and opens the application after a fresh OTP", async () => {
  render(createElement(ChefSignIn, { returnTo: "/chef/earnings", centralOtp: true }));
  expect(await screen.findByText("+919876543210")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Sign in to your kitchen" })).toBeTruthy();
  expect(screen.getByText(/keeps your orders, menu and earnings safe/)).toBeTruthy();
  expect(isChefModeVerified(customer.id)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
  // The sixth digit verifies the code by itself.
  fireEvent.change(await screen.findByLabelText("Six-digit OTP"), { target: { value: "123456" } });
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/chef/application"));
  expect(mocks.msg91).toHaveBeenCalledWith("+919876543210", "craves-recaptcha");
  expect(isChefModeVerified(customer.id)).toBe(true);
});

it("lets a signed-in customer verify another number", async () => {
  render(createElement(ChefSignIn, { returnTo: null, centralOtp: true }));
  fireEvent.click(await screen.findByRole("button", { name: "Use another number" }));
  const input = screen.getByLabelText("Mobile number") as HTMLInputElement;
  expect(input.value).toBe("+91");
  expect(screen.getByRole("link", { name: "New here? Apply to cook on Craves" }).getAttribute("href")).toBe("/chef/application");
  expect(screen.getByRole("link", { name: "Back to Craves" }).getAttribute("href")).toBe("/home");
});

it("goes straight in for a tab that already verified Chef Mode and refreshes a new approval once", async () => {
  markChefModeVerified(customer.id);
  application = { status: "APPROVED", documents: [] };
  refreshed = { ...customer, roles: ["CUSTOMER", "CHEF"] };
  render(createElement(ChefSignIn, { returnTo: "/chef/earnings", centralOtp: true }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/chef/earnings"));
  expect(screen.queryByRole("button", { name: "Send OTP" })).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
});

it("sends an approved account whose session still lacks CHEF to the status page, never back to /chef", async () => {
  markChefModeVerified(customer.id);
  application = { status: "APPROVED", documents: [] };
  render(createElement(ChefSignIn, { returnTo: "/chef", centralOtp: true }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/chef/application/status"));
});

it("asks a different signed-in user for their own OTP", async () => {
  markChefModeVerified("41111111-1111-4111-8111-111111111111");
  render(createElement(ChefSignIn, { returnTo: null, centralOtp: true }));
  await screen.findByRole("button", { name: "Send OTP" });
  await act(async () => {});
  expect(mocks.navigate).not.toHaveBeenCalled();
});
