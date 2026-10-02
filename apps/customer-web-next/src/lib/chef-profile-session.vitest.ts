// @vitest-environment jsdom
// Actual rendered components; all service responses and identity changes are disposable fixtures.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChefMenuManager } from "../components/chef-menu-manager";
import { ChefKitchenForm } from "../components/chef-kitchen-form";
import { ChefModeDashboard } from "../components/chef-mode-dashboard";
import type { ChefMenuItem } from "./chef-menu-contract";
import type { ChefKitchen } from "./chef-kitchen-types";
import { ChefAccessBoundary } from "../components/chef-access-boundary";
import { ChefBankOnboardingPanel } from "../components/chef-bank-onboarding-panel";
import ChefFinancePage from "../app/chef/finance/page";
import ProfilePage from "../screens/Profile/Profile";
import { captureSessionContext, clearSession, getSession, invalidateSession, setSessionEmailVerification, setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, Link: ({ children }: { children: unknown }) => children }));
vi.mock("next/navigation", () => ({ usePathname: () => "/profile", useRouter: () => ({ push: navigate, replace: navigate }) }));
vi.mock("../components/location/AddressMapPicker", () => ({ AddressMapPicker: () => null }));

const a: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Chef A", email: "a@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CHEF"] };
const b: CravesIdentity = { ...a, id: "22222222-2222-4222-8222-222222222222", displayName: "Chef B", email: "b@example.invalid" };
const kitchenFixture: ChefKitchen = { id: a.id, kitchenName: "Fixture kitchen", displayName: null, description: null, phoneNumber: null, email: null, addressLine1: "Fixture house", addressLine2: null, landmark: null, areaName: null, city: "Fixture city", state: "Fixture state", postalCode: null, latitude: null, longitude: null, status: "DRAFT", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
let identity: CravesIdentity | null;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function profile(owner: CravesIdentity) { return { id: owner.id, registeredPhoneNumber: owner.phoneNumber, firstName: owner.displayName, lastName: "Fixture", email: owner.email, createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" }; }
function email(owner: CravesIdentity) { return { email: owner.email, emailVerified: true, emailRevision: 1, pending: null, serverTime: "2026-09-14T10:00:00Z" }; }
function balance(owner: CravesIdentity) { return { available: owner.id === a.id ? "11.00" : "22.00", outstanding: "33.00", reservedOrPaid: "0.00", onHold: false, manualRequestUsedToday: false, nextManualRequestAt: "2026-09-15T00:00:00Z", recentPayouts: [], executionEnabled: true, payoutMode: "CRAVES_MANUAL" }; }
async function normal(input: RequestInfo | URL): Promise<Response> {
  const url = String(input); const owner = identity;
  if (url === "/api/auth/me") return Response.json(owner || {}, { status: owner ? 200 : 401 });
  if (url === "/api/auth/refresh") return Response.json({ identity: owner }, { status: owner ? 200 : 401 });
  if (!owner) return Response.json({}, { status: 401 });
  if (url === "/api/auth/email-verification") return Response.json(email(owner));
  if (url === "/api/customer/profile") return Response.json(profile(owner));
  if (url === "/api/customer/addresses") return Response.json([{ id: owner.id, isDefault: true, addressLine1: `${owner.displayName} private address`, city: "Fixture", state: "Fixture" }]);
  if (url === "/api/orders") return Response.json(owner.id === a.id ? [{}, {}, {}] : []);
  if (url === "/api/chef/application") return Response.json({ firstName: owner.displayName, lastName: "Fixture", status: "APPROVED" });
  if (url === "/api/chef/finance/balance") return Response.json(balance(owner));
  if (url === "/api/chef-onboarding/bank") return Response.json({ id: null, state: "NOT_SUBMITTED", lastFour: null, ifsc: null, bankValidated: false, applicationApproved: true, automaticActivation: true, message: "Fixture enrollment", updatedAt: null });
  throw new Error(`Unexpected fixture route ${url}`);
}
beforeEach(() => { identity = a; setSessionIdentity(a); navigate.mockReset(); fetcher = vi.fn<typeof fetch>(normal); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function change(owner: CravesIdentity) { identity = owner; act(() => { setSessionIdentity(owner); }); }

describe("chef finance owner boundaries", () => {
  it("shows the authoritative verified email alongside real finance panels", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByText("Verified email: a@example.invalid");
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    expect(screen.getByText("Your dated ledger statement")).toBeTruthy();
  });

  it("clears bank inputs and the old balance on owner change and ignores a late refresh", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    fireEvent.change(await screen.findByLabelText("Account number"), { target: { value: "123456789" } });
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/finance/balance" && identity?.id === a.id ? late.promise : normal(input));
    fireEvent.click(screen.getByRole("button", { name: "Refresh balance and status" }));
    change(b);
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    await screen.findByRole("button", { name: "Request ₹22.00 available balance" });
    expect((screen.getByLabelText("Account number") as HTMLInputElement).value).toBe("");
    await act(async () => { late.resolve(Response.json(balance(a))); });
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    expect(screen.queryByText("Verified email: a@example.invalid")).toBeNull();
  });

  it("preserves healthy form input on a same-owner verified email update", async () => {
    render(createElement(ChefFinancePage));
    const account = await screen.findByLabelText("Account number");
    fireEvent.change(account, { target: { value: "123456789" } });
    act(() => { setSessionEmailVerification(a.id, { ...email(a), email: "replacement@example.invalid", emailRevision: 2 }); });
    expect((screen.getByLabelText("Account number") as HTMLInputElement).value).toBe("123456789");
  });

  it("removes private child state on CHEF role loss and creates clean state if approved again", async () => {
    function PrivateForm() { const [value, setValue] = useState(""); return createElement("input", { "aria-label": "Private form", value, onChange: (event: { target: { value: string } }) => setValue(event.target.value) }); }
    render(createElement(ChefAccessBoundary, null, createElement(PrivateForm)));
    fireEvent.change(await screen.findByLabelText("Private form"), { target: { value: "private draft" } });
    change({ ...a, roles: ["CUSTOMER"] });
    expect(screen.queryByLabelText("Private form")).toBeNull();
    await screen.findByText("Chef approval is still required");
    change(a);
    expect((await screen.findByLabelText("Private form") as HTMLInputElement).value).toBe("");
  });

  it("discards an old owner's delayed role synchronization", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/refresh" && identity?.id === a.id ? late.promise : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef data")));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
    change({ ...b, roles: ["CUSTOMER"] });
    await screen.findByText("Chef approval is still required");
    await act(async () => { late.resolve(Response.json({ identity: a })); });
    expect(screen.queryByText("Private chef data")).toBeNull();
    expect(getSession()?.id).toBe(b.id);
  });

  it("removes finance and gives sign-in guidance for an inactive owner", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    change({ ...a, status: "SUSPENDED" });
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    await screen.findByText("Sign in again to continue");
  });

  it("hides private finance immediately while sign-out is pending and after completion", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    let signingOut!: Promise<void>;
    act(() => { signingOut = clearSession(); });
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    identity = null;
    await act(async () => { late.resolve(Response.json({ signedOut: true })); await signingOut; });
    await screen.findByText("Sign in again to continue");
    expect(screen.queryByText("Verified email: a@example.invalid")).toBeNull();
  });

  it("protects standalone application bank fields before CHEF role approval", async () => {
    change({ ...a, roles: ["CUSTOMER"] });
    render(createElement(ChefBankOnboardingPanel));
    fireEvent.change(await screen.findByLabelText("Account number"), { target: { value: "123456789" } });
    change({ ...b, roles: ["CUSTOMER"] });
    expect((await screen.findByLabelText("Account number") as HTMLInputElement).value).toBe("");
    await waitFor(() => expect((screen.getByLabelText("Account holder from your saved chef application") as HTMLInputElement).value).toBe("Chef B Fixture"));
    identity = null;
    act(() => { invalidateSession(captureSessionContext()); });
    expect(screen.queryByLabelText("Account number")).toBeNull();
  });
});

describe("profile owner privacy", () => {
  it("replaces loaded profile, addresses and history for a new owner", async () => {
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    expect(screen.getByText(/Chef A private address/)).toBeTruthy();
    expect(screen.getByText("3 orders in your history")).toBeTruthy();
    change(b);
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    await screen.findByRole("heading", { name: "Chef B Fixture" });
    expect(screen.getByText("0 orders in your history")).toBeTruthy();
  });

  it("drops old deferred profile responses after a replacement owner finishes loading", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/customer/profile" && identity?.id === a.id ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(true));
    change(b);
    await screen.findByRole("heading", { name: "Chef B Fixture" });
    await act(async () => { late.resolve(Response.json(profile(a))); });
    expect(screen.queryByRole("heading", { name: "Chef A Fixture" })).toBeNull();
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
  });

  it("drops late profile data when the session is invalidated", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/customer/profile" && identity?.id === a.id ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(true));
    identity = null;
    act(() => { invalidateSession(captureSessionContext()); });
    await act(async () => { late.resolve(Response.json(profile(a))); });
    expect(screen.queryByRole("heading", { name: "Chef A Fixture" })).toBeNull();
    expect(screen.queryByText(/private address/)).toBeNull();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
  });

  it("retains a reachable logout retry after an unconfirmed response", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Retry sign out" });
    expect(navigate).not.toHaveBeenCalled();
    expect(getSession()?.id).toBe(a.id);
  });

  for (const outage of ["503", "network"]) it(`keeps logout retry available when rehydration fails with ${outage}`, async () => {
    const late = deferred<Response>();
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/auth/logout") return late.promise;
      if (url === "/api/auth/me") {
        if (outage === "network") return Promise.reject(new Error("fixture offline"));
        return Promise.resolve(Response.json({}, { status: 503 }));
      }
      return normal(input);
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Retry sign out" });
    await screen.findByText("Your account details are temporarily unavailable. Sign-out controls remain available below.");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    expect(getSession()?.id).toBe(a.id);
    fetcher.mockImplementation(input => {
      if (String(input) === "/api/auth/logout") { identity = null; return Promise.resolve(Response.json({ signedOut: true })); }
      return normal(input);
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(getSession()).toBeNull();
  });

  it("ignores an old logout failure after a fresh same-owner login", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    change(a);
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    expect(screen.queryByRole("button", { name: "Retry sign out" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not let an older owner operation overwrite a newer pending logout", async () => {
    const first = deferred<Response>(); const second = deferred<Response>(); let calls = 0;
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? (++calls === 1 ? first.promise : second.promise) : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    change(b);
    await screen.findByRole("heading", { name: "Chef B Fixture" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { first.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    expect((screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Retry sign out" })).toBeNull();
    await act(async () => { second.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Retry sign out" });
    expect(getSession()?.id).toBe(b.id);
    expect(navigate).not.toHaveBeenCalled();
  });
});


describe("Chef menu save and recovery", () => {
  let stored: ChefMenuItem[];
  const fixture: ChefMenuItem = { id: a.id, itemName: "Fixture dish", description: null, category: "Meals", foodType: "VEG", price: 180, currency: "INR", servesCount: null, preparationTimeMinutes: null, spiceLevel: null, unitPackageWeightGrams: 500, thermoboxRequired: false, available: true, status: "ACTIVE", images: [], createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
  beforeEach(() => {
    stored = [];
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    fetcher.mockImplementation(async (input, options) => {
      const url = String(input);
      if (url === "/api/chef/kitchen" && !options?.method) return Response.json(kitchenFixture);
      if (url === "/api/chef/menu" && !options?.method) return Response.json(stored);
      if (url === "/api/chef/menu" && options?.method === "POST") { const item = { ...fixture, ...JSON.parse(String(options.body)) }; stored.push(item); return Response.json(item, { status: 201 }); }
      if (url === `/api/chef/menu/${a.id}` && options?.method === "PUT") { stored = [{ ...stored[0], ...JSON.parse(String(options.body)) }]; return Response.json(stored[0]); }
      if (url.endsWith("/availability") && options?.method === "PATCH") { stored = [{ ...stored[0], ...JSON.parse(String(options.body)) }]; return Response.json(stored[0]); }
      throw new Error(`Unexpected menu route ${url}`);
    });
  });
  async function openNew() {
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Add your first dish" }));
  }
  function fillRequired() {
    fireEvent.change(screen.getByLabelText(/Dish Name/), { target: { value: "Fixture dish" } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: "Meals" } });
    fireEvent.click(screen.getByRole("radio", { name: "Veg" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText(/Packed weight/), { target: { value: "500" } });
  }
  it("takes a new approved Chef through kitchen setup, dish creation and persisted menu changes", async () => {
    let savedKitchen: ChefKitchen | null = null;
    const original = fetcher.getMockImplementation()!;
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fetcher.mockImplementation(async (input, options) => {
      const url = String(input);
      if (url === "/api/chef/kitchen" && !options?.method) return Response.json(savedKitchen);
      if (url === "/api/chef/kitchen" && options?.method === "PUT") {
        savedKitchen = { ...kitchenFixture, ...JSON.parse(String(options.body)) };
        return Response.json(savedKitchen);
      }
      if (url === "/api/chef/application") return Response.json({ id: a.id, firstName: "Fixture", lastName: "Chef", email: a.email, status: "APPROVED", addressLine1: "Fixture house", city: "Fixture city", state: "Fixture state", latitude: null, longitude: null, documents: [] });
      return original(input, options);
    });
    render(createElement(ChefMenuManager));
    const setup = await screen.findByRole("link", { name: "Set up my kitchen" });
    expect(setup.getAttribute("href")).toBe("/chef/kitchen");
    expect(screen.queryByRole("button", { name: "Add Dish" })).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(false);
    cleanup(); render(createElement(ChefKitchenForm));
    fireEvent.change(await screen.findByLabelText("Kitchen name"), { target: { value: "New fixture kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    fireEvent.click(screen.getByRole("button", { name: /^Not yet/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
    expect((await screen.findByRole("link", { name: /Go to my menu/ })).getAttribute("href")).toBe("/chef/menu");
    expect(savedKitchen).toMatchObject({ kitchenName: "New fixture kitchen", status: "DRAFT", latitude: null, longitude: null });
    cleanup(); render(createElement(ChefKitchenForm));
    await screen.findByRole("heading", { name: "New fixture kitchen" });
    cleanup(); await openNew(); fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
    fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "190" } });
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish updated successfully");
    await waitFor(() => expect((screen.getByRole("switch", { name: "Availability for Fixture dish" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now unavailable");
    await waitFor(() => expect((screen.getByRole("switch", { name: "Availability for Fixture dish" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now available");
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("heading", { name: "Fixture dish" });
    expect(screen.getByText("₹190.00")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Availability for Fixture dish" }).getAttribute("aria-checked")).toBe("true");
  });
  it.each(["unavailable", "invalid", "bad-json"])("does not mistake a %s kitchen read for a new or empty menu", async state => {
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, options) => String(input) === "/api/chef/kitchen"
      ? Promise.resolve(state === "unavailable" ? Response.json({ code: "KITCHEN_UNAVAILABLE" }, { status: 503 }) : state === "invalid" ? Response.json({ kitchenName: "Incomplete" }) : new Response("not json"))
      : original(input, options));
    render(createElement(ChefMenuManager));
    await screen.findByRole("button", { name: "Reload menu" });
    expect(screen.queryByRole("link", { name: "Set up my kitchen" })).toBeNull();
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(false);
  });
  it.each(["displayName", "city"] as const)("guides a new Chef to an overlong %s prefilled from the application", async field => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fetcher.mockImplementation(async input => {
      if (String(input) === "/api/chef/kitchen") return Response.json(null);
      if (String(input) === "/api/chef/application") return Response.json({
        status: "APPROVED", firstName: field === "displayName" ? "x".repeat(159) : "Fixture", lastName: "Y",
        addressLine1: "Fixture house", city: field === "city" ? "x".repeat(81) : "Fixture city", state: "Fixture state", latitude: null, longitude: null,
      });
      throw new Error(`Unexpected kitchen fixture route ${input}`);
    });
    render(createElement(ChefKitchenForm));
    const name = await screen.findByLabelText("Kitchen name");
    expect((name as HTMLInputElement).maxLength).toBe(160);
    fireEvent.change(name, { target: { value: "New kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    if (field === "city") fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    const invalid = screen.getByLabelText(field === "city" ? "City" : /Chef name customers see/);
    expect(invalid.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(invalid);
    expect(screen.getByRole("alert").textContent).toBe(`${field === "city" ? "City" : "Chef name"} must be ${field === "city" ? 80 : 160} characters or fewer.`);
    if (field === "displayName") expect(invalid.closest("details")?.open).toBe(true);
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  });
  it("recovers a menu race by directing the Chef to their kitchen instead of retrying failed dish fields", async () => {
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, options) => String(input) === "/api/chef/menu"
      ? Promise.resolve(Response.json({ code: "KITCHEN_PROFILE_REQUIRED" }, { status: 400 })) : original(input, options));
    render(createElement(ChefMenuManager));
    await screen.findByRole("link", { name: "Set up my kitchen" });
    expect(screen.queryByText(/packed weight/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Dish" })).toBeNull();
  });
  it.each(["POST", "PUT", "PATCH"] as const)("returns to kitchen setup if the kitchen disappears before a %s mutation", async method => {
    if (method === "POST") { await openNew(); fillRequired(); }
    else {
      stored = [{ ...fixture }];
      render(createElement(ChefMenuManager));
      await screen.findByRole("heading", { name: "Fixture dish" });
      if (method === "PUT") fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    }
    fetcher.mockResolvedValueOnce(Response.json({ code: "KITCHEN_PROFILE_REQUIRED" }, { status: 400 }));
    fireEvent.click(screen.getByRole(method === "PATCH" ? "switch" : "button", { name: method === "PATCH" ? "Availability for Fixture dish" : "Save Dish" }));
    expect((await screen.findByRole("link", { name: "Set up my kitchen" })).getAttribute("href")).toBe("/chef/kitchen");
    expect(screen.queryByRole("button", { name: "Save Dish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Dish" })).toBeNull();
    expect(screen.queryByText(/Dish (added|updated) successfully|Dish is now/)).toBeNull();
  });
  it("creates, edits, changes availability and retains the server result after remount", async () => {
    await openNew(); fillRequired();
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: true, unitPackageWeightGrams: 500, preparationTimeMinutes: null });
    fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "200.50" } });
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish updated successfully");
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: false });
    await waitFor(() => expect((screen.getByRole("switch", { name: "Availability for Fixture dish" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now available");
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now unavailable");
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("heading", { name: "Fixture dish" });
    expect(screen.getByText("₹200.50")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Availability for Fixture dish" }).getAttribute("aria-checked")).toBe("false");
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it("focuses each missing required field and never submits fractional packed weight", async () => {
    await openNew();
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Dish Name/)));
    expect(screen.getByText("Dish name is required.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Dish Name/), { target: { value: "Fixture" } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: "Meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Veg" })));
    fireEvent.click(screen.getByRole("radio", { name: "Veg" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Price/)));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText(/Packed weight/), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Packed weight/)));
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("shows server rejection codes and prevents an uncertain POST from being duplicated", async () => {
    await openNew(); fillRequired();
    fetcher.mockResolvedValueOnce(Response.json({ code: "MENU_REQUEST_FAILED" }, { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain("MENU_REQUEST_FAILED");
    expect(screen.queryByText("Dish added successfully")).toBeNull();
    fetcher.mockResolvedValueOnce(Response.json({ code: "MENU_TIMEOUT" }, { status: 504 }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByRole("button", { name: "Reload menu to check the save" });
    expect((screen.getByRole("button", { name: "Save Dish" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps load errors separate from a genuinely empty menu", async () => {
    fetcher.mockResolvedValue(Response.json({ code: "MENU_UNAVAILABLE" }, { status: 503 }));
    render(createElement(ChefMenuManager));
    expect(screen.getByRole("status", { name: "Loading menu" })).toBeTruthy();
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
    await screen.findByRole("button", { name: "Reload menu" });
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
  });
  it("rejects a photo above 8 MB and lets the Chef remove it and save without a photo", async () => {
    await openNew(); fillRequired();
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [file] } });
    expect(screen.getByText("Choose a JPEG, PNG or WebP photo up to 8 MB.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove selected photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
  });
  it("keeps the saved dish ID after a photo failure so retry updates instead of creating a duplicate", async () => {
    await openNew(); fillRequired();
    const original = fetcher.getMockImplementation()!;
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL() {} });
    fetcher.mockImplementation((input, options) => String(input).endsWith("/images") ? Promise.resolve(Response.json({ code: "MENU_IMAGE_UPLOAD_FAILED" }, { status: 500 })) : original(input, options));
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [new File(["fixture"], "photo.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Dish details saved, but the photo was not confirmed");
    expect(screen.queryByText("Dish added successfully")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove selected photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish updated successfully");
    expect(stored).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url, options]) => url === "/api/chef/menu" && options?.method === "POST")).toHaveLength(1);
  });
});

describe("Approved Chef first step", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  });
  it.each([false, true])("offers the correct approval action when a saved kitchen exists: %s", async hasKitchen => {
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(Response.json(hasKitchen ? kitchenFixture : null));
      if (["/api/chef/menu", "/api/chef/orders", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json([]));
      return normal(input);
    });
    render(createElement(ChefModeDashboard));
    const first = await screen.findByRole("link", { name: hasKitchen ? "Add my first dish" : "Set up my kitchen" });
    expect(first.getAttribute("href")).toBe(hasKitchen ? "/chef/menu" : "/chef/kitchen");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(hasKitchen);
  });
  it.each(["unavailable", "invalid"])("does not claim kitchen setup is missing after a %s kitchen read", async state => {
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(state === "unavailable" ? Response.json({}, { status: 503 }) : Response.json({ kitchenName: "Incomplete" }));
      if (["/api/chef/orders", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json([]));
      return normal(input);
    });
    render(createElement(ChefModeDashboard));
    await screen.findByRole("button", { name: "Refresh kitchen and menu" });
    expect(screen.queryByRole("link", { name: "Set up my kitchen" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Name my kitchen" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(false);
  });
});
