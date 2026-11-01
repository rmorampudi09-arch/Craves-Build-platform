"use client";

import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, type User } from "firebase/auth";
import { getFirebaseBrowserClient } from "@/shared/lib/firebase-client";

export type PasswordChange = { currentPassword: string; newPassword: string; confirmPassword: string };

export const PASSWORD_CHANGE_FAILED = "We could not change your password. Check your current password and try again.";
export const PASSWORD_CHANGE_NEEDS_EMAIL = "You can change a password only when you sign in with email and password.";

/** The app's rules and wording (customerSettingsChildModel.validatePasswordChange). */
export function validatePasswordChange(input: PasswordChange): Partial<PasswordChange> {
  const errors: Partial<PasswordChange> = {};
  if (!input.currentPassword) errors.currentPassword = "Enter your current password.";
  if (input.newPassword.length < 8) errors.newPassword = "Use at least 8 characters.";
  else if (input.newPassword === input.currentPassword) errors.newPassword = "Choose a password different from your current password.";
  if (input.confirmPassword !== input.newPassword) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

const lastTenDigits = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "").slice(-10);

/**
 * This browser's Firebase user when it signs in with email and password and is the signed-in
 * Craves account (same mobile number). Phone-only accounts, a Firebase user left behind by another
 * account, and hosts without Firebase config all give null.
 */
export async function passwordUser(phoneNumber: string): Promise<User | null> {
  try {
    const { auth } = getFirebaseBrowserClient();
    await auth.authStateReady();
    const user = auth.currentUser;
    const phone = lastTenDigits(phoneNumber);
    return user?.email && phone.length === 10 && lastTenDigits(user.phoneNumber) === phone &&
      user.providerData.some((provider) => provider.providerId === "password") ? user : null;
  } catch {
    return null;
  }
}

/** Re-authenticates with the current password, then saves the new one. Throws an Error whose message can be shown. */
export async function changePassword(phoneNumber: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await passwordUser(phoneNumber);
  if (!user?.email) throw new Error(PASSWORD_CHANGE_NEEDS_EMAIL);
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
    await user.getIdToken(true);
  } catch {
    throw new Error(PASSWORD_CHANGE_FAILED);
  }
}
