// @vitest-environment jsdom
import { createElement, useEffect, useRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefAccessBoundary } from "../components/chef-access-boundary";
import { ChefApplicationSessionBoundary } from "../components/chef-application-session-boundary";
import { ChefModeDashboard } from "../components/chef-mode-dashboard";
import { ChefApplicationWorkspace } from "../components/chef-application-workspace";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

vi.mock("../components/location/AddressMapPicker", () => ({ AddressMapPicker: ({ latitude, longitude }: { latitude: number; longitude: number }) => createElement("div", { "data-testid": "kitchen-map", "data-latitude": latitude, "data-longitude": longitude }) }));
vi.mock("../components/auth/EmailVerificationPanel", () => ({ EmailVerificationPanel: ({ onStateChange }: { onStateChange: (value: unknown) => void }) => {
  const callback = useRef(onStateChange);
  useEffect(() => { callback.current({ email: "a@example.invalid", emailVerified: true, emailRevision: 1, pending: null, serverTime: "2026-10-02T00:00:00Z" }); }, []);
  return null;
} }));

const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture A", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER", "CHEF"] };
let identity = owner;
const fetcher = vi.fn<typeof fetch>();
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
const profile = { id: owner.id, registeredPhoneNumber: owner.phoneNumber, firstName: "Saved", lastName: "Name", email: null, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
const kitchen = { id: owner.id, kitchenName: "Fixture kitchen", addressLine1: "1 Test Road", city: "Hyderabad", state: "Telangana", status: "DRAFT", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
function normal(input: RequestInfo | URL) {
  const url = String(input);
  if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
  if (url === "/api/auth/refresh") return Promise.resolve(Response.json({ identity }));
  if (url === "/api/chef/application") return Promise.resolve(Response.json({ status: "APPROVED", documents: [] }));
  if (url === "/api/chef/kitchen") return Promise.resolve(Response.json(kitchen));
  if (url === "/api/customer/profile") return Promise.resolve(Response.json(profile));
  return Promise.resolve(Response.json([]));
}
beforeEach(() => {
  identity = owner;
  invalidateSession(captureSessionContext());
  setSessionIdentity(identity);
  window.localStorage.clear();
  fetcher.mockReset().mockImplementation(normal);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("chef startup authorization", () => {
  it("opens approved tools after fresh role rotation without optional customer-profile requests", async () => {
    const rotation = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/refresh" ? rotation.promise : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
    expect(screen.queryByText("Private chef tools")).toBeNull();
    await act(async () => { rotation.resolve(Response.json({ identity })); });
    await screen.findByText("Private chef tools");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(false);
  });
  it("keeps tools closed on failed role refresh and allows a fresh retry", async () => {
    let healthy = false;
    fetcher.mockImplementation(input => String(input) === "/api/auth/refresh" && !healthy ? Promise.resolve(Response.json({}, { status: 503 })) : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Private chef tools")).toBeNull();
    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Private chef tools");
  });
  it("does not open tools when fresh Auth removes a saved CHEF role", async () => {
    fetcher.mockImplementation(input => String(input) === "/api/auth/me" ? Promise.resolve(Response.json({ ...identity, roles: ["CUSTOMER"] })) : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await screen.findByText("Chef approval is still required");
    expect(screen.queryByText("Private chef tools")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(false);
  });
  it("ends a hung approved-access check and ignores its late response", async () => {
    vi.useFakeTimers();
    const check = deferred<Response>();
    fetcher.mockReturnValue(check.promise);
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    await act(async () => { check.resolve(Response.json(identity)); });
    expect(screen.queryByText("Private chef tools")).toBeNull();
  });
  it("aborts a hung identity request and can retry with a fresh lookup", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    let healthy = false;
    fetcher.mockImplementation((input, init) => healthy ? normal(input) : new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.queryByText("Private chef tools")).toBeNull();
    healthy = true;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(screen.getByText("Private chef tools")).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(2);
  });
  it("keeps applicant details closed when a fresh identity response is invalid", async () => {
    fetcher.mockResolvedValue(Response.json({}));
    render(createElement(ChefApplicationSessionBoundary, null, createElement("p", null, "Private applicant form")));
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Private applicant form")).toBeNull();
  });
  it("opens an applicant's private form without optional profile hydration", async () => {
    identity = { ...owner, roles: ["CUSTOMER"] };
    setSessionIdentity(identity);
    render(createElement(ChefApplicationSessionBoundary, null, createElement("p", null, "Private applicant form")));
    await screen.findByText("Private applicant form");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(false);
  });
});

describe("independent chef dashboard summaries", () => {
  it("shows kitchen and menu while orders and earnings remain pending, without reporting zero", async () => {
    const orders = deferred<Response>(); const earnings = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/orders" ? orders.promise : String(input) === "/api/chef/earnings" ? earnings.promise : normal(input));
    render(createElement(ChefModeDashboard));
    await screen.findByText("Fixture kitchen");
    await screen.findByRole("heading", { name: "Add your first dish" });
    const summary = screen.getByRole("region", { name: "Kitchen summary" });
    const orderCard = within(summary).getByText("Today’s orders").closest("a")!;
    const earningsCard = within(summary).getByText("This week").closest("a")!;
    expect(within(orderCard).getByText("Loading…")).toBeTruthy();
    expect(within(earningsCard).getByText("Loading…")).toBeTruthy();
    await act(async () => { orders.resolve(Response.json([])); earnings.resolve(Response.json({}, { status: 503 })); });
    await within(orderCard).findByText("0");
    await within(earningsCard).findByText("Unavailable");
    expect(screen.queryByText("Appears after your first earning")).toBeNull();
  });
  it("drops an old owner's pending dashboard and never displays its late kitchen", async () => {
    const oldKitchen = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/kitchen" && identity.id === owner.id ? oldKitchen.promise : normal(input));
    render(createElement(ChefModeDashboard));
    await screen.findByText("Hello, Fixture A");
    await act(async () => { identity = { ...owner, id: "22222222-2222-4222-8222-222222222222", displayName: "Fixture B" }; setSessionIdentity(identity); });
    await screen.findByText("Hello, Fixture B");
    await act(async () => { oldKitchen.resolve(Response.json({ ...kitchen, kitchenName: "Old private kitchen" })); });
    expect(screen.queryByText("Old private kitchen")).toBeNull();
    expect(screen.queryByText("Hello, Fixture A")).toBeNull();
  });
  it("does not treat malformed orders or earnings as empty summaries", async () => {
    fetcher.mockImplementation(input => ["/api/chef/orders", "/api/chef/earnings"].includes(String(input)) ? Promise.resolve(Response.json({ invalid: true })) : normal(input));
    render(createElement(ChefModeDashboard));
    const summary = await screen.findByRole("region", { name: "Kitchen summary" });
    const orderCard = within(summary).getByText("Today’s orders").closest("a")!;
    const earningsCard = within(summary).getByText("This week").closest("a")!;
    await within(orderCard).findByText("—");
    await within(earningsCard).findByText("Unavailable");
    expect(screen.queryByText("No orders yet — you’re all set")).toBeNull();
  });
  it("finishes a stalled orders read without hiding healthy kitchen summaries", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    fetcher.mockImplementation((input, init) => String(input) === "/api/chef/orders" ? new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }) : normal(input));
    await act(async () => { render(createElement(ChefModeDashboard)); });
    const orderCard = screen.getByText("Today’s orders").closest("a")!;
    expect(within(orderCard).getByText("Loading…")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(within(orderCard).getByText("—")).toBeTruthy();
    expect(screen.getByText("Fixture kitchen")).toBeTruthy();
    expect(screen.queryByText("Chef Mode couldn’t load")).toBeNull();
  });
});

describe("application status before optional prefill", () => {
  it("shows retry after an application timeout and loads a fresh application on retry", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    let healthy = false;
    fetcher.mockImplementation((input, init) => String(input) !== "/api/chef/application" ? normal(input) : healthy
      ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] }))
      : new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); }));
    render(createElement(ChefApplicationWorkspace));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText("Loading took too long. Please try again.")).toBeTruthy();
    healthy = true;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(screen.getByRole("button", { name: /Become a Chef/ })).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/chef/application")).toHaveLength(2);
  });
  it.each(["APPROVED", "PENDING"])("shows saved %s state without reading customer prefills", async status => {
    fetcher.mockImplementation(input => String(input) === "/api/chef/application" ? Promise.resolve(Response.json({ status, documents: [] })) : normal(input));
    render(createElement(ChefApplicationWorkspace));
    await screen.findByText(status === "APPROVED" ? "You’re approved" : "Verify your identity");
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith("/api/customer/"))).toBe(false);
  });
  it("lets a new applicant type and clear a field before late profile prefill arrives", async () => {
    const display = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/application" ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] })) : String(input) === "/api/customer/profile" ? display.promise : new Promise<Response>(() => undefined));
    render(createElement(ChefApplicationWorkspace));
    fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
    const first = screen.getByLabelText("First name") as HTMLInputElement;
    fireEvent.change(first, { target: { value: "Typed" } });
    fireEvent.change(first, { target: { value: "" } });
    await act(async () => { display.resolve(Response.json(profile)); });
    expect(first.value).toBe("");
    await waitFor(() => expect((screen.getByLabelText("Last name") as HTMLInputElement).value).toBe("Name"));
  });
  it("ignores optional prefill after its owner changes", async () => {
    const display = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/application" ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] })) : String(input) === "/api/customer/profile" ? display.promise : normal(input));
    render(createElement(ChefApplicationWorkspace));
    fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
    await act(async () => { setSessionIdentity({ ...owner, id: "22222222-2222-4222-8222-222222222222" }); display.resolve(Response.json(profile)); });
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("");
  });
  it("does not attach a late saved-address pin to a manually typed kitchen address or submit it", async () => {
    const addresses = deferred<Response>();
    let saved: Record<string, unknown> | null = null;
    fetcher.mockImplementation((input, init) => {
      if (String(input) === "/api/customer/addresses") return addresses.promise;
      if (String(input) !== "/api/chef/application") return normal(input);
      if (init?.method === "POST") { saved = JSON.parse(init.body as string); return Promise.resolve(Response.json({ ...saved, status: "PENDING", documents: [] })); }
      return Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] }));
    });
    render(createElement(ChefApplicationWorkspace));
    fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Typed" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Chef" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Flat / House / Building"), { target: { value: "99 New Road" } });
    await act(async () => { addresses.resolve(Response.json([{ id: owner.id, addressLabel: "HOME", recipientName: "Saved Name", contactPhoneNumber: owner.phoneNumber, addressLine1: "1 Old Road", addressLine2: null, landmark: null, areaName: "Saved Area", districtName: "Saved District", city: "Saved Town", state: "Saved State", postalCode: "500001", latitude: 17.4, longitude: 78.5, active: true, isDefault: true, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" }])); });
    expect(screen.queryByTestId("kitchen-map")).toBeNull();
    expect((screen.getByLabelText("Flat / House / Building") as HTMLInputElement).value).toBe("99 New Road");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "New City" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "New State" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save details and continue" }));
    await screen.findByRole("heading", { name: "Verify your identity" });
    expect(saved).toMatchObject({ addressLine1: "99 New Road", city: "New City", state: "New State", latitude: null, longitude: null });
  });
});
