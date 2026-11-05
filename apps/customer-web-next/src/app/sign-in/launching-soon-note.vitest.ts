// @vitest-environment jsdom
// The launching-soon note for a signed-in person. Disposable identity and responses; no production API is called.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { captureSessionContext, getSession, invalidateSession, setSessionIdentity } from "@/features/auth/api/cravesAuth";
import type { CravesIdentity } from "@/features/auth/lib/auth-contract";
import SignInPage from "./page";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/sign-in",
  useRouter: () => ({ push, replace: vi.fn() }),
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
}));

const customer: CravesIdentity = { id: "51111111-1111-4111-8111-111111111111", phoneNumber: "+910000000003", displayName: "Ravi Kumar", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"] };
let me: CravesIdentity | null;

const note = async (query: Record<string, string> = {}) => render(await SignInPage({ searchParams: Promise.resolve(query) }));

beforeEach(() => {
  me = null;
  push.mockReset();
  // The admin build runs the tests with CRAVES_ADMIN_PORTAL=true.
  vi.stubEnv("CRAVES_ADMIN_PORTAL", "");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "/api/auth/me") return me ? Response.json(me) : Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    if (url === "/api/auth/refresh") return me ? Response.json({ identity: me }) : Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    if (url === "/api/auth/logout") { me = null; return Response.json({ signedOut: true }); }
    return Response.json({}, { status: 404 });
  }));
});
afterEach(() => {
  cleanup();
  invalidateSession(captureSessionContext());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps Back to Craves and the home logo for a visitor who is not signed in", async () => {
  await note();
  // The note checks for a sign-in (/me, then a refresh); it still says Back to Craves once the check is answered.
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
  await act(() => new Promise((settled) => setTimeout(settled, 0)));
  expect(screen.getByRole("link", { name: "Back to Craves" }).getAttribute("href")).toBe("/");
  expect(screen.getByRole("link", { name: "Craves home" }).getAttribute("href")).toBe("/");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

it("offers a signed-in person Sign out instead of Back to Craves, whose landing page would send them back here", async () => {
  me = customer;
  setSessionIdentity(customer);
  await note();
  expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Back to Craves" })).toBeNull();
  expect(screen.getByRole("link", { name: "Join as a Home Chef" }).getAttribute("href")).toBe("/chef/sign-in");
  // The logo leads to the account deletion explainer, which stays open, not to "/".
  expect(screen.queryByRole("link", { name: "Craves home" })).toBeNull();
  expect(screen.getByRole("link", { name: "Delete your Craves account" }).getAttribute("href")).toBe("/account-deletion");
});

it("signs out with the website's customer sign-out and lands on the landing page", async () => {
  me = customer;
  setSessionIdentity(customer);
  await note();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  const dialog = await screen.findByRole("dialog", { name: "Sign out of Craves?" });
  expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/auth/logout")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/auth/logout")).toHaveLength(1);
  expect(getSession()).toBeNull();
});

it("keeps the chef's Back to my kitchen note as it is", async () => {
  me = { ...customer, roles: ["CUSTOMER", "CHEF"] };
  setSessionIdentity(me);
  await note({ from: "chef" });
  expect(screen.getByRole("link", { name: "Back to my kitchen" }).getAttribute("href")).toBe("/chef");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Back to Craves" })).toBeNull();
});
