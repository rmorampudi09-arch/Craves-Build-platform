// @vitest-environment jsdom
// Settings and the Profile header with a fixture account; no backend is contacted.
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  session: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  clearSession: vi.fn(async () => undefined),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => createElement("a", { href: to, ...props }, children),
}));
vi.mock("@/shared/components/brand/CravesLogo", () => ({ CravesLogo: () => createElement("span", null, "Craves") }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  getSession: () => auth.session,
  loadSession: async () => auth.session,
  subscribeSession: () => () => undefined,
  clearSession: auth.clearSession,
  captureSessionContext: () => ({ generation: 1, identityId: auth.session?.id ?? null }),
  isSessionContextCurrent: () => true,
  LogoutUnconfirmedError: class extends Error {},
}));

import SettingsPage from "@/features/profile/screens/Settings";
import { ProfileHeader } from "@/features/profile/components/ProfileHeader";

const SHA = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  auth.session = { id: "11111111-1111-4111-8111-111111111111" };
});

describe("Settings", () => {
  it("lists account, support and legal pages like the app, with the web build", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ commitSha: SHA })));
    render(createElement(SettingsPage));
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/^Privacy & security/)).toBe("/security");
    expect(href(/^Saved addresses/)).toBe("/addresses");
    expect(href(/^Notifications/)).toBe("/notifications");
    expect(href(/^Help & support/)).toBe("/help");
    expect(href(/^Terms & conditions/)).toBe("/terms");
    expect(href(/^Privacy policy/)).toBe("/privacy");
    expect(await screen.findByText("Version 1a2b3c4")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to profile" }).getAttribute("href")).toBe("/profile");
  });

  it("logs out through the same confirm as Profile, and offers no Log out to a guest", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ commitSha: "unknown" })));
    render(createElement(SettingsPage));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await vi.waitFor(() => expect(auth.clearSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/^Version/)).toBeNull();
    cleanup();
    auth.session = null;
    render(createElement(SettingsPage));
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  });
});

describe("Profile header", () => {
  it("shows the unread count on the bell and a way into Settings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ unreadCount: 12 })));
    render(createElement(ProfileHeader, { signedIn: true }));
    const bell = await screen.findByRole("link", { name: "Notifications, 9+ unread" });
    expect(bell.getAttribute("href")).toBe("/notifications");
    expect(bell.textContent).toBe("9+");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });
});
