// @vitest-environment jsdom
import { createElement, useEffect, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefApplicationSessionBoundary } from "../components/chef-application-session-boundary";
import { ChefApplicationWorkspace } from "../components/chef-application-workspace";
import { captureSessionContext, getSession, invalidateSession, isSessionReady, setSessionIdentity, setSessionEmailVerification } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

let verifiedEmail = false;
vi.mock("../components/auth/EmailVerificationPanel", () => ({ EmailVerificationPanel: ({ onStateChange }: { onStateChange: (state: unknown) => void }) => {
  const callback = useRef(onStateChange);
  useEffect(() => { if (verifiedEmail) callback.current({ email: "a@example.invalid", emailVerified: true, emailRevision: 1, pending: null, serverTime: "2026-10-02T00:00:00Z" }); }, []);
  return null;
} }));
const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture A", email: "a@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };
let current: CravesIdentity | null = owner;
const fetcher = vi.fn<typeof fetch>();
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function PrivateChild() {
  const [draft, setDraft] = useState("");
  const [identityId] = useState(() => getSession()?.id);
  useEffect(() => { void fetch("/api/chef/application"); }, []);
  return createElement("input", { "aria-label": "Private chef draft", "data-owner-id": identityId, value: draft, onChange: (event: { target: { value: string } }) => setDraft(event.target.value) });
}
function boundary() { return render(createElement(ChefApplicationSessionBoundary, null, createElement(PrivateChild))); }
function normal(input: RequestInfo | URL) {
  if (String(input) === "/api/auth/me") return Promise.resolve(Response.json(current || {}, { status: current ? 200 : 401 }));
  if (String(input) === "/api/auth/refresh") return Promise.resolve(Response.json({ identity: current }, { status: current ? 200 : 401 }));
  return Promise.resolve(Response.json({}, { status: 404 }));
}
beforeEach(() => { verifiedEmail = false; current = owner; invalidateSession(captureSessionContext()); fetcher.mockReset().mockImplementation(normal); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("waits for expired-session recovery before mounting private sections", async () => {
  const refresh = deferred<Response>(); let renewed = false;
  fetcher.mockImplementation(input => {
    if (String(input) === "/api/auth/me" && !renewed) return Promise.resolve(Response.json({}, { status: 401 }));
    if (String(input) === "/api/auth/refresh") return refresh.promise;
    return normal(input);
  });
  boundary();
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
  expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/application")).toBe(false);
  await act(async () => { renewed = true; refresh.resolve(Response.json({ identity: owner })); });
  await screen.findByLabelText("Private chef draft");
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
});

it("mounts the current active verified owner while optional customer profile hydration is pending", async () => {
  const profile = deferred<Response>(); let profileSettled = false;
  void profile.promise.then(() => { profileSettled = true; });
  fetcher.mockImplementation(input => String(input) === "/api/customer/profile" ? profile.promise : normal(input));
  boundary();
  const draft = await screen.findByLabelText("Private chef draft");
  expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(true);
  expect(profileSettled).toBe(false);
  expect(isSessionReady()).toBe(true);
  expect(getSession()).toMatchObject({ id: owner.id, status: "ACTIVE", emailVerified: true });
  expect(draft.getAttribute("data-owner-id")).toBe(owner.id);
  await act(async () => { profile.resolve(Response.json({}, { status: 503 })); });
  expect(screen.getByLabelText("Private chef draft").getAttribute("data-owner-id")).toBe(owner.id);
  expect(screen.queryByText("We couldn’t open your application")).toBeNull();
});

it("requires refresh and confirmed identity before mounting despite a pending optional profile", async () => {
  const refresh = deferred<Response>(); const confirmedIdentity = deferred<Response>(); const profile = deferred<Response>();
  let renewed = false; let profileSettled = false;
  void profile.promise.then(() => { profileSettled = true; });
  fetcher.mockImplementation(input => {
    if (String(input) === "/api/auth/me") return renewed ? confirmedIdentity.promise : Promise.resolve(Response.json({}, { status: 401 }));
    if (String(input) === "/api/auth/refresh") return refresh.promise;
    if (String(input) === "/api/customer/profile") return profile.promise;
    return normal(input);
  });
  boundary();
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/application" || url === "/api/customer/profile")).toBe(false);
  await act(async () => { renewed = true; refresh.resolve(Response.json({ identity: owner })); });
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/me").length).toBeGreaterThan(1));
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  await act(async () => { confirmedIdentity.resolve(Response.json(owner)); });
  expect((await screen.findByLabelText("Private chef draft")).getAttribute("data-owner-id")).toBe(owner.id);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  expect(profileSettled).toBe(false);
  await act(async () => { profile.resolve(Response.json({}, { status: 503 })); });
});

it("discards the prior owner's private form when its pending profile fails during an account switch", async () => {
  const priorProfile = deferred<Response>(); const nextIdentity = deferred<Response>();
  fetcher.mockImplementation(input => {
    if (String(input) === "/api/auth/me" && current?.id !== owner.id) return nextIdentity.promise;
    if (String(input) === "/api/customer/profile") return getSession()?.id === owner.id ? priorProfile.promise : Promise.resolve(Response.json({}, { status: 503 }));
    return normal(input);
  });
  boundary();
  fireEvent.change(await screen.findByLabelText("Private chef draft"), { target: { value: "private draft A" } });
  current = { ...owner, id: "22222222-2222-4222-8222-222222222222", displayName: "Fixture B" };
  act(() => { setSessionIdentity(current!); });
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  await act(async () => { priorProfile.resolve(Response.json({}, { status: 503 })); });
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  expect(getSession()?.id).toBe(current.id);
  await act(async () => { nextIdentity.resolve(Response.json(current)); });
  const nextDraft = await screen.findByLabelText("Private chef draft") as HTMLInputElement;
  expect(nextDraft.getAttribute("data-owner-id")).toBe(current.id);
  expect(nextDraft.value).toBe("");
  expect(getSession()?.id).toBe(current.id);
});

it("opens a new application when optional address/profile prefills fail", async () => {
  fetcher.mockImplementation(input => String(input) === "/api/chef/application"
    ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] }))
    : Promise.reject(new Error("Optional prefill unavailable")));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("button", { name: /Become a Chef/ });
});

it("shows repeated load failures after retry without an unhandled rejection", async () => {
  fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
  render(createElement(ChefApplicationWorkspace));
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6));
  await screen.findByText("We couldn’t load your application right now.");
  expect(screen.getByRole("button", { name: "Try again" }).hasAttribute("disabled")).toBe(false);
});

it("resubmits corrected rejected applications and does not fake a pending state on failure", async () => {
  verifiedEmail = true;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
  const rejected = {
    id: owner.id, status: "REJECTED", email: "a@example.invalid", firstName: "Fixture", lastName: "Chef",
    addressLine1: "1 Test Road", city: "Hyderabad", state: "Telangana", rejectionReason: "Please replace the ID photo",
    documents: ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"].map(documentType => ({
      id: owner.id, documentType, originalFileName: "fixture.png", contentType: "image/png", fileSizeBytes: 100,
      status: "UPLOADED", createdAt: "2026-10-02T00:00:00Z",
    })),
  };
  let succeeds = false;
  fetcher.mockImplementation((input, init) => Promise.resolve(Response.json(
    init?.method === "POST" ? succeeds ? { ...rejected, status: "PENDING", rejectionReason: null }
      : { code: "EMAIL_AUTHORITY_UNAVAILABLE", message: "We couldn’t confirm your verified email right now." }
      : String(input) === "/api/chef/application" ? rejected : [],
    { status: init?.method === "POST" && !succeeds ? 503 : 200 },
  )));
  render(createElement(ChefApplicationWorkspace));
  const submit = await screen.findByRole("button", { name: "Resubmit for verification" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  fireEvent.click(submit);
  await screen.findByText("We couldn’t confirm your verified email right now.");
  expect(screen.queryByText("Application under review")).toBeNull();
  succeeds = true;
  fireEvent.click(screen.getByRole("button", { name: "Resubmit for verification" }));
  await screen.findByRole("button", { name: "View verification status" });
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[1][1]!.body as string).email).toBe("a@example.invalid");
});

it("allows an active CUSTOMER to apply before chef approval", async () => {
  boundary(); await screen.findByLabelText("Private chef draft");
});

it("saves a new application through the guided flow and restores its saved state after remount", async () => {
  verifiedEmail = true;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
  let saved: Record<string, unknown> = { status: "NOT_SUBMITTED", documents: [] };
  fetcher.mockImplementation((input, init) => {
    if (String(input) !== "/api/chef/application") return Promise.resolve(Response.json([]));
    if (init?.method === "POST") saved = { ...JSON.parse(init.body as string), id: owner.id, status: "PENDING", documents: [] };
    return Promise.resolve(Response.json(saved));
  });
  const view = render(createElement(ChefApplicationWorkspace));
  fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Test" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Chef" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  const accountContinue = screen.getByRole("button", { name: "Continue" });
  await waitFor(() => expect(accountContinue.hasAttribute("disabled")).toBe(false));
  fireEvent.click(accountContinue);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Flat / House / Building"), { target: { value: "1 Test Road" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Hyderabad" } });
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "Telangana" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Save details and continue" }));
  await screen.findByRole("heading", { name: "Verify your identity" });
  expect(saved).toMatchObject({ firstName: "Test", email: "a@example.invalid", status: "PENDING", latitude: null, longitude: null });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  view.unmount();
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("heading", { name: "Verify your identity" });
  expect(screen.queryByRole("button", { name: /Become a Chef/ })).toBeNull();
});

it("provides retry for a failed check and never mounts the private form prematurely", async () => {
  fetcher.mockRejectedValue(new Error("private diagnostics")); boundary();
  await screen.findByText("We couldn’t open your application");
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  expect(screen.queryByText("private diagnostics")).toBeNull();
  fetcher.mockImplementation(normal); fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByLabelText("Private chef draft");
});

it("offers sign-in with an application return path when the session has ended", async () => {
  current = null; boundary();
  expect((await screen.findByRole("link", { name: "Sign in" })).getAttribute("href")).toBe("/sign-in?returnTo=/chef/application");
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
});

it("clears private drafts on account switch and keeps same-owner email updates", async () => {
  boundary(); fireEvent.change(await screen.findByLabelText("Private chef draft"), { target: { value: "private draft A" } });
  act(() => setSessionEmailVerification(owner.id, { email: "replacement@example.invalid", emailVerified: true, emailRevision: 2, pending: null, serverTime: "2026-09-17T00:00:00Z" }));
  expect((screen.getByLabelText("Private chef draft") as HTMLInputElement).value).toBe("private draft A");
  current = { ...owner, id: "22222222-2222-4222-8222-222222222222" };
  act(() => { setSessionIdentity(current!); });
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  expect((await screen.findByLabelText("Private chef draft") as HTMLInputElement).value).toBe("");
});

it("does not expose private children for a suspended account", async () => {
  current = { ...owner, status: "SUSPENDED" }; boundary();
  await screen.findByRole("link", { name: "Sign in" });
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
});

it("ends a hung screen check after 15 seconds", async () => {
  vi.useFakeTimers(); fetcher.mockImplementation(() => new Promise(() => {})); boundary();
  await act(async () => { vi.advanceTimersByTime(15_000); });
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
});

it("never accepts a delayed response after unmount", async () => {
  const late = deferred<Response>(); fetcher.mockReturnValue(late.promise); const view = boundary(); view.unmount();
  await act(async () => { late.resolve(Response.json(owner)); });
  expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/application")).toBe(false);
});

it("shows failed application reads truthfully and keeps private editing unavailable until retry succeeds", async () => {
  fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByText("We couldn’t load your application right now.");
  expect(screen.queryByRole("button", { name: "Start my application" })).toBeNull();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();

  fetcher.mockImplementation(input => Promise.resolve(Response.json(
    String(input) === "/api/chef/application"
      ? { id: owner.id, status: "APPROVED", firstName: "Fixture", documents: [], latitude: null, longitude: null }
      : [],
  )));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Congratulations! You’re now a Craves chef" });
  expect(screen.getByRole("link", { name: "Continue Chef setup" }).getAttribute("href")).toBe("/chef");
  expect(screen.getByText("Your Chef Mode is ready. Save your kitchen details, then add and publish your dishes.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Add my first dish" })).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

it("keeps a successfully loaded pending application editable through the guided flow", async () => {
  fetcher.mockImplementation(input => Promise.resolve(Response.json(
    String(input) === "/api/chef/application"
      ? {
          id: owner.id,
          status: "PENDING",
          email: "fixture@example.invalid",
          firstName: "Fixture",
          lastName: "Chef",
          addressLine1: "1 Fixture Road",
          city: "Fixture City",
          state: "Fixture State",
          documents: [],
          latitude: null,
          longitude: null,
        }
      : [],
  )));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("heading", { name: "Verify your identity" });

  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
  for (const heading of ["Food Safety Details", "Show your kitchen", "Where is your kitchen located?", "Tell customers about your kitchen", "Let’s get to know you", "What’s your name?"]) {
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: heading });
  }

  const firstName = await screen.findByLabelText("First name") as HTMLInputElement;
  expect(firstName.disabled).toBe(false);
  fireEvent.change(firstName, { target: { value: "Corrected" } });
  expect(firstName.value).toBe("Corrected");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  fireEvent.change(firstName, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(firstName.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(firstName);
  expect(screen.getByRole("alert").textContent).toContain("First name is required");
  expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);

});
