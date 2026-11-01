// Email & password sign-in and password recovery with Firebase mocked; no provider or backend is contacted.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emailSignInErrors,
  emailSignInError,
  passwordRecoveryError,
  PhoneVerificationRequiredError,
  sendPasswordReset,
  signInWithEmail,
} from "./email-sign-in";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), reset: vi.fn(), signOut: vi.fn() }));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  sendPasswordResetEmail: mocks.reset,
  signOut: mocks.signOut,
}));
vi.mock("@/shared/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: { name: "auth" } }) }));

const identity = { id: "31111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", roles: ["CUSTOMER"], status: "ACTIVE" };
const firebaseError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

afterEach(() => {
  vi.unstubAllGlobals();
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("email sign-in rules", () => {
  it("checks the email and an 8-character password with the app's wording", () => {
    expect(emailSignInErrors("", "")).toEqual({ email: "Enter a valid email address.", password: "Password must be at least 8 characters." });
    expect(emailSignInErrors("asha@", "1234567")).toEqual({ email: "Enter a valid email address.", password: "Password must be at least 8 characters." });
    expect(emailSignInErrors("  Asha@Example.COM ", "12345678")).toEqual({ email: undefined, password: undefined });
  });

  it("gives a wrong password and an unknown email the same message", () => {
    for (const code of ["auth/wrong-password", "auth/user-not-found", "auth/invalid-credential", "auth/invalid-login-credentials", "auth/invalid-email"])
      expect(emailSignInError(firebaseError(code)), code).toBe("The email or password is incorrect.");
    expect(emailSignInError(firebaseError("auth/user-disabled"))).toBe("This account is currently unavailable.");
    expect(emailSignInError(firebaseError("auth/too-many-requests"))).toBe("Too many verification attempts. Please wait before trying again.");
    expect(emailSignInError(firebaseError("auth/network-request-failed"))).toBe("We could not reach the authentication service. Check your connection and try again.");
    expect(emailSignInError(new Error("secret provider text"))).toBe("Authentication could not be completed.");
  });

  it("never tells password recovery whether an account exists", () => {
    for (const code of ["auth/user-not-found", "auth/invalid-email", "auth/user-disabled", "auth/invalid-credential"])
      expect(passwordRecoveryError(firebaseError(code)), code).toBeNull();
    expect(passwordRecoveryError(firebaseError("auth/too-many-requests"))).toBe("Too many password recovery requests. Please wait before trying again.");
    expect(passwordRecoveryError(firebaseError("auth/network-request-failed"))).toBe("We could not reach the authentication service. Check your connection and try again.");
    expect(passwordRecoveryError(firebaseError("auth/internal-error"))).toBe("We could not process password recovery right now. Please try again.");
  });
});

describe("signInWithEmail", () => {
  it("exchanges the Firebase ID token for the Craves session exactly as phone OTP does", async () => {
    const getIdToken = vi.fn().mockResolvedValue("firebase-id-token");
    mocks.signIn.mockResolvedValue({ user: { getIdToken } });
    const fetcher = vi.fn(async () => Response.json({ identity }));
    vi.stubGlobal("fetch", fetcher);
    await expect(signInWithEmail(" Asha@Example.com ", "correct horse")).resolves.toEqual(identity);
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({ name: "auth" }, "asha@example.com", "correct horse");
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ firebaseIdToken: "firebase-id-token" }),
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("stops at Firebase on a wrong password, without calling Craves", async () => {
    mocks.signIn.mockRejectedValue(firebaseError("auth/wrong-password"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(signInWithEmail("asha@example.com", "wrong-password")).rejects.toThrow("The email or password is incorrect.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends an account without a verified phone number to phone OTP and signs Firebase out", async () => {
    mocks.signIn.mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue("token") } });
    mocks.signOut.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "PHONE_NUMBER_MISSING", message: "OTP copy" }, { status: 401 })));
    const failure = await signInWithEmail("asha@example.com", "12345678").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PhoneVerificationRequiredError);
    expect((failure as Error).message).toBe("This Craves account must have a verified phone number before email sign-in can continue.");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("explains a refused or unreachable exchange in the app's words, never the OTP wording", async () => {
    mocks.signIn.mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue("token") } });
    mocks.signOut.mockResolvedValue(undefined);
    for (const [status, message] of [
      [429, "Too many requests. Please wait a moment and try again."],
      [403, "This action is not available for your account."],
      [503, "Craves is temporarily unavailable. Please try again."],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "SIGN_IN_FAILED", message: "OTP copy" }, { status })));
      await expect(signInWithEmail("asha@example.com", "12345678")).rejects.toThrow(message);
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(signInWithEmail("asha@example.com", "12345678")).rejects.toThrow("We could not reach Craves. Check your connection and try again.");
    expect(mocks.signOut).toHaveBeenCalledTimes(4);
  });
});

describe("sendPasswordReset", () => {
  it("resolves the same way whether or not the email has an account", async () => {
    mocks.reset.mockResolvedValueOnce(undefined).mockRejectedValueOnce(firebaseError("auth/user-not-found"));
    await expect(sendPasswordReset(" Asha@Example.com")).resolves.toBeUndefined();
    await expect(sendPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(mocks.reset).toHaveBeenNthCalledWith(1, { name: "auth" }, "asha@example.com");
  });

  it("reports only a rate limit, a network problem or an outage", async () => {
    mocks.reset.mockRejectedValue(firebaseError("auth/too-many-requests"));
    await expect(sendPasswordReset("asha@example.com")).rejects.toThrow("Too many password recovery requests. Please wait before trying again.");
  });
});
