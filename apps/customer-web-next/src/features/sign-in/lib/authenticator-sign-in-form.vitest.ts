// @vitest-environment jsdom
// Synthetic staff account; Firebase and the session BFF are mocked.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AuthenticatorSignInForm,
  authenticatorSignInError,
} from "../components/authenticator-sign-in-form";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  resolver: vi.fn(),
  multiFactor: vi.fn(),
  generateSecret: vi.fn(),
  forEnrollment: vi.fn(),
  forSignIn: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  getMultiFactorResolver: mocks.resolver,
  multiFactor: mocks.multiFactor,
  TotpMultiFactorGenerator: {
    FACTOR_ID: "totp",
    generateSecret: mocks.generateSecret,
    assertionForEnrollment: mocks.forEnrollment,
    assertionForSignIn: mocks.forSignIn,
  },
}));
vi.mock("@/features/auth/lib/firebase-client", () => ({
  getFirebaseBrowserClient: () => ({ auth: {} }),
}));

const firebaseError = (code: string) =>
  Object.assign(new Error(`Firebase: provider detail (${code}).`), { code });
const resolved = { user: { getIdToken: vi.fn().mockResolvedValue("resolved-token") } };
let resolveSignIn: ReturnType<typeof vi.fn>;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  resolveSignIn = vi.fn().mockResolvedValue(resolved);
  mocks.resolver.mockReturnValue({
    hints: [
      { factorId: "phone", uid: "p1" },
      { factorId: "totp", uid: "h1" },
    ],
    resolveSignIn,
  });
  mocks.forSignIn.mockReturnValue("sign-in-assertion");
  fetcher = vi.fn<typeof fetch>(async () => Response.json({ identity: {} }));
  vi.stubGlobal("fetch", fetcher);
  const browser = window;
  vi.stubGlobal(
    "window",
    new Proxy(browser, {
      get: (target, key) =>
        key === "location" ? { replace: mocks.navigate } : Reflect.get(target, key, target),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function signIn() {
  render(createElement(AuthenticatorSignInForm, { returnTo: "/admin/orders" }));
  fireEvent.change(screen.getByLabelText("Staff email"), {
    target: { value: "staff@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}
const enterCode = async (code: string) =>
  fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: code } });

it("signs an enrolled administrator in with the resolver-issued token", async () => {
  mocks.signIn.mockRejectedValue(firebaseError("auth/multi-factor-auth-required"));
  signIn();
  await enterCode("123456");
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/admin/orders"));
  expect(mocks.signIn).toHaveBeenCalledWith({}, "staff@example.test", "synthetic-password");
  expect(mocks.forSignIn).toHaveBeenCalledWith("h1", "123456");
  expect(resolveSignIn).toHaveBeenCalledWith("sign-in-assertion");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe("/api/auth/session");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
    firebaseIdToken: "resolved-token",
  });
});

it("enrols a new administrator, then signs in with a fresh code", async () => {
  const user = { email: "staff@example.test" };
  const enroll = vi.fn().mockResolvedValue(undefined);
  mocks.signIn
    .mockResolvedValueOnce({ user })
    .mockRejectedValueOnce(firebaseError("auth/multi-factor-auth-required"));
  mocks.multiFactor.mockReturnValue({
    getSession: vi.fn().mockResolvedValue("mfa-session"),
    enroll,
  });
  const secret = {
    secretKey: "ABCDEFGHIJKLMNOP",
    generateQrCodeUrl: vi.fn().mockReturnValue("otpauth://totp/Craves%20Admin:staff"),
  };
  mocks.generateSecret.mockResolvedValue(secret);
  mocks.forEnrollment.mockReturnValue("enrol-assertion");
  signIn();
  expect(await screen.findByText("ABCD EFGH IJKL MNOP")).toBeTruthy();
  expect(mocks.generateSecret).toHaveBeenCalledWith("mfa-session");
  expect(screen.getByRole("link", { name: "Add to authenticator app" }).getAttribute("href")).toBe(
    "otpauth://totp/Craves%20Admin:staff",
  );
  expect(secret.generateQrCodeUrl).toHaveBeenCalledWith("staff@example.test", "Craves Admin");
  await enterCode("111111");
  await waitFor(() => expect(enroll).toHaveBeenCalledWith("enrol-assertion", "Authenticator app"));
  expect(mocks.forEnrollment).toHaveBeenCalledWith(secret, "111111");
  expect(await screen.findByText(/Authenticator added/)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  await enterCode("222222");
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/admin/orders"));
  expect(mocks.forSignIn).toHaveBeenCalledWith("h1", "222222");
});

it("refuses an account whose only second factor is SMS without calling Craves", async () => {
  mocks.signIn.mockRejectedValue(firebaseError("auth/multi-factor-auth-required"));
  mocks.resolver.mockReturnValue({ hints: [{ factorId: "phone", uid: "p1" }], resolveSignIn });
  signIn();
  expect(
    await screen.findByText(
      "This account uses a different second factor. Ask Craves operations to reset it.",
    ),
  ).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});

it("shows the session service's reviewed message when Craves refuses the session", async () => {
  mocks.signIn.mockRejectedValue(firebaseError("auth/multi-factor-auth-required"));
  fetcher.mockResolvedValue(
    Response.json(
      {
        code: "ADMIN_SECOND_FACTOR_REQUIRED",
        message:
          "Administrator sign-in needs your staff email, password and authenticator app code.",
      },
      { status: 401 },
    ),
  );
  signIn();
  await enterCode("123456");
  expect(
    await screen.findByText(
      "Administrator sign-in needs your staff email, password and authenticator app code.",
    ),
  ).toBeTruthy();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("shows reviewed copy, never Firebase text", () => {
  expect(authenticatorSignInError(firebaseError("auth/invalid-credential"))).toBe(
    "Email or password is incorrect.",
  );
  expect(authenticatorSignInError(firebaseError("auth/invalid-verification-code"))).toBe(
    "That code didn’t match. Enter the latest code from your authenticator app.",
  );
  expect(authenticatorSignInError(firebaseError("auth/unverified-email"))).toBe(
    "Your staff email isn’t verified yet. Ask Craves operations to verify it.",
  );
  expect(authenticatorSignInError(firebaseError("auth/operation-not-allowed"))).toBe(
    "Authenticator sign-in isn’t available yet.",
  );
  expect(authenticatorSignInError(firebaseError("auth/internal-error"))).toBe(
    "We couldn’t sign you in. Please try again.",
  );
  expect(authenticatorSignInError(new Error("Firebase: provider detail"))).toBe(
    "We couldn’t sign you in. Please try again.",
  );
});
