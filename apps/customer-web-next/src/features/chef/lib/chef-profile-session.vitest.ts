// @vitest-environment jsdom
// Actual rendered components; all service responses and identity changes are disposable fixtures.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { Fragment, createElement, useState } from "react";
import { usePathname } from "next/navigation";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChefMenuManager } from "../components/chef-menu-manager";
import { ChefKitchenForm } from "../components/chef-kitchen-form";
import { ChefModeDashboard } from "../components/chef-mode-dashboard";
import { ChefShell } from "../components/chef-shell";
import { ChefWorkspaceNavigation } from "../components/chef-workspace-navigation";
import type { ChefMenuItem } from "./chef-menu-contract";
import type { ChefKitchen } from "./chef-kitchen-types";
import { ChefAccessBoundary } from "../components/chef-access-boundary";
import { ChefBankOnboardingPanel } from "../components/chef-bank-onboarding-panel";
import ChefFinancePage from "../../../app/chef/finance/page";
import ChefBankPage from "../../../app/chef/bank/page";
import ProfilePage from "../../profile/screens/Profile";
import { captureSessionContext, clearSession, getSession, invalidateSession, setSessionEmailVerification, setSessionIdentity } from "../../auth/api/cravesAuth";
import type { CravesIdentity } from "../../auth/lib/auth-contract";
import { markChefModeVerified } from "./chef-mode";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, Link: ({ children }: { children: unknown }) => children }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/profile"), useRouter: () => ({ push: navigate, replace: navigate }) }));
vi.mock("../../addresses/components/AddressMapPicker", () => ({ AddressMapPicker: () => null }));

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
beforeEach(() => { identity = a; setSessionIdentity(a); markChefModeVerified(a.id); navigate.mockReset(); vi.mocked(usePathname).mockReturnValue("/profile"); fetcher = vi.fn<typeof fetch>(normal); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
// Like /chef/sign-in: a new sign-in ends Chef Mode, then the OTP-verified chef marks it again.
function change(owner: CravesIdentity) { identity = owner; act(() => { setSessionIdentity(owner); markChefModeVerified(owner.id); }); }
const toChefSignIn = expect.stringMatching(/^\/chef\/sign-in\?returnTo=/);
/** Profile asks before signing out: the card opens the dialog, whose own "Sign out" confirms. */
async function confirmSignOut() {
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await screen.findByRole("dialog", { name: "Sign out of Craves?" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
}

describe("Chef navigation placement", () => {
  it("keeps fixed bottom navigation outside the filtered sticky header", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/menu");
    render(createElement(ChefShell, { language: "en", chosen: true }, createElement("main", null, "Chef fixture")));
    const header = screen.getByRole("link", { name: "Craves Chef home" }).closest("header")!;
    expect(screen.getByRole("link", { name: "Craves Chef home" }).getAttribute("href")).toBe("/chef");
    expect(header.contains(screen.getByRole("button", { name: "Account menu" }))).toBe(true);
    expect(screen.queryByRole("link", { name: /Back to Craves|Customer home/ })).toBeNull();
    expect(header.contains(screen.getByRole("navigation", { name: "Chef workspace" }))).toBe(true);
    expect(header.contains(screen.getByRole("navigation", { name: "Chef primary navigation" }))).toBe(false);
    expect(screen.getByRole("navigation", { name: "Chef primary navigation" }).closest(".chef-panel-theme")).toBeTruthy();
  });
  it.each([
    ["/chef", "Home", "page"], ["/chef/orders/fixture", "Orders", "true"], ["/chef/menu", "Menu", "page"], ["/chef/earnings", "Money", "page"],
    ["/chef/finance", "Money", "true"], ["/chef/statements", "Money", "true"], ["/chef/bank", "Money", "true"],
    ["/chef/earnings/payouts", "Money", "true"], ["/chef/earnings/orders", "Money", "true"], ["/chef/meal-plans", "Menu", "true"],
    ["/chef/profile", "More", "page"], ["/chef/kitchen", "More", "true"], ["/chef/operations", "More", "true"], ["/chef/hours", "More", "true"],
    ["/chef/capacity", "More", "true"], ["/chef/support", "More", "true"], ["/chef/application/status", "More", "true"],
  ])("keeps labeled active navigation for %s", (pathname, label, current) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    render(createElement(ChefWorkspaceNavigation, { placement: "bottom" }));
    const links = screen.getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Home", "Orders", "Menu", "Money", "More"]);
    expect(screen.getByRole("link", { name: label }).getAttribute("aria-current")).toBe(current);
    expect(links.filter(link => link.hasAttribute("aria-current"))).toHaveLength(1);
  });
  it("retains onboarding and Chef-access visibility boundaries", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/application");
    const view = render(createElement(ChefWorkspaceNavigation, { placement: "bottom" }));
    expect(screen.queryByRole("navigation")).toBeNull();
    vi.mocked(usePathname).mockReturnValue("/chef/sign-in");
    view.rerender(createElement(ChefWorkspaceNavigation, { placement: "bottom" }));
    expect(screen.queryByRole("navigation")).toBeNull();
    vi.mocked(usePathname).mockReturnValue("/chef/menu");
    view.rerender(createElement(ChefWorkspaceNavigation, { placement: "bottom" }));
    expect(screen.getByRole("navigation")).toBeTruthy();
    change({ ...a, roles: ["CUSTOMER"] });
    expect(screen.queryByRole("navigation")).toBeNull();
  });
  it("marks the bell, not a tab, on Notifications", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/notifications");
    render(createElement(ChefShell, { language: "en", chosen: true }, createElement("main", null, "Chef fixture")));
    expect(screen.getByRole("link", { name: "Notifications" }).getAttribute("aria-current")).toBe("page");
    const tabs = within(screen.getByRole("navigation", { name: "Chef primary navigation" })).getAllByRole("link");
    expect(tabs.filter(link => link.hasAttribute("aria-current"))).toHaveLength(0);
  });
  it("shows the tabs at once on a device that remembers the kitchen, and hides them if the session says otherwise", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/orders");
    // Opened fresh: the session has not answered yet, and this device remembers Chef A's kitchen.
    act(() => invalidateSession(captureSessionContext()));
    render(createElement(ChefShell, { language: "en", chosen: true }, createElement("main", null, "Chef fixture")));
    expect(screen.getByRole("navigation", { name: "Chef primary navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
    // The account menu needs the account, so it waits for the answer.
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    act(() => { setSessionIdentity(a); });
    expect(screen.getByRole("navigation", { name: "Chef primary navigation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
    act(() => { setSessionIdentity(b); });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
    act(() => { setSessionIdentity({ ...a, roles: ["CUSTOMER"] }); });
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("chef finance owner boundaries", () => {
  it("shows the authoritative verified email alongside real finance panels", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByDisplayValue("a@example.invalid");
    await screen.findByRole("button", { name: "Send ₹11.00 to my bank" });
    // The money summary PDF moved to Statements; Balance & payouts keeps how the balance is worked out.
    expect(screen.getByText("How your balance is worked out")).toBeTruthy();
  });

  it("clears bank inputs and the old balance on owner change and ignores a late refresh", async () => {
    render(createElement(Fragment, null, createElement(ChefFinancePage), createElement(ChefBankPage)));
    await screen.findByRole("button", { name: "Send ₹11.00 to my bank" });
    fireEvent.change(await screen.findByLabelText("Account number"), { target: { value: "123456789" } });
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/finance/balance" && identity?.id === a.id ? late.promise : normal(input));
    fireEvent.click(screen.getByRole("button", { name: "Check balance again" }));
    change(b);
    expect(screen.queryByRole("button", { name: "Send ₹11.00 to my bank" })).toBeNull();
    await screen.findByRole("button", { name: "Send ₹22.00 to my bank" });
    expect((screen.getByLabelText("Account number") as HTMLInputElement).value).toBe("");
    await act(async () => { late.resolve(Response.json(balance(a))); });
    expect(screen.queryByRole("button", { name: "Send ₹11.00 to my bank" })).toBeNull();
    expect(screen.queryByDisplayValue("a@example.invalid")).toBeNull();
  });

  it("preserves healthy form input on a same-owner verified email update", async () => {
    render(createElement(Fragment, null, createElement(ChefFinancePage), createElement(ChefBankPage)));
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
    // Still no CHEF after a token refresh: say so (a new OTP wouldn't help), never a /chef ↔ status loop.
    await screen.findByRole("heading", { name: "Your chef access is on its way" });
    expect(navigate).not.toHaveBeenCalled();
    change(a);
    expect((await screen.findByLabelText("Private form") as HTMLInputElement).value).toBe("");
  });

  it("discards an old owner's delayed role synchronization", async () => {
    const late = deferred<Response>();
    // Approved after this token was signed: the boundary re-reads the roles with one refresh.
    change({ ...a, roles: ["CUSTOMER"] });
    fetcher.mockImplementation(input => String(input) === "/api/auth/refresh" && identity?.id === a.id ? late.promise : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef data")));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
    change({ ...b, roles: ["CUSTOMER"] });
    await screen.findByRole("heading", { name: "Your chef access is on its way" });
    await act(async () => { late.resolve(Response.json({ identity: a })); });
    expect(screen.queryByText("Private chef data")).toBeNull();
    expect(getSession()?.id).toBe(b.id);
  });

  it("removes finance and gives sign-in guidance for an inactive owner", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Send ₹11.00 to my bank" });
    change({ ...a, status: "SUSPENDED" });
    expect(screen.queryByRole("button", { name: "Send ₹11.00 to my bank" })).toBeNull();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(toChefSignIn));
  });

  it("hides private finance immediately while sign-out is pending and after completion", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Send ₹11.00 to my bank" });
    let signingOut!: Promise<void>;
    act(() => { signingOut = clearSession(); });
    expect(screen.queryByRole("button", { name: "Send ₹11.00 to my bank" })).toBeNull();
    identity = null;
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => { late.resolve(Response.json({ signedOut: true })); await signingOut; });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(toChefSignIn));
    expect(screen.queryByDisplayValue("a@example.invalid")).toBeNull();
  });

  it("protects standalone application bank fields before CHEF role approval", async () => {
    change({ ...a, roles: ["CUSTOMER"] });
    render(createElement(ChefBankOnboardingPanel));
    fireEvent.change(await screen.findByLabelText("Account number"), { target: { value: "123456789" } });
    change({ ...b, roles: ["CUSTOMER"] });
    expect((await screen.findByLabelText("Account number") as HTMLInputElement).value).toBe("");
    await waitFor(() => expect((screen.getByLabelText(/^Account holder/) as HTMLInputElement).value).toBe("Chef B Fixture"));
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
    await confirmSignOut();
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Try again" });
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
    await confirmSignOut();
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Try again" });
    await screen.findByText("Your account details are temporarily unavailable. Sign-out controls remain available below.");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    expect(getSession()?.id).toBe(a.id);
    fetcher.mockImplementation(input => {
      if (String(input) === "/api/auth/logout") { identity = null; return Promise.resolve(Response.json({ signedOut: true })); }
      return normal(input);
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(getSession()).toBeNull();
  });

  it("ignores an old logout failure after a fresh same-owner login", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    await confirmSignOut();
    change(a);
    await screen.findByRole("heading", { name: "Chef A Fixture", hidden: true });
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not let an older owner operation overwrite a newer pending logout", async () => {
    const first = deferred<Response>(); const second = deferred<Response>(); let calls = 0;
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? (++calls === 1 ? first.promise : second.promise) : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    await confirmSignOut();
    change(b);
    await screen.findByRole("heading", { name: "Chef B Fixture", hidden: true });
    // The dialog stays open for the new owner; its "Sign out" starts their own logout.
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { first.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    expect((screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await act(async () => { second.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Try again" });
    expect(getSession()?.id).toBe(b.id);
    expect(navigate).not.toHaveBeenCalled();
  });
});


describe("Chef menu save and recovery", () => {
  let stored: ChefMenuItem[];
  // Sheets and the dish form settle at once, so a closed sheet never leaves the page hidden.
  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  const fixture: ChefMenuItem = { id: a.id, itemName: "Fixture dish", description: null, category: "Meals", foodType: "VEG", price: 180, currency: "INR", servesCount: null, preparationTimeMinutes: null, spiceLevel: null, unitPackageWeightGrams: 500, thermoboxRequired: false, available: true, status: "ACTIVE", images: [], createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
  beforeEach(() => {
    stored = [];
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
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
  /** Category is a picker: a sheet of the categories customers browse. */
  async function pickCategory(name: string) {
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(await screen.findByRole("button", { name }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
  async function fillRequired() {
    fireEvent.change(screen.getByLabelText(/Dish name/), { target: { value: "Fixture dish" } });
    await pickCategory("Meals");
    fireEvent.click(screen.getByRole("radio", { name: "Veg" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText(/Packed weight/), { target: { value: "500" } });
  }
  it("saves a new dish as a draft after Currently Available is turned on and back off", async () => {
    await openNew(); await fillRequired();
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Dish added");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: "DRAFT", available: false });
  });
  it.each(["DRAFT", "INACTIVE"] as const)("preserves an existing %s dish after Currently Available is turned on and back off", async status => {
    stored = [{ ...fixture, status, available: false }];
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Changes saved");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status, available: false });
  });
  it.each([[409, "CHEF_SELLING_NOT_READY"], [503, "CATALOG_ELIGIBILITY_UNAVAILABLE"]] as const)("publishes a new Chef's first dish with its selected photo once %s %s is resolved", async (status, code) => {
    let publishingReady = false;
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, options) => {
      if (!publishingReady && String(input) === "/api/chef/menu" && options?.method === "POST" && JSON.parse(String(options.body)).status === "ACTIVE")
        return Response.json({ code }, { status });
      if (String(input).endsWith("/images")) return Response.json({ uploaded: true });
      return original(input, options);
    });
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL() {} });
    await openNew(); await fillRequired();
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [new File(["fixture"], "fixture.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain(code);
    expect(screen.getByRole("alert").textContent?.toLowerCase()).toContain("publishing");
    expect((screen.getByRole("button", { name: "Save dish" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Reload menu to check the save" })).toBeNull();
    expect((screen.getByLabelText(/Dish name/) as HTMLInputElement).value).toBe("Fixture dish");
    expect(screen.getByRole("img", { name: "Dish preview" }).getAttribute("src")).toBe("blob:fixture");
    expect(stored).toHaveLength(0);
    // The actual finance review/authority recovery happens outside this form.
    publishingReady = true;
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Dish added");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: true });
    expect(fetcher.mock.calls.filter(([url, options]) => url === "/api/chef/menu" && options?.method === "POST")).toHaveLength(2);
    const uploads = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/images"));
    expect(uploads).toHaveLength(1);
    expect(uploads[0][0]).toBe(`/api/chef/menu/${stored[0].id}/images`);
    expect((uploads[0][1]?.body as FormData).get("file")).toMatchObject({ name: "fixture.png" });
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("button", { name: "Edit Fixture dish" });
    expect(screen.getByRole("switch", { name: "Fixture dish available to order" }).getAttribute("aria-checked")).toBe("true");
  });
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
    cleanup(); await openNew(); await fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Dish added");
    fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "190" } });
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Changes saved");
    await waitFor(() => expect((screen.getByRole("switch", { name: "Fixture dish available to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Fixture dish available to order" }));
    await screen.findByText("Dish turned off");
    await waitFor(() => expect((screen.getByRole("switch", { name: "Fixture dish available to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Fixture dish available to order" }));
    await screen.findByText("Dish turned on");
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("button", { name: "Edit Fixture dish" });
    expect(screen.getByText("₹190")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Fixture dish available to order" }).getAttribute("aria-checked")).toBe("true");
  });
  it.each(["phoneNumber", "areaName", "postalCode"] as const)("focuses missing pickup %s instead of opening an unorderable kitchen", async field => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fetcher.mockImplementation(async input => {
      if (String(input) === "/api/chef/kitchen") return Response.json(null);
      if (String(input) === "/api/chef/application") return Response.json({ status: "APPROVED", firstName: "Fixture", lastName: "Chef", addressLine1: "Fixture house", city: "Hyderabad", state: "Telangana", postalCode: field === "postalCode" ? null : "500081", latitude: 17.4483, longitude: 78.3915 });
      throw new Error(`Unexpected kitchen fixture route ${input}`);
    });
    render(createElement(ChefKitchenForm));
    fireEvent.change(await screen.findByLabelText("Kitchen name"), { target: { value: "New kitchen" } });
    expect((screen.getByLabelText(/Kitchen phone/) as HTMLInputElement).value).toBe(a.phoneNumber);
    if (field === "phoneNumber") fireEvent.change(screen.getByLabelText(/Kitchen phone/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    if (field !== "areaName") fireEvent.change(screen.getByLabelText(/^Area/), { target: { value: "Madhapur" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    fireEvent.click(screen.getByRole("button", { name: /^Yes, get my kitchen ready/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
    const invalid = screen.getByLabelText(field === "phoneNumber" ? /Kitchen phone/ : field === "areaName" ? /^Area/ : /^Pincode/);
    expect(invalid.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(invalid);
    expect(screen.getByRole("alert").textContent).toContain("before opening your kitchen");
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  });
  it.each([null, "+919888888888"])("opens and persists a complete kitchen, preserving the saved pickup phone %s", async savedPhone => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    let saved: ChefKitchen = { ...kitchenFixture, phoneNumber: savedPhone, areaName: "Madhapur", postalCode: "500081", latitude: 17.4483, longitude: 78.3915 };
    fetcher.mockImplementation(async (input, options) => {
      if (String(input) === "/api/chef/kitchen" && options?.method === "PUT") {
        saved = { ...saved, ...JSON.parse(String(options.body)) };
        return Response.json(saved);
      }
      if (String(input) === "/api/chef/kitchen") return Response.json(saved);
      if (String(input) === "/api/chef/application") return Response.json({ status: "APPROVED" });
      throw new Error(`Unexpected kitchen fixture route ${input}`);
    });
    render(createElement(ChefKitchenForm));
    fireEvent.click(await screen.findByRole("button", { name: "Edit kitchen details" }));
    expect((screen.getByLabelText(/Kitchen phone/) as HTMLInputElement).value).toBe(savedPhone ?? a.phoneNumber);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    fireEvent.click(screen.getByRole("button", { name: /^Yes, get my kitchen ready/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
    await screen.findByText("Open");
    expect(saved).toMatchObject({ status: "ACTIVE", phoneNumber: savedPhone ?? a.phoneNumber, areaName: "Madhapur", postalCode: "500081", latitude: 17.4483, longitude: 78.3915 });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
    cleanup(); render(createElement(ChefKitchenForm));
    await screen.findByText("Open");
  });
  it("does not combine a stale kitchen load with another signed-in chef's phone", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(async input => String(input) === "/api/chef/kitchen" ? late.promise : Response.json({ status: "APPROVED", addressLine1: "Chef A private house" }));
    render(createElement(ChefKitchenForm));
    change({ ...b, phoneNumber: "+10000000002" });
    await act(async () => late.resolve(Response.json(null)));
    expect(screen.queryByDisplayValue("Chef A private house")).toBeNull();
    expect(screen.queryByDisplayValue("+10000000002")).toBeNull();
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
    if (method === "POST") { await openNew(); await fillRequired(); }
    else {
      stored = [{ ...fixture }];
      render(createElement(ChefMenuManager));
      await screen.findByRole("button", { name: "Edit Fixture dish" });
      if (method === "PUT") fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    }
    fetcher.mockResolvedValueOnce(Response.json({ code: "KITCHEN_PROFILE_REQUIRED" }, { status: 400 }));
    fireEvent.click(screen.getByRole(method === "PATCH" ? "switch" : "button", { name: method === "PATCH" ? "Fixture dish available to order" : "Save dish" }));
    expect((await screen.findByRole("link", { name: "Set up my kitchen" })).getAttribute("href")).toBe("/chef/kitchen");
    expect(screen.queryByRole("button", { name: "Save dish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Dish" })).toBeNull();
    expect(screen.queryByText(/Dish added|Changes saved|Dish turned/)).toBeNull();
  });
  it("creates, edits, changes availability and retains the server result after remount", async () => {
    await openNew(); await fillRequired();
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Dish added");
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: true, unitPackageWeightGrams: 500, preparationTimeMinutes: null });
    fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "200.50" } });
    fireEvent.click(screen.getByRole("switch", { name: /Customers can order it/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Changes saved");
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: false });
    await waitFor(() => expect((screen.getByRole("switch", { name: "Fixture dish available to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Fixture dish available to order" }));
    await screen.findByText("Dish turned on");
    fireEvent.click(screen.getByRole("switch", { name: "Fixture dish available to order" }));
    await screen.findByText("Dish turned off");
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("button", { name: "Edit Fixture dish" });
    expect(screen.getByText("₹200.50")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Fixture dish available to order" }).getAttribute("aria-checked")).toBe("false");
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it("focuses each missing required field and never submits fractional packed weight", async () => {
    await openNew();
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Dish name/)));
    expect(screen.getByText("Give your dish a name.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Dish name/), { target: { value: "Fixture" } });
    await pickCategory("Meals");
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Veg" })));
    fireEvent.click(screen.getByRole("radio", { name: "Veg" }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Price/)));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText(/Packed weight/), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Packed weight/)));
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("shows server rejection codes and prevents an uncertain POST from being duplicated", async () => {
    await openNew(); await fillRequired();
    fetcher.mockResolvedValueOnce(Response.json({ code: "MENU_REQUEST_FAILED" }, { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain("MENU_REQUEST_FAILED");
    expect(screen.queryByText("Dish added")).toBeNull();
    fetcher.mockResolvedValueOnce(Response.json({ code: "MENU_TIMEOUT" }, { status: 504 }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByRole("button", { name: "Reload menu to check the save" });
    expect((screen.getByRole("button", { name: "Save dish" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps load errors separate from a genuinely empty menu", async () => {
    fetcher.mockResolvedValue(Response.json({ code: "MENU_UNAVAILABLE" }, { status: 503 }));
    render(createElement(ChefMenuManager));
    expect(screen.getByRole("status", { name: "Loading menu" })).toBeTruthy();
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
    await screen.findByRole("button", { name: "Reload menu" });
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
  });
  it("rejects a photo above 8 MB without queueing it, so the dish still saves without that photo", async () => {
    await openNew(); await fillRequired();
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [file] } });
    expect(screen.getByText("Choose a JPEG, PNG or WebP photo up to 8 MB.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove large.png" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Dish added");
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/images"))).toBe(false);
  });
  it("adds up to 5 photos per dish and uploads each one once", async () => {
    stored = [{ ...fixture, images: [
      { id: "aaaaaaaa-1111-4111-8111-111111111111", publicUrl: "https://media.example/1.jpg", contentType: "image/jpeg", fileSizeBytes: 10, sortOrder: 0, primary: true },
      { id: "aaaaaaaa-2222-4222-8222-222222222222", publicUrl: "https://media.example/2.jpg", contentType: "image/jpeg", fileSizeBytes: 10, sortOrder: 1, primary: false },
    ] }];
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, options) => String(input).endsWith("/images") ? Promise.resolve(Response.json({ uploaded: true })) : original(input, options));
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL() {} });
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fixture dish" }));
    expect(screen.getByRole("img", { name: "Saved photo 1" })).toBeTruthy();
    expect(screen.getByText("Cover")).toBeTruthy();
    const files = ["a", "b", "c", "d"].map(name => new File(["x"], `${name}.png`, { type: "image/png" }));
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files } });
    expect(screen.getByText("You can add up to 5 photos per dish.")).toBeTruthy();
    expect(screen.getByText("5 of 5 photos")).toBeTruthy();
    expect(screen.queryByLabelText(/Add photo/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove b.png" }));
    expect(screen.getByText("4 of 5 photos")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Changes saved");
    const uploads = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/images"));
    expect(uploads.map(([, options]) => ((options?.body as FormData).get("file") as File).name)).toEqual(["a.png", "c.png"]);
    expect(uploads.every(([, options]) => (options?.body as FormData).get("primary") === "false")).toBe(true);
  });
  it("removes a saved photo and changes the cover right away", async () => {
    const one = { id: "aaaaaaaa-1111-4111-8111-111111111111", publicUrl: "https://media.example/1.jpg", contentType: "image/jpeg", fileSizeBytes: 10, sortOrder: 0, primary: true };
    const two = { id: "aaaaaaaa-2222-4222-8222-222222222222", publicUrl: "https://media.example/2.jpg", contentType: "image/jpeg", fileSizeBytes: 10, sortOrder: 1, primary: false };
    stored = [{ ...fixture, images: [one, two] }];
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, options) => {
      const url = String(input);
      if (url.endsWith(`/images/${two.id}`) && options?.method === "PUT") return Promise.resolve(Response.json({ ...stored[0], images: [{ ...one, primary: false }, { ...two, primary: true }] }));
      if (url.endsWith(`/images/${one.id}`) && options?.method === "DELETE") return Promise.resolve(Response.json({ ...stored[0], images: [{ ...two, primary: true }] }));
      return original(input, options);
    });
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.click(screen.getByRole("button", { name: "Make saved photo 2 the cover" }));
    await screen.findByText("Cover photo changed");
    expect((screen.getByRole("img", { name: "Saved photo 1" }) as HTMLImageElement).src).toBe("https://media.example/2.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Remove saved photo 2" }));
    await screen.findByText("Photo removed");
    expect(screen.queryByRole("img", { name: "Saved photo 2" })).toBeNull();
    expect(screen.getByText("1 of 5 photos")).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/images/")).map(([url, options]) => `${options?.method} ${url}`)).toEqual([
      `PUT /api/chef/menu/${fixture.id}/images/${two.id}`,
      `DELETE /api/chef/menu/${fixture.id}/images/${one.id}`,
    ]);
  });
  it("keeps the saved dish ID after a photo failure so retry updates instead of creating a duplicate", async () => {
    await openNew(); await fillRequired();
    const original = fetcher.getMockImplementation()!;
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL() {} });
    fetcher.mockImplementation((input, options) => String(input).endsWith("/images") ? Promise.resolve(Response.json({ code: "MENU_IMAGE_UPLOAD_FAILED" }, { status: 500 })) : original(input, options));
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [new File(["fixture"], "photo.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Dish details saved, but a photo was not confirmed");
    expect(screen.queryByText("Dish added")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Changes saved");
    expect(stored).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url, options]) => url === "/api/chef/menu" && options?.method === "POST")).toHaveLength(1);
  });
});

describe("Approved Chef first step", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // The approval prompt is the shared Sheet, which follows the wide-screen query.
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
  });
  it.each([false, true])("offers the correct approval action when a saved kitchen exists: %s", async hasKitchen => {
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(Response.json(hasKitchen ? kitchenFixture : null));
      if (["/api/chef/menu", "/api/chef/orders", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json([]));
      // The welcome is only for a chef approved in the last 30 days: it needs the approval date.
      if (url === "/api/chef/application") return Promise.resolve(Response.json({ firstName: "Fixture", lastName: "Chef", status: "APPROVED", reviewedAt: new Date().toISOString() }));
      return normal(input);
    });
    render(createElement(ChefModeDashboard));
    const first = await screen.findByRole("link", { name: hasKitchen ? "Add my first dish" : "Set up my kitchen" });
    expect(first.getAttribute("href")).toBe(hasKitchen ? "/chef/menu" : "/chef/kitchen");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(hasKitchen);
  });
  it("explains unconfirmed chef access once, with Try again and Get help instead of a new sign-in", async () => {
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(Response.json(kitchenFixture));
      if (url === "/api/chef/menu") return Promise.resolve(Response.json([]));
      if (["/api/chef/orders", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json({ code: "CHEF_ACCESS_REQUIRED" }, { status: 403 }));
      return normal(input);
    });
    const count = (path: string) => fetcher.mock.calls.filter(([url]) => url === path).length;
    render(createElement(ChefModeDashboard));
    await screen.findByText("Your orders couldn’t load");
    expect(screen.getByText(/it’s on our side/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in again", hidden: true })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Try again", hidden: true })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Get help", hidden: true }).getAttribute("href")).toBe("/chef/support");
    expect(screen.queryByRole("button", { name: "Check now", hidden: true })).toBeNull();
    expect(screen.queryByText(/^Orders:/)).toBeNull();
    // Try again re-reads the roles with one refresh, then loads the orders again.
    const refreshes = count("/api/auth/refresh");
    const orderReads = count("/api/chef/orders");
    fireEvent.click(screen.getByRole("button", { name: "Try again", hidden: true }));
    await waitFor(() => expect(count("/api/chef/orders")).toBeGreaterThan(orderReads));
    expect(count("/api/auth/refresh")).toBe(refreshes + 1);
  });
  it("shows the order note as a timed message the chef can also close", async () => {
    window.localStorage.setItem(`craves-chef-approved:${a.id}:approved`, "seen");
    const waiting = {
      id: "0bde0000-0000-4000-8000-000000000101", kitchenName: "Fixture kitchen", status: "CHEF_ACCEPTANCE_PENDING", currency: "INR",
      foodSubtotal: 149, platformFee: 9, taxAmount: 7.45, deliveryFee: 39, grandTotal: 204.45, chefResponseNote: null, prepTimeMinutes: null,
      deliveryAddress: null, createdAt: "2026-10-10T08:01:00Z", updatedAt: "2026-10-10T08:01:00Z",
      items: [{ id: "0bde0000-0000-4000-8000-000000001011", menuItemId: "d15b0000-0000-4000-8000-000000000004", itemName: "Rasmalai", category: "Desserts", foodType: "VEG", unitPrice: 149, quantity: 1, lineTotal: 149 }],
    };
    fetcher.mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(Response.json(kitchenFixture));
      if (["/api/chef/menu", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json([]));
      if (url === "/api/chef/orders") return Promise.resolve(Response.json([waiting]));
      if (url === `/api/chef/orders/${waiting.id}/accept` && init?.method === "POST")
        return Promise.resolve(Response.json({ ...waiting, status: "CHEF_ACCEPTED", prepTimeMinutes: 45, updatedAt: "2026-10-10T08:06:00Z" }));
      return normal(input);
    });
    render(createElement(ChefModeDashboard));
    fireEvent.click(await screen.findByRole("button", { name: "Choose another time" }));
    fireEvent.click(screen.getByText("45"));
    fireEvent.click(screen.getByRole("button", { name: "Start cooking" }));
    const note = await screen.findByText(/^Order #0BDE0000 accepted\./);
    // ChefFlash leaves on its own when its CSS countdown ends (jsdom never animates); the chef can also close it.
    expect(note).toBeTruthy();
    const flash = document.querySelector("#chef-order-update .chef-flash");
    expect(flash?.textContent).toMatch(/Order #0BDE0000 accepted\./);
    fireEvent.click(within(flash as HTMLElement).getByRole("button", { name: "Close message", hidden: true }));
    await waitFor(() => expect(document.querySelector("#chef-order-update .chef-flash")).toBeNull());
  });
  it.each(["unavailable", "invalid"])("does not claim kitchen setup is missing after a %s kitchen read", async state => {
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(state === "unavailable" ? Response.json({}, { status: 503 }) : Response.json({ kitchenName: "Incomplete" }));
      if (["/api/chef/orders", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json([]));
      return normal(input);
    });
    render(createElement(ChefModeDashboard));
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByRole("link", { name: "Set up my kitchen" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Name my kitchen" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(false);
  });
});
