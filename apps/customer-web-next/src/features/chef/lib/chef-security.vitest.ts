// @vitest-environment jsdom
// A disposable identity; no backend is contacted.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChefSecurity } from "../components/chef-security";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "../../auth/api/cravesAuth";

const firebase = vi.hoisted(() => ({ auth: { currentUser: null as unknown, authStateReady: async () => undefined } }));
vi.mock("@/shared/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: firebase.auth }) }));

const chef = { id: "61111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", displayName: "Asha Rao", email: null, emailVerified: false, status: "ACTIVE", roles: ["CHEF"] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  firebase.auth.currentUser = null;
  invalidateSession(captureSessionContext());
});

describe("Login & security", () => {
  it("shows the masked mobile number, the email's state, and Delete my account as a ticket", () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(chef)));
    setSessionIdentity(chef);
    render(createElement(ChefSecurity));
    expect(screen.getByText("+91 ••••• 43210 · used to log in")).toBeTruthy();
    expect(screen.getByText("Not added")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add your email" }).getAttribute("href")).toBe("/chef/finance");
    expect(screen.getByRole("link", { name: /Delete my account/ }).getAttribute("href")).toBe("/chef/support/new?topic=Delete%20my%20account&from=/chef/security");

    act(() => setSessionIdentity({ ...chef, email: "asha@gmail.com", emailVerified: false }));
    expect(screen.getByText("a•••@gmail.com")).toBeTruthy();
    expect(screen.getByText("Not verified")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Verify your email" })).toBeTruthy();

    act(() => setSessionIdentity({ ...chef, email: "asha@gmail.com", emailVerified: true }));
    expect(screen.getAllByText("Verified")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /your email/ })).toBeNull();
    expect(screen.getByText(/no password to manage/)).toBeTruthy();
  });

  it("offers Change password, in the chef theme, only to a chef who signs in with email and password", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(chef)));
    setSessionIdentity(chef);
    firebase.auth.currentUser = { email: "asha@gmail.com", phoneNumber: "+919876543210", providerData: [{ providerId: "password" }] };
    render(createElement(ChefSecurity));
    fireEvent.click(await screen.findByRole("button", { name: /Change password/ }));
    expect(screen.getByRole("dialog", { name: "Change password" })).toBeTruthy();
    expect(screen.getByLabelText("Current password").closest(".chef-panel-theme.chef-sheet-theme")).toBeTruthy();
    expect(screen.queryByText(/no password to manage/)).toBeNull();
  });
});
