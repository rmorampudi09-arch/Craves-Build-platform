// @vitest-environment jsdom
// Deferred same-origin requests only. No live Auth, Firebase, email or provider calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmailVerificationPanel } from "../components/auth/EmailVerificationPanel";
import { EditProfileModal } from "../components/profile/EditProfileModal";
import { clearSession, getSession, setSessionEmailVerification, setSessionIdentity } from "../services/auth/cravesAuth";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const challenge = "33333333-3333-4333-8333-333333333333";
const identity = { id, phoneNumber: "+10000000000", email: null, emailVerified: false, displayName: "Fixture A", status: "ACTIVE", roles: ["CUSTOMER"] };
const empty = { email: null, emailVerified: false, emailRevision: 0, pending: null, serverTime: "2026-09-14T10:00:00Z" };
const verified = { ...empty, email: "prior-owner@example.invalid", emailVerified: true, emailRevision: 1 };
const pending = { ...empty, pending: { challengeId: challenge, maskedEmail: "p***@example.invalid", expiresAt: "2026-09-14T10:10:00Z", resendAvailableAt: "2026-09-14T10:01:00Z", deliveryStatus: "ACCEPTED" as const } };
function deferred() { let resolve!: (response: Response) => void; const promise = new Promise<Response>((done) => { resolve = done; }); return { promise, resolve }; }
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  setSessionIdentity(identity);
  fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith("/logout") ? Response.json({ signedOut: true }) : Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

for (const transition of ["logout", "different owner", "same owner new session"] as const) {
  describe(`verification races during ${transition}`, () => {
    async function changeSession() {
      if (transition === "logout") await clearSession();
      else setSessionIdentity({ ...identity, id: transition === "different owner" ? other : id });
    }
    it("discards a delayed GET before rendering private email or changing the chef gate", async () => {
      const delayed = deferred(); let gets = 0; const changed = vi.fn();
      fetcher.mockImplementation(async (url) => {
        if (url === "/api/auth/email-verification") return ++gets === 1 ? delayed.promise : Response.json(empty);
        if (url === "/api/auth/logout") return Response.json({ signedOut: true });
        return Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
      });
      render(createElement(EmailVerificationPanel, { required: true, onStateChange: changed }));
      await waitFor(() => expect(gets).toBe(1));
      await act(changeSession);
      await act(async () => delayed.resolve(Response.json(verified)));
      expect(screen.queryByText(`Verified email: ${verified.email}`)).toBeNull();
      expect(changed.mock.calls.some(([state]) => state?.email === verified.email)).toBe(false);
      expect(getSession()?.email).not.toBe(verified.email);
      expect(screen.queryByLabelText("Six-digit email code")).toBeNull();
    });
    it("discards a delayed successful verify and clears its code, retry receipt and callbacks", async () => {
      const delayed = deferred(); let gets = 0; const changed = vi.fn(); const completed = vi.fn();
      fetcher.mockImplementation(async (url) => {
        if (url === "/api/auth/email-verification") return Response.json(++gets === 1 ? pending : empty);
        if (String(url).endsWith("/verify")) return delayed.promise;
        if (String(url).endsWith("/logout")) return Response.json({ signedOut: true });
        return Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
      });
      render(createElement(EmailVerificationPanel, { required: true, onStateChange: changed, onVerified: completed }));
      fireEvent.change(await screen.findByLabelText("Six-digit email code"), { target: { value: "000123" } });
      fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
      await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/verify"))).toBe(true));
      await act(changeSession);
      await act(async () => delayed.resolve(Response.json(verified)));
      expect(completed).not.toHaveBeenCalled(); expect(screen.queryByText("Email verified successfully.")).toBeNull();
      expect(changed.mock.calls.some(([state]) => state?.email === verified.email)).toBe(false);
      expect(screen.queryByLabelText("Six-digit email code")).toBeNull(); expect(getSession()?.email).not.toBe(verified.email);
    });
  });
}

it("uses the versioned canonical state if another panel verified during a delayed GET", async () => {
  const delayed = deferred(); const changed = vi.fn(); fetcher.mockReturnValue(delayed.promise);
  render(createElement(EmailVerificationPanel, { onStateChange: changed }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  act(() => setSessionEmailVerification(id, { ...verified, email: "current@example.invalid", emailRevision: 3 }));
  await act(async () => delayed.resolve(Response.json(verified)));
  await screen.findByText("Verified email: current@example.invalid");
  expect(screen.queryByText(`Verified email: ${verified.email}`)).toBeNull();
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ email: "current@example.invalid", emailRevision: 3 }));
});

it("clears the displayed prior owner immediately while the new owner GET is still pending", async () => {
  const delayed = deferred(); fetcher.mockResolvedValueOnce(Response.json(verified)).mockReturnValue(delayed.promise);
  render(createElement(EmailVerificationPanel)); await screen.findByText(`Verified email: ${verified.email}`);
  act(() => setSessionIdentity({ ...identity, id: other }));
  expect(screen.queryByText(`Verified email: ${verified.email}`)).toBeNull();
  expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("");
  await act(async () => delayed.resolve(Response.json(empty)));
});

it("does not apply a saved profile response or success callback to a different session", async () => {
  const delayed = deferred(); const saved = vi.fn(); const closed = vi.fn();
  fetcher.mockImplementation(async (url, init) => url === "/api/customer/profile" && init?.method === "PUT" ? delayed.promise : Response.json(empty));
  const profile = { id, registeredPhoneNumber: identity.phoneNumber, firstName: "Prior", lastName: "Owner", email: null, createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" };
  render(createElement(EditProfileModal, { open: true, profile, onClose: closed, onSaved: saved }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url === "/api/customer/profile" && init?.method === "PUT")).toBe(true));
  act(() => setSessionIdentity({ ...identity, id: other, displayName: "Current owner" }));
  await act(async () => delayed.resolve(Response.json(profile)));
  expect(saved).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled(); expect(getSession()?.username).toBe("Current owner");
});

it.each(["2050-01-01T00:00:00Z", "2010-01-01T00:00:00Z"])("does not change expiry or resend time after a device wall-clock jump to %s", async (wallClock) => {
  // jsdom's window.setInterval delegates to setTimeout; fake both so no real
  // event-loop timing can race the simulated monotonic performance clock.
  vi.useFakeTimers({ toFake: ["Date", "performance", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  const delayed = deferred(); fetcher.mockReturnValue(delayed.promise);
  render(createElement(EmailVerificationPanel));
  await act(async () => delayed.resolve(Response.json(pending)));
  expect(screen.getByText("Code expires in 10m 0s.")).toBeTruthy();
  vi.setSystemTime(new Date(wallClock));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText("Code expires in 9m 59s.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Resend in 59s" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(599000); });
  expect(screen.getByText("This code has expired. Request a new code.")).toBeTruthy();
  expect((screen.getByLabelText("Six-digit email code") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Resend email code" }) as HTMLButtonElement).disabled).toBe(false);
});

it("uses only the effective current revision for a delayed verification callback and input", async () => {
  const delayed = deferred(); const completed = vi.fn();
  fetcher.mockImplementation(async (url) => String(url).endsWith("/verify") ? delayed.promise : Response.json(pending));
  render(createElement(EmailVerificationPanel, { onVerified: completed }));
  fireEvent.change(await screen.findByLabelText("Six-digit email code"), { target: { value: "000123" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/verify"))).toBe(true));
  act(() => setSessionEmailVerification(id, { ...verified, email: "current@example.invalid", emailRevision: 8 }));
  await act(async () => delayed.resolve(Response.json({ ...verified, emailRevision: 7 })));
  expect(completed).toHaveBeenLastCalledWith(expect.objectContaining({ email: "current@example.invalid", emailRevision: 8 }));
  expect((screen.getByLabelText("Change email") as HTMLInputElement).value).toBe("current@example.invalid");
  expect(screen.queryByText(`Verified email: ${verified.email}`)).toBeNull();
});
