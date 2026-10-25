// @vitest-environment jsdom
// Disposable identities and responses exercise the rendered access boundary; no production API is called.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefAccessBoundary } from "../components/chef-access-boundary";
import { isChefModeTab, isChefModeVerified, markChefModeVerified } from "./chef-mode";
import { getSession, setSessionIdentity } from "../../auth/api/cravesAuth";
import type { CravesIdentity } from "../../auth/lib/auth-contract";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/chef/earnings" }));

const customer: CravesIdentity = { id: "51111111-1111-4111-8111-111111111111", phoneNumber: "+910000000001", displayName: "Fixture", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"] };
const chef: CravesIdentity = { ...customer, roles: ["CUSTOMER", "CHEF"] };
const signInHere = "/chef/sign-in?returnTo=%2Fchef%2Fearnings%3Frange%3Dweek";
let me: CravesIdentity;
let refreshed: CravesIdentity | null;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  me = customer;
  refreshed = chef;
  sessionStorage.clear();
  localStorage.clear();
  navigation.replace.mockReset();
  window.history.replaceState(null, "", "/chef/earnings?range=week");
  setSessionIdentity(customer);
  markChefModeVerified(customer.id);
  fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json(me);
    if (url === "/api/auth/refresh") {
      if (!refreshed) return Response.json({ message: "Unavailable" }, { status: 503 });
      me = refreshed; // the rotated token now carries the database roles
      return Response.json({ identity: refreshed });
    }
    if (url === "/api/chef/application") return Response.json({ status: "APPROVED", documents: [] });
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
const calls = (url: string) => fetcher.mock.calls.filter(([input]) => String(input) === url).length;
function open() {
  return render(createElement(ChefAccessBoundary, null, createElement("p", null, "Chef earnings")));
}

it("opens a chef approved after their last sign-in with a token refresh instead of looping", async () => {
  open();
  await screen.findByText("Chef earnings");
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(getSession()?.roles).toContain("CHEF");
  expect(calls("/api/auth/refresh")).toBeGreaterThanOrEqual(1);
});

it("says chef access isn't switched on yet, without a new sign-in, when a refresh still has no CHEF role", async () => {
  refreshed = customer;
  open();
  await screen.findByRole("heading", { name: "Your chef access is on its way" });
  expect(screen.getByRole("alert").textContent).toContain("you don’t need to sign in again");
  // Chef support is behind this same check, so the way out is the open contact page.
  expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/contact");
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(isChefModeVerified(customer.id)).toBe(true);
  expect(screen.queryByText("Chef earnings")).toBeNull();
  // Once Craves switches the role on, Try again opens the page.
  refreshed = chef;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Chef earnings");
});

it("offers a retry, not a sign-in, when the role refresh is temporarily unavailable", async () => {
  refreshed = null;
  open();
  await screen.findByRole("heading", { name: "We couldn’t reach Craves" });
  expect(navigation.replace).not.toHaveBeenCalled();
  refreshed = chef;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Chef earnings");
});

it("sends a signed-in customer who has not opened Chef Mode on this device to the chef sign-in", async () => {
  sessionStorage.clear();
  localStorage.clear();
  me = chef;
  setSessionIdentity(chef);
  open();
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(signInHere));
  expect(calls("/api/chef/application")).toBe(0);
  expect(screen.queryByText("Chef earnings")).toBeNull();
});

it("opens Chef Mode in a new tab of a device that already confirmed it, and the tab joins Chef Mode", async () => {
  me = chef;
  setSessionIdentity(chef);
  markChefModeVerified(chef.id);
  // A new tab, a notification click or a restarted browser: empty sessionStorage, same localStorage.
  sessionStorage.clear();
  open();
  await screen.findByText("Chef earnings");
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(isChefModeTab(chef.id)).toBe(true);
});

it("shows the next chef tab at once, without checking access again", async () => {
  me = chef;
  // A sign-in ends Chef Mode; the chef sign-in marks the tab again right after.
  setSessionIdentity(chef);
  markChefModeVerified(chef.id);
  const first = open();
  await screen.findByText("Chef earnings");
  // The session already carries CHEF: no refresh, so no rotation another tab could collide with.
  expect(calls("/api/auth/refresh")).toBe(0);
  first.unmount();
  const requests = fetcher.mock.calls.length;
  open();
  expect(screen.getByText("Chef earnings")).toBeTruthy();
  expect(screen.queryByText("Opening Chef Mode")).toBeNull();
  expect(fetcher.mock.calls.length).toBe(requests);
});
