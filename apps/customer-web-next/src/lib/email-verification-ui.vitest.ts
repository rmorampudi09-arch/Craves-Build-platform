// @vitest-environment jsdom
// All identities, codes and provider responses below are isolated fixtures; fetch and Firebase are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmailVerificationPanel } from "../components/auth/EmailVerificationPanel";
import { AuthModal } from "../components/auth/AuthModal";
import { EditProfileModal } from "../components/profile/EditProfileModal";
import { ChefApplicationWorkspace } from "../components/chef-application-workspace";
import { clearSession, getSession, setSessionIdentity } from "../services/auth/cravesAuth";
import type { EmailVerificationState } from "./email-verification-contract";

const phoneSignIn = vi.hoisted(() => vi.fn());
vi.mock("firebase/auth", () => ({
  RecaptchaVerifier: class { async render() { return 0; } clear() {} },
  signInWithPhoneNumber: phoneSignIn,
}));
vi.mock("./firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));

const id = "11111111-1111-4111-8111-111111111111";
const challenge = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const identity = { id, phoneNumber: "+10000000000", email: null, emailVerified: false, displayName: "Fixture", status: "ACTIVE", roles: ["CUSTOMER"] };
const profile = { id, registeredPhoneNumber: identity.phoneNumber, firstName: "Test", lastName: "Fixture", email: null, createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" };
const empty: EmailVerificationState = { email: null, emailVerified: false, emailRevision: 0, pending: null, serverTime: "2026-09-14T10:00:00Z" };
const pending: EmailVerificationState = { ...empty, pending: { challengeId: challenge, maskedEmail: "F***@example.invalid", expiresAt: "2026-09-14T10:10:00Z", resendAvailableAt: "2026-09-14T10:01:00Z", deliveryStatus: "ACCEPTED" } };
const verified: EmailVerificationState = { ...empty, email: "Fixture@example.invalid", emailVerified: true, emailRevision: 1 };
let current: EmailVerificationState;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  current = empty;
  setSessionIdentity({ ...identity, id: second });
  setSessionIdentity(identity);
  phoneSignIn.mockReset();
  phoneSignIn.mockResolvedValue({ confirm: async () => ({ user: { getIdToken: async () => "fixture-firebase-token" } }) });
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "/api/auth/session") return Response.json({ identity });
    if (url === "/api/customer/profile") return Response.json(profile);
    if (url === "/api/auth/email-verification") return Response.json(current);
    if (url.endsWith("/challenges")) { current = { ...pending, email: current.email, emailVerified: current.emailVerified, emailRevision: current.emailRevision }; return Response.json(current, { status: 202 }); }
    if (url.endsWith("/resend")) { current = { ...pending, pending: { ...pending.pending!, challengeId: second } }; return Response.json(current, { status: 202 }); }
    if (url.endsWith("/verify") && init?.method === "POST") { current = verified; return Response.json(current); }
    throw new Error("Unexpected test route");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function button(name: string | RegExp): HTMLButtonElement { return screen.getByRole("button", { name }) as HTMLButtonElement; }
async function register(role: "customer" | "chef", email = "") {
  const authenticated = vi.fn();
  render(createElement(AuthModal, { open: true, mode: "register", initialAccountMode: role, lockAccountMode: true, onClose: vi.fn(), onSwitchMode: vi.fn(), onAuthenticated: authenticated }));
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Test" } });
  fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Fixture" } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "0000000000" } });
  fireEvent.click(button("Send verification code"));
  await screen.findByLabelText("Six-digit verification code");
  fireEvent.change(screen.getByLabelText("Six-digit verification code"), { target: { value: "000000" } });
  fireEvent.click(button(`Verify and join as ${role === "chef" ? "Home Chef" : "Customer"}`));
  await screen.findByText("Your phone is verified");
  await waitFor(() => expect(button("Refresh verification status").disabled).toBe(false));
  return authenticated;
}
async function sendAndVerify() {
  fireEvent.click(button("Send email code"));
  await screen.findByLabelText("Six-digit email code");
  await waitFor(() => expect(button("Refresh verification status").disabled).toBe(false));
  fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
  fireEvent.click(button("Verify email"));
  await screen.findByText("Email verified successfully.");
}

describe("registration and verify-later email UI", () => {
  it("allows customer registration without email and sends no email until explicitly requested", async () => {
    const authenticated = await register("customer");
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/challenges"))).toHaveLength(0);
    const profileSave = fetcher.mock.calls.find(([url, init]) => url === "/api/customer/profile" && init?.method === "PUT");
    expect(JSON.parse(String(profileSave?.[1]?.body))).toEqual({ firstName: "Test", lastName: "Fixture" });
    fireEvent.click(button("Verify later and continue"));
    expect(authenticated).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: false }), "customer");
  });
  it("lets a customer verify their supplied registration email after phone verification", async () => {
    const authenticated = await register("customer", "Fixture@example.invalid");
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("Fixture@example.invalid");
    await sendAndVerify();
    fireEvent.click(button("Continue to Craves"));
    expect(authenticated).toHaveBeenCalledWith(expect.objectContaining({ email: verified.email, emailVerified: true }), "customer");
  });
  it("keeps chef completion blocked until Auth confirms the email", async () => {
    const authenticated = await register("chef", "Fixture@example.invalid");
    expect(button("Continue to chef application").disabled).toBe(true);
    expect(authenticated).not.toHaveBeenCalled();
    await sendAndVerify();
    expect(button("Continue to chef application").disabled).toBe(false);
    fireEvent.click(button("Continue to chef application"));
    expect(authenticated).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: true }), "chef");
  });
  it("does not complete customer registration with a cached phone identity after logout", async () => {
    const authenticated = await register("customer");
    fetcher.mockImplementation(async (url) => url === "/api/auth/logout" ? Response.json({ signedOut: true }) : Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    await act(async () => { await clearSession(); });
    expect(screen.queryByRole("button", { name: "Verify later and continue" })).toBeNull();
    expect(authenticated).not.toHaveBeenCalled();
  });
  it("does not complete the prior owner's chef registration after an account switch", async () => {
    const authenticated = await register("chef", "Fixture@example.invalid");
    await sendAndVerify();
    act(() => setSessionIdentity({ ...identity, id: second }));
    expect(screen.queryByRole("button", { name: "Continue to chef application" })).toBeNull();
    expect(authenticated).not.toHaveBeenCalled();
  });
  it("requires an email when registering as a chef", async () => {
    render(createElement(AuthModal, { open: true, mode: "register", initialAccountMode: "chef", lockAccountMode: true, onClose: vi.fn(), onSwitchMode: vi.fn() }));
    const email = screen.getByLabelText(/^Email/) as HTMLInputElement;
    expect(email.required).toBe(true);
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Fixture" } });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "0000000000" } });
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Enter an email address for your chef account.");
    expect(phoneSignIn).not.toHaveBeenCalled();
  });
  it("supports verification later inside profile editing without sending the email as a profile field", async () => {
    render(createElement(EditProfileModal, { open: true, profile, onClose: vi.fn(), onSaved: vi.fn() }));
    await waitFor(() => expect(button("Refresh verification status").disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "Fixture@example.invalid" } });
    await sendAndVerify();
    fireEvent.click(button("Save changes"));
    await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url === "/api/customer/profile" && init?.method === "PUT")).toBe(true));
    const saved = fetcher.mock.calls.find(([url, init]) => url === "/api/customer/profile" && init?.method === "PUT");
    expect(JSON.parse(String(saved?.[1]?.body))).toEqual({ firstName: "Test", lastName: "Fixture" });
    expect(getSession()?.email).toBe(verified.email); expect(getSession()?.emailVerified).toBe(true);
  });
  it("gates chef application submission and uses current verified Auth email instead of saved projection", async () => {
    const application = { ...profile, email: "stale@example.invalid", addressLine1: "Fixture road", addressLine2: null, landmark: null,
      city: "Fixture city", state: "Fixture state", postalCode: null, latitude: null, longitude: null, status: "NOT_SUBMITTED", reviewedAt: null, documents: [] };
    fetcher.mockImplementation(async (url, init) => {
      if (url === "/api/chef/application") return Response.json({ ...application, status: init?.method === "POST" ? "PENDING" : "NOT_SUBMITTED" });
      if (url === "/api/customer/profile") return Response.json({ ...profile, email: "projection@example.invalid" });
      if (url === "/api/customer/addresses") return Response.json([]);
      return Response.json(current);
    });
    render(createElement(ChefApplicationWorkspace));
    await waitFor(() => expect(button("Refresh verification status").disabled).toBe(false));
    expect(button("Submit application").disabled).toBe(true);
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Verify your email before submitting your chef application.");
    expect(fetcher.mock.calls.some(([url, init]) => url === "/api/chef/application" && init?.method === "POST")).toBe(false);
    current = verified;
    fireEvent.click(button("Refresh verification status"));
    await waitFor(() => expect(button("Submit application").disabled).toBe(false));
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url === "/api/chef/application" && init?.method === "POST")).toBe(true));
    const submitted = fetcher.mock.calls.find(([url, init]) => url === "/api/chef/application" && init?.method === "POST");
    expect(JSON.parse(String(submitted?.[1]?.body)).email).toBe(verified.email);
  });
});

describe("email OTP lifecycle UI", () => {
  it("counts down from server time and resends by challenge after the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z")); // deliberately skew the browser clock
    current = pending;
    // Flush the fetched state AND its interval effect before moving fake time.
    // A DOM find can resolve at commit, before the passive effect is installed.
    await act(async () => { render(createElement(EmailVerificationPanel)); });
    expect(screen.getByText("Code expires in 10m 0s.")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(1);
    expect(button("Resend in 60s").disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(button("Resend in 1s").disabled).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/resend"))).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(button("Resend email code").disabled).toBe(false);
    fireEvent.click(button("Resend email code"));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/resend"))).toBe(true));
    const sent = fetcher.mock.calls.find(([url]) => String(url).endsWith("/resend"));
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ challengeId: challenge, requestId: expect.any(String) });
  });
  it("shows an expired code and prevents verification while allowing resend", async () => {
    current = { ...pending, serverTime: "2026-09-14T10:10:00Z" };
    render(createElement(EmailVerificationPanel));
    await screen.findByText("This code has expired. Request a new code.");
    expect(button("Verify email").disabled).toBe(true); expect(button("Resend email code").disabled).toBe(false);
  });
  it("shows a wrong-code message, clears the code and refreshes authoritative status", async () => {
    current = pending;
    fetcher.mockImplementation(async (url) => String(url).endsWith("/verify") ? Response.json({ code: "EMAIL_CODE_INVALID" }, { status: 400 }) : Response.json(current));
    render(createElement(EmailVerificationPanel));
    await screen.findByLabelText("Six-digit email code");
    fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
    fireEvent.click(button("Verify email"));
    await screen.findByText(/This code is incorrect, expired or already used/);
    expect((screen.getByLabelText("Six-digit email code") as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/email-verification")).toHaveLength(2));
    expect(getSession()?.emailVerified).toBe(false);
  });
  it("retries an uncertain send with the same receipt instead of generating another message", async () => {
    let attempts = 0;
    fetcher.mockImplementation(async (url) => {
      if (String(url).endsWith("/challenges")) { attempts += 1; if (attempts === 1) throw new Error("offline"); return Response.json(pending, { status: 202 }); }
      return Response.json(empty);
    });
    render(createElement(EmailVerificationPanel, { initialEmail: "Fixture@example.invalid" }));
    await waitFor(() => expect(button("Send email code").disabled).toBe(false));
    fireEvent.click(button("Send email code"));
    await screen.findByRole("button", { name: "Retry send request" });
    expect(button("Send email code").disabled).toBe(true);
    fireEvent.click(button("Retry send request"));
    await screen.findByLabelText("Six-digit email code");
    const sends = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/challenges"));
    expect(sends).toHaveLength(2); expect(sends[0][1]?.body).toBe(sends[1][1]?.body);
  });
  it("keeps an existing verified email while a corrected address is pending", async () => {
    current = verified;
    render(createElement(EmailVerificationPanel));
    await screen.findByText(`Verified email: ${verified.email}`);
    fireEvent.change(screen.getByLabelText("Change email"), { target: { value: "Replacement@example.invalid" } });
    fireEvent.click(button("Send email code"));
    await screen.findByText("Your current verified email stays active until you confirm the replacement.");
    expect(getSession()?.email).toBe(verified.email); expect(getSession()?.emailVerified).toBe(true);
  });
  it("shows session-expiry guidance and recovers verified state on a successful refresh", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    render(createElement(EmailVerificationPanel, { initialEmail: "Fixture@example.invalid" }));
    await screen.findByText(/Your session has expired/);
    expect(button("Send email code").disabled).toBe(true);
    current = verified;
    act(() => setSessionIdentity(identity)); // Real re-authentication establishes the new session generation.
    await screen.findByText(`Verified email: ${verified.email}`);
    expect(getSession()?.emailVerified).toBe(true);
  });
  it("withdraws the parent chef completion gate when the session expires after verification", async () => {
    current = verified;
    const observed = vi.fn();
    render(createElement(EmailVerificationPanel, { required: true, onStateChange: observed }));
    await screen.findByText(`Verified email: ${verified.email}`);
    fetcher.mockResolvedValueOnce(Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    fireEvent.click(button("Refresh verification status"));
    await screen.findByText(/Your session has expired/);
    expect(observed).toHaveBeenLastCalledWith(null);
  });
  it("shows a rate-limit message without claiming a code was sent", async () => {
    fetcher.mockImplementation(async (url) => String(url).endsWith("/challenges") ? Response.json({ code: "EMAIL_VERIFICATION_RATE_LIMITED" }, { status: 429 }) : Response.json(empty));
    render(createElement(EmailVerificationPanel, { initialEmail: "Fixture@example.invalid" }));
    await waitFor(() => expect(button("Send email code").disabled).toBe(false));
    fireEvent.click(button("Send email code"));
    await screen.findByText(/Too many attempts/);
    expect(screen.queryByLabelText("Six-digit email code")).toBeNull(); expect(getSession()?.emailVerified).toBe(false);
  });
});
