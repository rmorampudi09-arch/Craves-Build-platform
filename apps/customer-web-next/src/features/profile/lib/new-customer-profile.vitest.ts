// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewCustomerProfileGate } from "@/features/profile/components/new-customer-profile-gate";
import { captureSessionContext, getSession, invalidateSession, setSessionIdentity } from "@/features/auth/api/cravesAuth";

const route = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/features/sign-in/components/EmailVerificationPanel", () => ({ EmailVerificationPanel: () => null }));

const id = "12345678-1234-4123-8123-123456789012";
const saved = { id, registeredPhoneNumber: "+919876543210", firstName: "Asha", lastName: "Rao", email: null, createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z" };
let puts: unknown[];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  puts = [];
  route.pathname = "/home";
  setSessionIdentity({ id, phoneNumber: "+919876543210", displayName: null, email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"] });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)));
      return Response.json(saved);
    }
    return Response.json(null);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  invalidateSession(captureSessionContext());
});

describe("a new customer", () => {
  it("names themselves before going on: first and last name are required", async () => {
    render(createElement(NewCustomerProfileGate));
    const sheet = await screen.findByRole("dialog", { name: "Welcome to Craves" });
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(sheet.textContent).toContain("Enter your first name");
    expect(puts).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Rao" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    expect(puts).toEqual([{ firstName: "Asha", lastName: "Rao" }]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(getSession()?.profileComplete).toBe(true);
  });

  it("never traps anyone when the profile service is down: they may go on and are asked again later", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? Response.json({ code: "PROFILE_UNAVAILABLE" }, { status: 503 }) : Response.json(null)));
    render(createElement(NewCustomerProfileGate));
    await screen.findByRole("dialog", { name: "Welcome to Craves" });
    expect(screen.queryByRole("button", { name: "Do this later" })).toBeNull();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "R" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    expect(screen.getByRole("alert").textContent).toContain("do this later");
    fireEvent.click(screen.getByRole("button", { name: "Do this later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(getSession()?.profileComplete).toBe(false);
  });

  it("is never asked inside Chef Mode", async () => {
    route.pathname = "/chef/menu";
    render(createElement(NewCustomerProfileGate));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
