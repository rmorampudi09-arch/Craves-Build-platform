// @vitest-environment jsdom
// The live and test websites share this component and API contract. All responses,
// identities and codes here are fixtures; no provider, secret or real OTP is used.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmailVerificationPanel } from "../components/EmailVerificationPanel";
import { getSession, setSessionEmailVerification, setSessionIdentity } from "../../auth/api/cravesAuth";
import type { EmailVerificationState } from "./email-verification-contract";

const owner = "11111111-1111-4111-8111-111111111111";
const oldId = "22222222-2222-4222-8222-222222222222";
const newId = "33333333-3333-4333-8333-333333333333";
const oldEmail = "prior@example.invalid";
const newEmail = "corrected@example.invalid";
const empty: EmailVerificationState = { email: null, emailVerified: false, emailRevision: 0, pending: null, serverTime: "2026-10-10T10:00:00Z" };
const pending: EmailVerificationState = { ...empty, pending: { challengeId: oldId, maskedEmail: "p***@example.invalid", expiresAt: "2026-10-10T10:10:00Z", resendAvailableAt: "2026-10-10T10:00:00Z", deliveryStatus: "ACCEPTED" } };
const replacement: EmailVerificationState = { ...pending, pending: { ...pending.pending!, challengeId: newId, maskedEmail: "c***@example.invalid" } };
const verified: EmailVerificationState = { ...empty, email: oldEmail, emailVerified: true, emailRevision: 1 };
const modes = [{ variant: "default" as const }, { compact: true }, { variant: "onboarding" as const }];
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function input() { return document.querySelector('input[type="email"]') as HTMLInputElement; }
function button(name: string | RegExp) { return screen.getByRole("button", { name }) as HTMLButtonElement; }
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; }
async function settled() { await waitFor(() => expect(button("Refresh verification status").disabled).toBe(false)); }
function posts(action: string) { return fetcher.mock.calls.filter(([url]) => String(url).endsWith(`/${action}`)); }
beforeEach(() => {
  setSessionIdentity({ id: owner, phoneNumber: "+10000000000", email: null, emailVerified: false, displayName: "Fixture", status: "ACTIVE", roles: ["CUSTOMER"] });
  fetcher = vi.fn<typeof fetch>(async url => Response.json(String(url).endsWith("/challenges") ? replacement : pending));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

for (const mode of modes) describe(`recipient binding ${JSON.stringify(mode)}`, () => {
  it.each([null, "canonical@example.invalid"])("never infers a restored recipient from saved draft or canonical email (%s)", async canonical => {
    fetcher.mockResolvedValue(Response.json({ ...pending, email: canonical, emailVerified: !!canonical }));
    render(createElement(EmailVerificationPanel, { ...mode, initialEmail: newEmail }));
    await screen.findByLabelText("Six-digit email code");
    expect(input().value).toBe("");
    expect(input().placeholder).toBe(pending.pending!.maskedEmail);
    expect(screen.getByText(/p\*\*\*@example.invalid/)).toBeTruthy();
    expect(posts("challenges")).toHaveLength(0);
  });

  it.each(["ACCEPTED", "UNAVAILABLE"] as const)("sends to edited address, never resends the prior challenge (%s)", async deliveryStatus => {
    fetcher.mockImplementation(async url => Response.json(String(url).endsWith("/challenges") ? replacement : { ...pending, pending: { ...pending.pending!, deliveryStatus, resendAvailableAt: "2026-10-10T10:01:00Z" } }));
    render(createElement(EmailVerificationPanel, { ...mode, initialEmail: oldEmail }));
    await screen.findByLabelText("Six-digit email code"); await settled();
    fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
    fireEvent.change(input(), { target: { value: newEmail } });
    expect(screen.queryByLabelText("Six-digit email code")).toBeNull();
    expect(screen.queryByRole("button", { name: /Resend/ })).toBeNull();
    fireEvent.click(button("Refresh verification status")); await settled();
    expect(screen.queryByLabelText("Six-digit email code")).toBeNull();
    expect(input().value).toBe(newEmail);
    fireEvent.click(button("Send email code"));
    await screen.findByLabelText("Six-digit email code"); await settled();
    expect(posts("resend")).toHaveLength(0);
    expect(JSON.parse(String(posts("challenges")[0][1]?.body))).toEqual({ email: newEmail, requestId: expect.any(String) });
    expect(input().value).toBe(""); expect(input().placeholder).toBe(replacement.pending!.maskedEmail);
    expect((screen.getByLabelText("Six-digit email code") as HTMLInputElement).value).toBe("");
    fireEvent.click(button(/Resend/)); await settled();
    expect(JSON.parse(String(posts("resend")[0][1]?.body)).challengeId).toBe(newId);
  });

  it("keeps only the masked recipient after send, refresh replacement and resend", async () => {
    let gets = 0;
    fetcher.mockImplementation(async url => {
      if (url === "/api/auth/email-verification") return Response.json(++gets === 1 ? empty : replacement);
      return Response.json(String(url).endsWith("/challenges") ? pending : replacement);
    });
    render(createElement(EmailVerificationPanel, { ...mode, initialEmail: oldEmail })); await settled();
    fireEvent.click(button("Send email code")); await settled();
    expect(input().value).toBe(""); expect(input().placeholder).toBe(pending.pending!.maskedEmail);
    fireEvent.click(button("Refresh verification status")); await settled();
    expect(input().value).toBe(""); expect(input().placeholder).toBe(replacement.pending!.maskedEmail);
    fireEvent.click(button(/Resend/)); await settled();
    expect(input().value).toBe(""); expect(input().placeholder).toBe(replacement.pending!.maskedEmail);
    expect(JSON.parse(String(posts("resend")[0][1]?.body)).challengeId).toBe(newId);
  });

  it("keeps a fresh-send action when editing back to canonical email with a different challenge pending", async () => {
    const changed = vi.fn();
    fetcher.mockImplementation(async url => Response.json(String(url).endsWith("/challenges")
      ? verified : { ...replacement, email: oldEmail, emailVerified: true, emailRevision: 1 }));
    render(createElement(EmailVerificationPanel, { ...mode, onStateChange: changed })); await settled();
    fireEvent.change(input(), { target: { value: oldEmail } });
    expect(changed).toHaveBeenLastCalledWith(null);
    const send = button(/Send email code|Keep verified email/);
    expect(send.disabled).toBe(false); fireEvent.click(send); await settled();
    expect(changed).toHaveBeenLastCalledWith(verified);
    expect(input().value).toBe(oldEmail);
  });

  it("restores the local gate when returning to the already verified email", async () => {
    const changed = vi.fn(); fetcher.mockImplementation(async () => Response.json(verified));
    render(createElement(EmailVerificationPanel, { ...mode, onStateChange: changed })); await settled();
    fireEvent.change(input(), { target: { value: newEmail } });
    expect(changed).toHaveBeenLastCalledWith(null);
    fireEvent.change(input(), { target: { value: oldEmail } });
    expect(changed).toHaveBeenLastCalledWith(verified);
    expect(input().value).toBe(oldEmail);
  });

  it("restores the local gate when another panel verifies the edited address", async () => {
    const changed = vi.fn(); fetcher.mockImplementation(async () => Response.json(verified));
    render(createElement(EmailVerificationPanel, { ...mode, onStateChange: changed })); await settled();
    fireEvent.change(input(), { target: { value: newEmail } });
    expect(changed).toHaveBeenLastCalledWith(null);
    act(() => setSessionEmailVerification(owner, { ...verified, email: newEmail, emailRevision: 2 }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ email: newEmail, emailVerified: true }));
    expect(input().value).toBe(newEmail);
  });

  it("withdraws only the local completion gate for an edited draft through refresh and send", async () => {
    const changed = vi.fn();
    fetcher.mockImplementation(async url => {
      if (String(url).endsWith("/verify")) return Response.json({ ...verified, email: newEmail, emailRevision: 2 });
      if (String(url).endsWith("/challenges")) return Response.json({ ...replacement, email: oldEmail, emailVerified: true, emailRevision: 1 });
      return Response.json(verified);
    });
    render(createElement(EmailVerificationPanel, { ...mode, onStateChange: changed })); await settled();
    expect(changed).toHaveBeenLastCalledWith(verified);
    fireEvent.change(input(), { target: { value: newEmail } });
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(getSession()?.email).toBe(oldEmail); expect(getSession()?.emailVerified).toBe(true);
    fireEvent.click(button("Refresh verification status")); await settled();
    expect(changed).toHaveBeenLastCalledWith(null);
    fireEvent.click(button("Send email code")); await settled();
    expect(changed).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
    fireEvent.click(button("Verify email")); await settled();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ email: newEmail, emailVerified: true }));
  });

  it.each([oldEmail, newEmail])("recovers the edited draft gate only for the matching canonical email (%s)", async recoveredEmail => {
    const changed = vi.fn(); let gets = 0;
    fetcher.mockImplementation(async url => {
      if (String(url).endsWith("/verify")) return Response.json({ code: "EMAIL_CODE_INVALID" }, { status: 400 });
      if (String(url).endsWith("/challenges")) return Response.json(replacement);
      return Response.json(++gets === 1 ? empty : { ...verified, email: recoveredEmail });
    });
    render(createElement(EmailVerificationPanel, { ...mode, onStateChange: changed })); await settled();
    fireEvent.change(input(), { target: { value: newEmail } });
    fireEvent.click(button("Send email code")); await settled();
    fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
    fireEvent.click(button("Verify email")); await settled();
    if (recoveredEmail === newEmail) expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ email: newEmail, emailVerified: true }));
    else expect(changed).toHaveBeenLastCalledWith(null);
    expect(input().value).toBe(newEmail);
  });

  it.each([false, true])("does not label a newer returned challenge with the submitted address (retry: %s)", async retry => {
    let sends = 0;
    fetcher.mockImplementation(async url => {
      if (String(url).endsWith("/challenges")) {
        if (++sends === 1 && retry) throw new Error("fixture timeout");
        // Dispatch/idempotent retry can return current state replaced by another tab.
        return Response.json(replacement);
      }
      return Response.json(empty);
    });
    render(createElement(EmailVerificationPanel, { ...mode, initialEmail: oldEmail })); await settled();
    fireEvent.click(button("Send email code")); await settled();
    if (retry) { fireEvent.click(button(/Retry send request|Try again/)); await settled(); }
    expect(input().value).toBe(""); expect(input().placeholder).toBe(replacement.pending!.maskedEmail);
    expect(JSON.parse(String(posts("challenges")[0][1]?.body)).email).toBe(oldEmail);
    if (retry) expect(posts("challenges")[1][1]?.body).toBe(posts("challenges")[0][1]?.body);
    expect(screen.queryByText(oldEmail)).toBeNull();
  });

  it("keeps a timeout retry on the same target and receipt, but drops it on edit", async () => {
    fetcher.mockImplementation(async url => {
      if (String(url).endsWith("/challenges")) throw new Error("fixture timeout");
      return Response.json(empty);
    });
    render(createElement(EmailVerificationPanel, { ...mode, initialEmail: oldEmail })); await settled();
    fireEvent.click(button("Send email code")); await settled();
    const retry = () => button(/Retry send request|Try again/);
    fireEvent.click(retry()); await settled();
    expect(posts("challenges")).toHaveLength(2);
    expect(posts("challenges")[1][1]?.body).toBe(posts("challenges")[0][1]?.body);
    fireEvent.change(input(), { target: { value: newEmail } });
    expect(screen.queryByRole("button", { name: /Retry send request|Try again/ })).toBeNull();
    fireEvent.click(button("Send email code")); await settled();
    const oldBody = JSON.parse(String(posts("challenges")[0][1]?.body));
    const newBody = JSON.parse(String(posts("challenges")[2][1]?.body));
    expect(newBody.email).toBe(newEmail); expect(newBody.requestId).not.toBe(oldBody.requestId);
  });

  it.each(["challenges", "resend", "verify", "refresh"])("ignores delayed %s responses after editing", async action => {
    const delayed = deferred(); const completed = vi.fn(); let gets = 0;
    fetcher.mockImplementation(async url => {
      if (url === "/api/auth/email-verification") return ++gets > 1 && action === "refresh" ? delayed.promise : Response.json(action === "challenges" ? empty : pending);
      return delayed.promise;
    });
    render(createElement(EmailVerificationPanel, { ...mode, initialEmail: oldEmail, onVerified: completed })); await settled();
    if (action === "verify") {
      fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
      fireEvent.click(button("Verify email"));
    } else fireEvent.click(button(action === "challenges" ? "Send email code" : action === "refresh" ? "Refresh verification status" : /Resend/));
    // Defensive event simulation: controls normally disable/readOnly while busy.
    fireEvent.change(input(), { target: { value: newEmail } });
    await act(async () => delayed.resolve(Response.json(action === "verify" ? verified : pending)));
    expect(input().value).toBe(newEmail);
    expect(screen.queryByLabelText("Six-digit email code")).toBeNull();
    expect(completed).not.toHaveBeenCalled();
    expect(getSession()?.emailVerified).toBe(false);
  });

  it("does not complete a verification response that already contains a newer pending challenge", async () => {
    const completed = vi.fn();
    fetcher.mockImplementation(async url => Response.json(String(url).endsWith("/verify")
      ? { ...replacement, email: oldEmail, emailVerified: true, emailRevision: 1 } : pending));
    render(createElement(EmailVerificationPanel, { ...mode, onVerified: completed })); await settled();
    fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
    fireEvent.click(button("Verify email")); await settled();
    expect(completed).not.toHaveBeenCalled();
    expect(input().value).toBe(""); expect(input().placeholder).toBe(replacement.pending!.maskedEmail);
    expect(screen.queryByText("Email verified successfully.")).toBeNull();
  });

  it("does not notify a parent after unmounting a pending verification", async () => {
    const delayed = deferred(); const completed = vi.fn();
    fetcher.mockImplementation(async url => String(url).endsWith("/verify") ? delayed.promise : Response.json(pending));
    const view = render(createElement(EmailVerificationPanel, { ...mode, onVerified: completed })); await settled();
    fireEvent.change(screen.getByLabelText("Six-digit email code"), { target: { value: "000123" } });
    fireEvent.click(button("Verify email")); view.unmount();
    await act(async () => delayed.resolve(Response.json(verified)));
    expect(completed).not.toHaveBeenCalled(); expect(getSession()?.emailVerified).toBe(false);
  });
});
