// @vitest-environment jsdom
// "Use email & password" on the shared sign-in form (/sign-in, /chef/sign-in); Firebase and Craves are mocked.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PhoneAuthForm } from "../components/phone-auth-form";
import { isChefModeTab, markChefModeVerified } from "@/features/chef/lib/chef-mode";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), reset: vi.fn(), signOut: vi.fn() }));
vi.mock("firebase/auth", () => ({
  RecaptchaVerifier: class { render = vi.fn(); clear = vi.fn(); },
  signInWithPhoneNumber: vi.fn(),
  signInWithEmailAndPassword: mocks.signIn,
  sendPasswordResetEmail: mocks.reset,
  signOut: mocks.signOut,
}));
vi.mock("@/shared/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));
vi.mock("@/features/auth/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));
vi.mock("@/features/sign-in/lib/msg91-browser", () => ({ beginMsg91PhoneSignIn: vi.fn(), parkMsg91Captcha: vi.fn() }));

const identity = { id: "31111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", roles: ["CHEF"], status: "ACTIVE" };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const mock of Object.values(mocks)) mock.mockReset();
});

const emailField = () => screen.getByLabelText("Email address") as HTMLInputElement;
const passwordField = () => screen.getByLabelText("Password") as HTMLInputElement;
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });

it("offers email & password to chefs and signs in through the same session exchange and Chef Mode hand-off", async () => {
  mocks.signIn.mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue("firebase-id-token") } });
  const fetcher = vi.fn(async () => Response.json({ identity }));
  vi.stubGlobal("fetch", fetcher);
  const onSignedIn = vi.fn(() => new Promise<void>(() => {}));
  render(createElement(PhoneAuthForm, { returnTo: "/chef", onSignedIn }));

  fireEvent.click(screen.getByRole("button", { name: "Use email & password" }));
  expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy();
  expect(document.activeElement).toBe(emailField());
  expect([emailField().type, emailField().autocomplete]).toEqual(["email", "username"]);
  expect([passwordField().type, passwordField().autocomplete]).toEqual(["password", "current-password"]);
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(passwordField().type).toBe("text");
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));

  // Checked on submit, with the reason under the field and focus on the first one to fix.
  fireEvent.click(screen.getByRole("button", { name: "Log in as Chef" }));
  expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
  expect(screen.getByText("Password must be at least 8 characters.")).toBeTruthy();
  expect(emailField().getAttribute("aria-describedby")).toBe("sign-in-email-error");
  expect(document.activeElement).toBe(emailField());
  expect(mocks.signIn).not.toHaveBeenCalled();

  type(emailField(), "chef@example.com");
  type(passwordField(), "correct horse");
  fireEvent.click(screen.getByRole("button", { name: "Log in as Chef" }));
  await waitFor(() => expect(onSignedIn).toHaveBeenCalledExactlyOnceWith(identity));
  expect(fetcher).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "POST", body: JSON.stringify({ firebaseIdToken: "firebase-id-token" }) }));
  expect(screen.getByRole("button", { name: "Opening…" }).hasAttribute("disabled")).toBe(true);
  // Nothing else opens while the kitchen loads.
  expect(screen.getByRole("button", { name: "Forgot password?" }).hasAttribute("disabled")).toBe(true);
});

it.each([["/orders", "/orders"], ["//evil.example", "/"]])("opens a customer's return path %s exactly as after an OTP", async (returnTo, opened) => {
  const customer = { ...identity, roles: ["CUSTOMER"] };
  mocks.signIn.mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue("token") } });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ identity: customer })));
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, replace });
  markChefModeVerified(customer.id);
  render(createElement(PhoneAuthForm, { returnTo, email: true }));
  type(emailField(), "asha@example.com");
  type(passwordField(), "12345678");
  fireEvent.click(screen.getByRole("button", { name: "Log in as Customer" }));
  await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(opened));
  // This tab leaves Chef Mode, so the customer app opens.
  expect(isChefModeTab(customer.id)).toBe(false);
});

it("shows one message for a wrong password or an unknown email and keeps the form", async () => {
  let reject!: (error: unknown) => void;
  mocks.signIn.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  render(createElement(PhoneAuthForm, { returnTo: "/home", email: true }));
  type(emailField(), "someone@example.com");
  type(passwordField(), "12345678");
  passwordField().focus();
  fireEvent.click(screen.getByRole("button", { name: "Log in as Customer" }));
  // Read-only while checking, never disabled, so the focused field keeps focus.
  expect([passwordField().readOnly, passwordField().disabled]).toEqual([true, false]);
  reject(Object.assign(new Error("Firebase: Error (auth/user-not-found)."), { code: "auth/user-not-found" }));
  expect((await screen.findByRole("alert")).textContent).toBe("The email or password is incorrect.");
  expect(document.activeElement).toBe(passwordField());
  // Typing again clears it.
  type(passwordField(), "123456789");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("sends an account without a verified phone number back to phone OTP with the reason", async () => {
  mocks.signIn.mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue("token") } });
  mocks.signOut.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "PHONE_NUMBER_MISSING" }, { status: 401 })));
  render(createElement(PhoneAuthForm, { returnTo: "/home", email: true }));
  type(emailField(), "asha@example.com");
  type(passwordField(), "12345678");
  fireEvent.click(screen.getByRole("button", { name: "Log in as Customer" }));
  // An alert, so it is read out as the phone view appears, and the number field it describes takes focus.
  expect((await screen.findByRole("alert")).textContent).toBe("This Craves account must have a verified phone number before email sign-in can continue.");
  const phone = screen.getByLabelText("Mobile number");
  expect(phone.getAttribute("aria-describedby")).toBe("phone-notice");
  await waitFor(() => expect(document.activeElement).toBe(phone));
  expect(mocks.signOut).toHaveBeenCalledOnce();
});

it("resets a password with the same neutral confirmation whether or not the account exists", async () => {
  mocks.reset.mockRejectedValue(Object.assign(new Error("Firebase: Error (auth/user-not-found)."), { code: "auth/user-not-found" }));
  render(createElement(PhoneAuthForm, { returnTo: "/home", email: true }));
  type(emailField(), "nobody@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  expect(screen.getByRole("heading", { name: "Forgot your password?" })).toBeTruthy();
  expect([emailField().value, emailField().autocomplete]).toEqual(["nobody@example.com", "email"]);
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect((await screen.findByRole("status")).textContent).toBe("If a Craves account exists for this email, we will send a secure password reset link shortly.");
  expect(screen.getByRole("heading", { name: "Password Reset Sent" })).toBeTruthy();
  expect(mocks.reset).toHaveBeenCalledExactlyOnceWith({}, "nobody@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Back to login" }));
  expect(emailField().value).toBe("nobody@example.com");
});

it("keeps the admin portal on phone OTP only", () => {
  render(createElement(PhoneAuthForm, { returnTo: "/admin", anyCountry: true, email: true }));
  expect(screen.getByLabelText("Mobile number")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use email & password" })).toBeNull();
});
