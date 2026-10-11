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
});
