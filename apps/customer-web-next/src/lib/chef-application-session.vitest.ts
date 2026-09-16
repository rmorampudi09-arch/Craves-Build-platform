// @vitest-environment jsdom
import { createElement, useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefApplicationSessionBoundary } from "../components/chef-application-session-boundary";
import { ChefApplicationWorkspace } from "../components/chef-application-workspace";
import { captureSessionContext, invalidateSession, setSessionIdentity, setSessionEmailVerification } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

vi.mock("../components/auth/EmailVerificationPanel", () => ({ EmailVerificationPanel: () => null }));
const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture A", email: "a@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };
let current: CravesIdentity | null = owner;
const fetcher = vi.fn<typeof fetch>();
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function PrivateChild() {
  const [draft, setDraft] = useState("");
  useEffect(() => { void fetch("/api/chef/application"); }, []);
  return createElement("input", { "aria-label": "Private chef draft", value: draft, onChange: (event: { target: { value: string } }) => setDraft(event.target.value) });
}
function boundary() { return render(createElement(ChefApplicationSessionBoundary, null, createElement(PrivateChild))); }
function normal(input: RequestInfo | URL) {
  if (String(input) === "/api/auth/me") return Promise.resolve(Response.json(current || {}, { status: current ? 200 : 401 }));
  if (String(input) === "/api/auth/refresh") return Promise.resolve(Response.json({ identity: current }, { status: current ? 200 : 401 }));
  return Promise.resolve(Response.json({}, { status: 404 }));
}
beforeEach(() => { current = owner; invalidateSession(captureSessionContext()); fetcher.mockReset().mockImplementation(normal); vi.stubGlobal("fetch", fetcher); });
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

it("allows an active CUSTOMER to apply before chef approval", async () => {
  boundary(); await screen.findByLabelText("Private chef draft");
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

it("shows failed application reads truthfully and disables editing until retry succeeds", async () => {
  fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("heading", { name: "Application unavailable" });
  expect((screen.getByLabelText("First name *") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Submit application" }) as HTMLButtonElement).disabled).toBe(true);
  fetcher.mockImplementation(input => Promise.resolve(Response.json(String(input) === "/api/chef/application" ? { id: owner.id, status: "APPROVED", firstName: "Fixture", documents: [], latitude: null, longitude: null } : [])));
  fireEvent.click(screen.getByRole("button", { name: "Retry application" }));
  await screen.findByRole("heading", { name: "APPROVED" });
  expect(screen.queryByRole("button", { name: "Retry application" })).toBeNull();
  expect((screen.getByLabelText("First name *") as HTMLInputElement).value).toBe("Fixture");
});

it("keeps a successfully loaded pending application editable", async () => {
  fetcher.mockImplementation(input => Promise.resolve(Response.json(String(input) === "/api/chef/application" ? { id: owner.id, status: "PENDING", firstName: "Fixture", documents: [], latitude: null, longitude: null } : [])));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("heading", { name: "PENDING" });
  const firstName = screen.getByLabelText("First name *") as HTMLInputElement;
  expect(firstName.disabled).toBe(false);
  fireEvent.change(firstName, { target: { value: "Corrected" } });
  expect(firstName.value).toBe("Corrected");
  expect(screen.getByRole("button", { name: "Update pending application" })).toBeTruthy();
});
