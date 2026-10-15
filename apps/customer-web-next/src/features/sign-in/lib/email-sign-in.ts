"use client";

import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import { z } from "zod";
import type { CravesIdentity } from "@/features/auth/lib/auth-contract";
import { getFirebaseBrowserClient } from "@/shared/lib/firebase-client";

// Copy, rules and Firebase error mapping follow the app: emailSignInPolicy, passwordRecoveryPolicy, firebaseAuthError.
const emailSchema = z.string().trim().email("Enter a valid email address.");

export const PASSWORD_RECOVERY_NEUTRAL_MESSAGE =
  "If a Craves account exists for this email, we will send a secure password reset link shortly.";
export const PHONE_VERIFICATION_REQUIRED =
  "This Craves account must have a verified phone number before email sign-in can continue.";
const NETWORK = "We could not reach the authentication service. Check your connection and try again.";

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function emailError(email: string): string | undefined {
  return emailSchema.safeParse(normalizeEmail(email)).success ? undefined : "Enter a valid email address.";
}

export function emailSignInErrors(email: string, password: string): { email?: string; password?: string } {
  return {
    email: emailError(email),
    password: password.length < 8 ? "Password must be at least 8 characters." : undefined,
  };
}

type Failure = "credentials" | "disabled" | "rate" | "network" | "other";

function firebaseFailure(error: unknown): Failure {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  // A wrong password and an unknown email read the same, so the form never reveals which accounts exist.
  if (/wrong-password|invalid-(login-)?credential|user-not-found|invalid-email/.test(code)) return "credentials";
  if (code.includes("user-disabled")) return "disabled";
  if (/too-many-requests|quota-exceeded/.test(code)) return "rate";
  if (code.includes("network-request-failed")) return "network";
  return "other";
}

const SIGN_IN_COPY: Record<Failure, string> = {
  credentials: "The email or password is incorrect.",
  disabled: "This account is currently unavailable.",
  rate: "Too many verification attempts. Please wait before trying again.",
  network: NETWORK,
  other: "Authentication could not be completed.",
};

/** null: show the neutral "sent" confirmation, exactly as for an accepted request. */
const RECOVERY_COPY: Record<Failure, string | null> = {
  credentials: null,
  disabled: null,
  rate: "Too many password recovery requests. Please wait before trying again.",
  network: NETWORK,
  other: "We could not process password recovery right now. Please try again.",
};

export const emailSignInError = (error: unknown) => SIGN_IN_COPY[firebaseFailure(error)];
export const passwordRecoveryError = (error: unknown) => RECOVERY_COPY[firebaseFailure(error)];

/** The app's wording for a refused session exchange. */
function exchangeError(status: number | undefined): string {
  if (!status) return "We could not reach Craves. Check your connection and try again.";
  if (status === 401) return "Your session could not be verified. Please sign in again.";
  if (status === 403) return "This action is not available for your account.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "Craves is temporarily unavailable. Please try again.";
  return "We could not complete that request.";
}

/** The account has no verified phone number yet: the app sends the person to phone OTP. */
export class PhoneVerificationRequiredError extends Error {
  constructor() {
    super(PHONE_VERIFICATION_REQUIRED);
    this.name = "PhoneVerificationRequiredError";
  }
}

/**
 * Firebase email sign-in, then the same Craves session exchange as phone OTP (POST /api/auth/session).
 * Throws an Error whose message can be shown.
 */
export async function signInWithEmail(email: string, password: string): Promise<CravesIdentity> {
  let auth: Auth;
  let firebaseIdToken: string;
  try {
    auth = getFirebaseBrowserClient().auth;
    const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
    firebaseIdToken = await credential.user.getIdToken(true);
  } catch (error) {
    throw new Error(emailSignInError(error));
  }
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ firebaseIdToken }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { identity?: CravesIdentity; code?: string } | null;
  if (response?.ok && body?.identity?.id) return body.identity;
  // Like the app: a refused exchange leaves no half-finished Firebase sign-in behind.
  await signOut(auth).catch(() => undefined);
  if (body?.code === "PHONE_NUMBER_MISSING") throw new PhoneVerificationRequiredError();
  throw new Error(exchangeError(response?.status));
}

/** Resolves for every account-specific outcome, so the screen cannot tell whether the email is registered. */
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebaseBrowserClient().auth, normalizeEmail(email));
  } catch (error) {
    const message = passwordRecoveryError(error);
    if (message) throw new Error(message);
  }
}
