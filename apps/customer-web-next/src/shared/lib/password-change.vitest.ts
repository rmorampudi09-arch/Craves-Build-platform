// @vitest-environment jsdom
// Change password for email accounts, with Firebase mocked; no provider is contacted.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changePassword, passwordUser, validatePasswordChange } from "./password-change";
import { ChangePasswordSheet, useHasPassword } from "../ui/forms/change-password-sheet";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as unknown, authStateReady: async () => undefined },
  reauthenticate: vi.fn(),
  update: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  reauthenticateWithCredential: mocks.reauthenticate,
  updatePassword: mocks.update,
}));
vi.mock("@/shared/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: mocks.auth }) }));

const emailUser = (patch: Record<string, unknown> = {}) => ({
  email: "asha@example.com",
  phoneNumber: "+919876543210",
  providerData: [{ providerId: "phone" }, { providerId: "password" }],
  getIdToken: vi.fn().mockResolvedValue("token"),
  ...patch,
});

afterEach(() => {
  cleanup();
  mocks.auth.currentUser = null;
  mocks.reauthenticate.mockReset();
  mocks.update.mockReset();
});

describe("password change rules", () => {
  it("follows the app's checks and wording", () => {
    expect(validatePasswordChange({ currentPassword: "", newPassword: "short", confirmPassword: "" })).toEqual({
      currentPassword: "Enter your current password.",
      newPassword: "Use at least 8 characters.",
      confirmPassword: "Passwords do not match.",
    });
    expect(validatePasswordChange({ currentPassword: "same-password", newPassword: "same-password", confirmPassword: "same-password" }))
      .toEqual({ newPassword: "Choose a password different from your current password." });
    expect(validatePasswordChange({ currentPassword: "old-password", newPassword: "new-password", confirmPassword: "new-password" })).toEqual({});
  });

  it("finds a password only for this account's email sign-in", async () => {
    mocks.auth.currentUser = emailUser();
    expect(await passwordUser("+91 98765 43210")).toBe(mocks.auth.currentUser);
    // Phone-only accounts, and a Firebase user left behind by another account, have none to change.
    mocks.auth.currentUser = emailUser({ providerData: [{ providerId: "phone" }] });
    expect(await passwordUser("+919876543210")).toBeNull();
    mocks.auth.currentUser = emailUser({ phoneNumber: "+919999999999" });
    expect(await passwordUser("+919876543210")).toBeNull();
    mocks.auth.currentUser = null;
    expect(await passwordUser("+919876543210")).toBeNull();
  });

  it("re-authenticates with the current password before saving the new one", async () => {
    const user = emailUser();
    mocks.auth.currentUser = user;
    await changePassword("+919876543210", "old-password", "new-password");
    expect(mocks.reauthenticate).toHaveBeenCalledExactlyOnceWith(user, { email: "asha@example.com", password: "old-password" });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(user, "new-password");

    mocks.reauthenticate.mockRejectedValueOnce(Object.assign(new Error("Firebase"), { code: "auth/wrong-password" }));
    await expect(changePassword("+919876543210", "wrong", "new-password")).rejects.toThrow(
      "We could not change your password. Check your current password and try again.",
    );
    expect(mocks.update).toHaveBeenCalledOnce();

    mocks.auth.currentUser = null;
    await expect(changePassword("+919876543210", "old-password", "new-password")).rejects.toThrow(
      "You can change a password only when you sign in with email and password.",
    );
  });
});

describe("Change password sheet", () => {
  function Screen({ phone }: { phone: string }) {
    const hasPassword = useHasPassword(phone);
    return hasPassword ? createElement(ChangePasswordSheet, { open: true, onClose: vi.fn(), phoneNumber: phone }) : null;
  }

  it("is hidden for phone-only accounts", async () => {
    mocks.auth.currentUser = emailUser({ providerData: [{ providerId: "phone" }] });
    render(createElement(Screen, { phone: "+919876543210" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("checks the fields, then saves and confirms", async () => {
    mocks.auth.currentUser = emailUser();
    render(createElement(Screen, { phone: "+919876543210" }));
    const current = (await screen.findByLabelText("Current password")) as HTMLInputElement;
    const next = screen.getByLabelText("New password") as HTMLInputElement;
    const confirm = screen.getByLabelText("Confirm new password") as HTMLInputElement;
    expect([current.type, current.autocomplete, next.autocomplete, confirm.autocomplete]).toEqual(["password", "current-password", "new-password", "new-password"]);

    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Enter your current password.")).toBeTruthy();
    expect(document.activeElement).toBe(current);
    expect(mocks.reauthenticate).not.toHaveBeenCalled();

    fireEvent.change(current, { target: { value: "old-password" } });
    fireEvent.change(next, { target: { value: "new-password" } });
    fireEvent.change(confirm, { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect((await screen.findByRole("status")).textContent).toBe("Your new password is saved.");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(mocks.auth.currentUser, "new-password");
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("shows the app's message when the current password is wrong", async () => {
    mocks.auth.currentUser = emailUser();
    mocks.reauthenticate.mockRejectedValue(Object.assign(new Error("Firebase"), { code: "auth/invalid-credential" }));
    render(createElement(Screen, { phone: "+919876543210" }));
    fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: "wrong-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("We could not change your password. Check your current password and try again."));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
