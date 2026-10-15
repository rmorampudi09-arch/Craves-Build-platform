// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SessionEndedPrompt } from "@/features/auth/components/session-ended-prompt";
import { setSessionIdentity, synchronizeSessionRoles } from "@/features/auth/api/cravesAuth";
import { BEFORE_SIGN_IN_EVENT, SESSION_ENDED_EVENT, sessionFetch } from "@/features/auth/api/sessionFetch";

const route = vi.hoisted(() => ({ pathname: "/checkout" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("an ended sign-in", () => {
  it("is announced only when the refresh itself is refused", async () => {
    const ended = vi.fn();
    window.addEventListener(SESSION_ENDED_EVENT, ended);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/auth/refresh" ? Response.json({ code: "REFRESH_REJECTED" }, { status: 401 }) : Response.json({}, { status: 401 })));
    expect((await sessionFetch("/api/customer/profile")).status).toBe(401);
    expect(ended).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_ENDED_EVENT, ended);
  });

  it("is not announced when another tab's renewal superseded this one", async () => {
    const ended = vi.fn();
    window.addEventListener(SESSION_ENDED_EVENT, ended);
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/auth/refresh" ? Response.json({ code: "REFRESH_SUPERSEDED" }, { status: 409 }) : Response.json({}, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await sessionFetch("/api/customer/profile")).status).toBe(401);
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/api/auth/refresh")).toHaveLength(2);
    expect(ended).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_ENDED_EVENT, ended);
  });

  it("asks a signed-in customer to sign in again and returns them to the same page", async () => {
    setSessionIdentity({ id: "12345678-1234-4123-8123-123456789012", phoneNumber: "+919876543210", displayName: "Asha", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"] });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/checkout", search: "?step=pay", assign });
    const kept = vi.fn();
    window.addEventListener(BEFORE_SIGN_IN_EVENT, kept);
    render(createElement(SessionEndedPrompt));
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    });
    expect(screen.getByRole("dialog", { name: "Please sign in again" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(kept).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/sign-in?returnTo=%2Fcheckout%3Fstep%3Dpay");
    window.removeEventListener(BEFORE_SIGN_IN_EVENT, kept);
  });

  it("stays closed once a sign-in page has taken over", async () => {
    setSessionIdentity({ id: "12345678-1234-4123-8123-123456789012", phoneNumber: "+919876543210", displayName: "Asha", email: null, emailVerified: false, status: "ACTIVE", roles: ["CHEF"] });
    route.pathname = "/chef/orders";
    const { rerender } = render(createElement(SessionEndedPrompt));
    await act(async () => {
      window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    });
    expect(screen.getByRole("dialog", { name: "Please sign in again" })).toBeTruthy();
    route.pathname = "/chef/sign-in";
    rerender(createElement(SessionEndedPrompt));
    route.pathname = "/home";
    rerender(createElement(SessionEndedPrompt));
    expect(screen.queryByRole("dialog")).toBeNull();
    route.pathname = "/checkout";
  });
});

describe("one refresh at a time", () => {
  it("lets a chef request share the role sync's refresh instead of sending a second one", async () => {
    const identity = { id: "22345678-1234-4123-8123-123456789012", phoneNumber: "+919876543211", displayName: "Ravi", email: null, emailVerified: false, status: "ACTIVE", roles: ["CHEF"] };
    setSessionIdentity({ ...identity, roles: ["CUSTOMER"] });
    let refreshes = 0;
    let refreshed = false;
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/refresh") {
        refreshes += 1;
        return new Promise<Response>((resolve) => { finish = resolve; });
      }
      // The access token predates the approval until the refresh lands.
      if (url === "/api/chef/orders") return refreshed ? Response.json([]) : Response.json({ code: "CHEF_ACCESS_REQUIRED" }, { status: 403 });
      return Response.json(null);
    }));
    const sync = synchronizeSessionRoles();
    const orders = sessionFetch("/api/chef/orders");
    await vi.waitFor(() => expect(refreshes).toBe(1));
    // Give the 403 time to ask for its own refresh: it must join the one in flight.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(refreshes).toBe(1);
    refreshed = true;
    finish(Response.json({ identity }));
    await sync;
    expect((await orders).status).toBe(200);
    expect(refreshes).toBe(1);
  });

  it("takes turns with other tabs and skips its own refresh when one renewed the sign-in meanwhile", async () => {
    const identity = { id: "32345678-1234-4123-8123-123456789012", phoneNumber: "+919876543212", displayName: "Lata", email: null, emailVerified: false, status: "ACTIVE", roles: ["CHEF"] };
    setSessionIdentity({ ...identity, roles: [] });
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/auth/me" ? Response.json(identity) : Response.json({ identity }));
    vi.stubGlobal("fetch", fetcher);
    const request = vi.fn(async (_name: string, work: () => Promise<unknown>) => {
      // Another tab finishes renewing the shared cookies while this one waits for the lock. A strictly later time:
      // in the same millisecond as this tab's own last refresh (an earlier test's), it would read as this tab's own.
      localStorage.setItem("craves.session.refreshed-at", String(Date.now() + 1));
      return work();
    });
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });
    expect((await synchronizeSessionRoles())?.roles).toEqual(["CHEF"]);
    expect(request).toHaveBeenCalledWith("craves-session-refresh", expect.any(Function));
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["/api/auth/me"]);

    // Nobody renewed meanwhile: this tab refreshes and records it, so the others can skip theirs.
    localStorage.clear();
    request.mockImplementation(async (_name, work) => work());
    await synchronizeSessionRoles();
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["/api/auth/me", "/api/auth/refresh"]);
    expect(Number(localStorage.getItem("craves.session.refreshed-at"))).toBeGreaterThan(0);
  });
});
