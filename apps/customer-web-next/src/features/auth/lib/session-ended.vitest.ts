// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SessionEndedPrompt } from "@/features/auth/components/session-ended-prompt";
import { setSessionIdentity } from "@/features/auth/api/cravesAuth";
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
});
