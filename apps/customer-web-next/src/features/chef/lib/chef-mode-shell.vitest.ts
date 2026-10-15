// @vitest-environment jsdom
// Disposable identities and responses; no production API is called.
import { createElement } from "react";
import { usePathname } from "next/navigation";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefModeGuard, isOpenInChefMode } from "../components/ChefModeGuard";
import ChefLayout from "../../../app/chef/layout";
import ChefMorePage from "../../../app/chef/profile/page";
import ChefNotificationsPage from "../../../app/chef/notifications/page";
import LegacyChefProfilePage from "../../../app/chef/[id]/page";
import { chefDeviceAccount, isChefModeTab, isChefModeVerified, markChefModeVerified, markCustomerModeVerified, rememberChefAccount } from "./chef-mode";
import { captureSessionContext, getSession, invalidateSession, setSessionIdentity } from "../../auth/api/cravesAuth";
import type { CravesIdentity } from "../../auth/lib/auth-contract";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), assign: vi.fn(), locationReplace: vi.fn() }));
const launch = vi.hoisted(() => ({ soon: false }));
vi.mock("@/features/sign-in/lib/customer-launch", async (original) => ({
  ...await original<typeof import("@/features/sign-in/lib/customer-launch")>(),
  get CUSTOMERS_LAUNCHING_SOON() { return launch.soon; },
}));
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/home"),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`NEXT_REDIRECT ${href}`); },
}));

const chef: CravesIdentity = { id: "61111111-1111-4111-8111-111111111111", phoneNumber: "+910000000002", displayName: "Asha Rao", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER", "CHEF"] };
let me: CravesIdentity | null;

beforeEach(() => {
  me = chef;
  launch.soon = false;
  sessionStorage.clear();
  localStorage.clear();
  setSessionIdentity(chef);
  markChefModeVerified(chef.id);
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(usePathname).mockReturnValue("/home");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "/api/auth/me") return me ? Response.json(me) : Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    if (url === "/api/auth/refresh") return Response.json({ identity: me });
    if (url === "/api/auth/logout") { me = null; return Response.json({ signedOut: true }); }
    if (url === "/api/chef/application") return Response.json({ firstName: "Asha", lastName: "Rao", status: "APPROVED", documents: [] });
    if (url === "/api/chef/kitchen") return Response.json({ kitchenName: "Asha's Kitchen" });
    if (url.startsWith("/api/notifications/in-app/page")) return Response.json({ notices: [], nextCursor: null, hasMore: false });
    if (url.startsWith("/api/notifications/in-app")) return Response.json([]);
    return Response.json({}, { status: 404 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  invalidateSession(captureSessionContext());
});

describe("Chef Mode guard", () => {
  it("returns a tab in Chef Mode from a customer screen to the chef home", async () => {
    render(createElement(ChefModeGuard));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chef"));
  });

  it.each(["/chef/orders", "/chef/sign-in", "/contact", "/privacy", "/terms", "/security", "/refunds-cancellations", "/products-pricing", "/pilot-launch", "/sign-in", "/admin/accounts"])("keeps %s open", (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    render(createElement(ChefModeGuard));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("treats only the chef app and the listed public pages as open", () => {
    for (const pathname of ["/home", "/chefs", "/kitchen/abc", "/cart", "/profile", "/notifications", "/chefsomething"])
      expect(isOpenInChefMode(pathname), pathname).toBe(false);
  });

  it("checks a customer page again when Back restores it from the page cache", async () => {
    markCustomerModeVerified(chef.id);
    render(createElement(ChefModeGuard));
    expect(mocks.replace).not.toHaveBeenCalled();
    markChefModeVerified(chef.id);
    act(() => { window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })); });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chef"));
  });

  it("leaves customers, and other accounts in this tab, on customer screens", () => {
    markCustomerModeVerified(chef.id);
    render(createElement(ChefModeGuard));
    markChefModeVerified("71111111-1111-4111-8111-111111111111");
    cleanup();
    render(createElement(ChefModeGuard));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("leaves a new tab's customer screens alone after the launch, while the device still opens the kitchen", () => {
    sessionStorage.clear();
    vi.mocked(usePathname).mockReturnValue("/cart");
    render(createElement(ChefModeGuard));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(isChefModeTab(chef.id)).toBe(false);
    expect(isChefModeVerified(chef.id)).toBe(true);
  });

  it("shows that chef the launching-soon note instead while customers wait", async () => {
    launch.soon = true;
    sessionStorage.clear();
    vi.mocked(usePathname).mockReturnValue("/cart");
    render(createElement(ChefModeGuard));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in?from=chef"));
  });

  it("shows an applicant who used Chef Mode on this device the launching-soon note in a new tab", async () => {
    launch.soon = true;
    vi.mocked(usePathname).mockReturnValue("/chef/application");
    render(createElement(ChefModeGuard));
    cleanup();
    sessionStorage.clear();
    setSessionIdentity({ ...chef, roles: ["CUSTOMER"] });
    vi.mocked(usePathname).mockReturnValue("/home");
    render(createElement(ChefModeGuard));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in?from=chef"));
  });

  it("leaves customers alone while customers wait when this device never used Chef Mode for them", () => {
    launch.soon = true;
    sessionStorage.clear();
    localStorage.clear();
    setSessionIdentity({ ...chef, roles: ["CUSTOMER"] });
    render(createElement(ChefModeGuard));
    cleanup();
    rememberChefAccount("71111111-1111-4111-8111-111111111111");
    render(createElement(ChefModeGuard));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("never asks a customer without the chef role", () => {
    sessionStorage.clear();
    setSessionIdentity({ ...chef, roles: ["CUSTOMER"] });
    render(createElement(ChefModeGuard));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("Chef Mode shell", () => {
  it("gives applicants the account menu without workspace tabs", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/application/status");
    setSessionIdentity({ ...chef, roles: ["CUSTOMER"] });
    render(createElement(ChefLayout, null, createElement("main", null, "Application hub")));
    expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Craves Chef home" }).getAttribute("href")).toBe("/chef");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows no shell around the Chef Mode sign-in page", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/sign-in");
    render(createElement(ChefLayout, null, createElement("main", null, "Sign in")));
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
  });
});

describe("More hub", () => {
  beforeEach(() => {
    const browser = window;
    vi.stubGlobal("window", new Proxy(browser, { get: (target, key) => key === "location" ? { assign: mocks.assign, replace: mocks.locationReplace, pathname: "/chef/profile", search: "" } : Reflect.get(target, key, target) }));
  });

  it("lists every chef page that is not a tab", async () => {
    render(createElement(ChefMorePage));
    await screen.findByRole("heading", { name: "Asha Rao" });
    // One read of the links: a name query per row is too slow for this long list.
    const links = screen.getAllByRole("link").map((link) => [link.querySelector(".chef-row-title")?.textContent, link.getAttribute("href")]);
    for (const [label, href] of [
      ["Kitchen details", "/chef/kitchen"], ["Opening hours", "/chef/operations"], ["Daily limits", "/chef/capacity"],
      ["Meal plans", "/chef/meal-plans"], ["Documents", "/chef/documents"], ["Earnings", "/chef/earnings"],
      ["Balance & payouts", "/chef/finance"], ["Payout history", "/chef/earnings/payouts"], ["Edit bank account details", "/chef/bank"],
      ["Statements", "/chef/statements"], ["Refer a chef", "/chef/referrals"], ["Preferences", "/chef/preferences"], ["Your application", "/chef/application/status"],
      ["Notifications", "/chef/notifications"], ["Help & support", "/chef/support"], ["Login & security", "/chef/security"],
    ]) expect(links.find(([title]) => title === label)?.[1], label).toBe(href);
    expect(screen.queryByText(/not available yet/i)).toBeNull();
  });

  it("switches to the customer app at once: only this tab leaves Chef Mode, the device keeps the kitchen", async () => {
    render(createElement(ChefMorePage));
    fireEvent.click(await screen.findByRole("button", { name: /^Switch to customer app/ }));
    expect(isChefModeTab(chef.id)).toBe(false);
    expect(isChefModeVerified(chef.id)).toBe(true);
    expect(mocks.assign).toHaveBeenCalledExactlyOnceWith("/home");
    expect(getSession()?.id).toBe(chef.id);
  });

  it("keeps the chef in Chef Mode and shows the launching-soon note while customers wait", async () => {
    launch.soon = true;
    render(createElement(ChefMorePage));
    fireEvent.click(await screen.findByRole("button", { name: /^Switch to customer app/ }));
    expect(isChefModeTab(chef.id)).toBe(true);
    expect(mocks.assign).toHaveBeenCalledExactlyOnceWith("/sign-in?from=chef");
    expect(isOpenInChefMode("/sign-in")).toBe(true);
  });

  it("signs out of Craves and makes this device forget Chef Mode, leaving no chef page behind", async () => {
    render(createElement(ChefMorePage));
    fireEvent.click(await screen.findByRole("button", { name: /^Sign out/ }));
    await waitFor(() => expect(mocks.locationReplace).toHaveBeenCalledExactlyOnceWith("/"));
    expect(isChefModeVerified(chef.id)).toBe(false);
    expect(chefDeviceAccount()).toBeNull();
    expect(getSession()).toBeNull();
  });

  it("keeps the kitchen on this device when the sign-in ends by itself", () => {
    invalidateSession(captureSessionContext());
    expect(getSession()).toBeNull();
    expect(isChefModeTab(chef.id)).toBe(false);
    expect(isChefModeVerified(chef.id)).toBe(true);
    expect(chefDeviceAccount()).toBe(chef.id);
  });
});

describe("Chef notifications", () => {
  it("shows the chef's notifications inside Chef Mode and goes back to the chef home", async () => {
    vi.mocked(usePathname).mockReturnValue("/chef/notifications");
    render(createElement(ChefNotificationsPage));
    expect(await screen.findByText("No notifications yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/chef");
    expect(screen.queryByRole("link", { name: "Back to home" })).toBeNull();
  });
});

describe("Legacy public chef links", () => {
  it("redirect kitchen ids to the kitchen page and never turn other segments into a kitchen", async () => {
    await expect(LegacyChefProfilePage({ params: Promise.resolve({ id: chef.id }) })).rejects.toThrow(`NEXT_REDIRECT /kitchen/${chef.id}`);
    for (const id of ["orderz", "earnings", "123", "61111111-1111-4111-8111-11111111111"])
      await expect(LegacyChefProfilePage({ params: Promise.resolve({ id }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
