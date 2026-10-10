// @vitest-environment jsdom
// Disposable identities and responses; no production API is called.
import { createElement } from "react";
import { usePathname } from "next/navigation";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefModeGuard, isOpenInChefMode } from "../components/layout/ChefModeGuard";
import ChefLayout from "../app/chef/layout";
import ChefMorePage from "../app/chef/profile/page";
import ChefNotificationsPage from "../app/chef/notifications/page";
import LegacyChefProfilePage from "../app/chef/[id]/page";
import { isChefModeVerified, markChefModeVerified } from "./chef-mode";
import { captureSessionContext, getSession, invalidateSession, setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), assign: vi.fn(), locationReplace: vi.fn() }));
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
  sessionStorage.clear();
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

  it("leaves customers, and other accounts in this tab, on customer screens", () => {
    sessionStorage.clear();
    render(createElement(ChefModeGuard));
    markChefModeVerified("71111111-1111-4111-8111-111111111111");
    cleanup();
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
    expect(screen.getByRole("link", { name: "Chef Mode home" }).getAttribute("href")).toBe("/chef");
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
    for (const [label, href] of [
      ["Kitchen details", "/chef/kitchen"], ["Menu photos", "/chef/menu/media"], ["Meal plans", "/chef/meal-plans"],
      ["Capacity", "/chef/capacity"], ["Operations", "/chef/operations"], ["Earnings", "/chef/earnings"],
      ["Finance & payouts", "/chef/finance"], ["Statements", "/chef/statements"], ["Your application", "/chef/application/status"],
      ["Notifications", "/chef/notifications"], ["Help", "/contact"],
    ]) expect(screen.getByRole("link", { name: new RegExp(`^${label}`) }).getAttribute("href")).toBe(href);
    expect(screen.queryByText(/not available yet/i)).toBeNull();
  });

  it("switches to the customer app only by leaving Chef Mode", async () => {
    render(createElement(ChefMorePage));
    fireEvent.click(await screen.findByRole("button", { name: /^Switch to customer app/ }));
    expect(isChefModeVerified(chef.id)).toBe(false);
    expect(mocks.assign).toHaveBeenCalledExactlyOnceWith("/home");
    expect(getSession()?.id).toBe(chef.id);
  });

  it("signs out of Craves and Chef Mode and leaves no chef page behind", async () => {
    render(createElement(ChefMorePage));
    fireEvent.click(await screen.findByRole("button", { name: /^Sign out/ }));
    await waitFor(() => expect(mocks.locationReplace).toHaveBeenCalledExactlyOnceWith("/"));
    expect(isChefModeVerified(chef.id)).toBe(false);
    expect(getSession()).toBeNull();
  });
});

describe("Chef notifications", () => {
  it("shows the shared notifications inside Chef Mode and goes back to the chef home", async () => {
    vi.mocked(usePathname).mockReturnValue("/chef/notifications");
    render(createElement(ChefNotificationsPage));
    fireEvent.click(await screen.findByRole("link", { name: "Back to home" }));
    expect(mocks.push).toHaveBeenCalledWith("/chef");
    expect(mocks.push).not.toHaveBeenCalledWith("/home");
  });
});

describe("Legacy public chef links", () => {
  it("redirect kitchen ids to the kitchen page and never turn other segments into a kitchen", async () => {
    await expect(LegacyChefProfilePage({ params: Promise.resolve({ id: chef.id }) })).rejects.toThrow(`NEXT_REDIRECT /kitchen/${chef.id}`);
    for (const id of ["orderz", "earnings", "123", "61111111-1111-4111-8111-11111111111"])
      await expect(LegacyChefProfilePage({ params: Promise.resolve({ id }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
