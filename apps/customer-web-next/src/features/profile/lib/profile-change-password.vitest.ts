// @vitest-environment jsdom
// Profile > Help & security offers Change password only to accounts that sign in with email; Firebase and Craves are fixtures.
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import ProfilePage from "../screens/Profile";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "@/features/auth/api/cravesAuth";

const firebase = vi.hoisted(() => ({ auth: { currentUser: null as unknown, authStateReady: async () => undefined } }));
vi.mock("@/shared/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: firebase.auth }) }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, Link: ({ children }: { children: unknown }) => children }));
vi.mock("next/navigation", () => ({ usePathname: () => "/profile", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const profile = { id: "71111111-1111-4111-8111-111111111111", registeredPhoneNumber: "+919876543210", firstName: "Asha", lastName: "Rao", email: "asha@example.com", createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" };
const customer = { id: "71111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", displayName: "Asha Rao", email: "asha@example.com", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  firebase.auth.currentUser = null;
  invalidateSession(captureSessionContext());
});

async function openProfile(providers: string[]) {
  firebase.auth.currentUser = { email: customer.email, phoneNumber: customer.phoneNumber, providerData: providers.map((providerId) => ({ providerId })) };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json(customer);
    if (url === "/api/customer/profile") return Response.json(profile);
    if (url === "/api/customer/addresses" || url === "/api/orders") return Response.json([]);
    return Response.json({}, { status: 404 });
  }));
  setSessionIdentity(customer);
  render(createElement(ProfilePage));
  await screen.findByRole("heading", { name: "Help & security" });
  await act(async () => {});
}

it("hides Change password for a phone-only account", async () => {
  await openProfile(["phone"]);
  expect(screen.queryByRole("button", { name: /Change password/ })).toBeNull();
});

it("shows Change password for an account that signs in with email and password", async () => {
  await openProfile(["phone", "password"]);
  expect(await screen.findByRole("button", { name: /Change password/ })).toBeTruthy();
});
