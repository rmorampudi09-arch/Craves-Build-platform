// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { openLandingAuth } from "../landing-auth/entry";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), begin: vi.fn(), resend: vi.fn(), confirm: vi.fn(), token: vi.fn(),
  fetch: vi.fn(), navigate: vi.fn(), park: vi.fn(), install: vi.fn(), profile: vi.fn(),
  generation: 0, user: null as { id: string; roles: string[]; status: string } | null,
  listeners: new Set<() => void>(),
}));
vi.mock("./msg91-browser", () => ({ beginMsg91PhoneSignIn: mocks.begin, parkMsg91Captcha: mocks.park }));
vi.mock("../services/auth/cravesAuth", () => ({
  loadSession: mocks.load,
  captureSessionContext: () => ({ generation: mocks.generation, identityId: mocks.user?.id ?? null }),
  isSessionContextCurrent: (context: { generation: number; identityId: string | null }) =>
    context.generation === mocks.generation && context.identityId === (mocks.user?.id ?? null),
  isSessionReady: () => mocks.user?.status === "ACTIVE",
  setSessionIdentity: mocks.install,
  setSessionProfile: mocks.profile,
  subscribeSession: (listener: () => void) => { mocks.listeners.add(listener); return () => mocks.listeners.delete(listener); },
}));

const identity = { id: "d1111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", roles: ["CUSTOMER"], status: "ACTIVE" };
const profile = { id: identity.id, registeredPhoneNumber: identity.phoneNumber, firstName: "Asha", lastName: "Rao", email: null,
  createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.useRealTimers();
  mocks.generation = 0; mocks.user = null; mocks.listeners.clear();
  mocks.load.mockReset().mockResolvedValue(null);
  mocks.resend.mockReset().mockResolvedValue(undefined);
  mocks.token.mockReset().mockResolvedValue("verified-token");
  mocks.confirm.mockReset().mockResolvedValue({ user: { getIdToken: mocks.token } });
  mocks.begin.mockReset().mockResolvedValue({ confirm: mocks.confirm, resend: mocks.resend });
  mocks.navigate.mockReset(); mocks.park.mockReset();
  mocks.install.mockReset().mockImplementation((value) => {
    mocks.generation += 1; mocks.user = value;
    for (const listener of mocks.listeners) listener();
    return value;
  });
  mocks.profile.mockReset().mockImplementation(() => mocks.user);
  mocks.fetch.mockReset().mockImplementation((url) => Promise.resolve(response(url === "/api/auth/session" ? { identity } : profile)));
  vi.stubGlobal("fetch", mocks.fetch);
  const browser = window;
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  Object.defineProperty(browser, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  vi.stubGlobal("window", new Proxy(browser, { get: (target, key) => key === "location" ? { assign: mocks.navigate } : Reflect.get(target, key, target) }));
  document.body.innerHTML = '<div id="root"><button id="trigger">Sign up / Sign in</button><div id="page-content">Landing</div></div>';
  document.getElementById("trigger")!.focus();
});

async function closePopup() {
  const close = screen.queryByRole("button", { name: "Close sign in and sign up" });
  if (!close) return;
  await act(async () => { fireEvent.click(close); await new Promise((resolve) => setTimeout(resolve, 0)); });
}

afterEach(async () => {
  vi.useRealTimers();
  await closePopup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function requestCode() {
  fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "9876543210" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send verification code" })));
}

async function submitCode() {
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Submit$/ })));
}

it("opens the exact ZIP popup and switches registration roles without requesting codes", async () => {
  await act(async () => openLandingAuth());
  expect(screen.getByRole("dialog", { name: "Customer sign in" }).classList.contains("auth-modal__panel")).toBe(true);
  expect(document.getElementById("root")!.inert).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("button", { name: "Create a customer account" }));
  expect(screen.getByRole("dialog", { name: "Create your account" })).toBeTruthy();
  expect(screen.queryByLabelText(/Email/)).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: /Home Chef/ }));
  expect(screen.getByRole("radio", { name: /Home Chef/ })).toHaveProperty("checked", true);
  expect(screen.getByLabelText("First name", { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
  expect(screen.getByRole("dialog", { name: "Home Chef sign in" })).toBeTruthy();
  expect(mocks.begin).not.toHaveBeenCalled();
});

it("deduplicates opening and restores scrolling, focus and fields after close", async () => {
  await act(async () => Promise.all([openLandingAuth(), openLandingAuth()]));
  expect(mocks.load).toHaveBeenCalledOnce();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "9876543210" } });
  await closePopup();
  expect(document.getElementById("craves-customer-auth")).toBeNull();
  expect(document.getElementById("root")!.inert).toBe(false);
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement).toBe(document.getElementById("trigger"));
  await act(async () => openLandingAuth());
  expect(screen.getByLabelText(/Mobile number/)).toHaveProperty("value", "");
});

it("opens the popup when session lookup fails and validates fields locally", async () => {
  mocks.load.mockRejectedValueOnce(new Error("offline"));
  await act(async () => openLandingAuth());
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send verification code" })));
  expect(screen.getByRole("alert").textContent).toBe("Enter a valid 10-digit mobile number.");
  expect(document.activeElement).toBe(screen.getByLabelText(/Mobile number/));
  expect(mocks.begin).not.toHaveBeenCalled();
});

it("keeps failed code requests visible without entering an OTP or false success state", async () => {
  mocks.begin.mockRejectedValueOnce(new Error("OTP_UNAVAILABLE"));
  await act(async () => openLandingAuth());
  await requestCode();
  expect(screen.queryByLabelText("Verification code")).toBeNull();
  expect(screen.getByRole("status").textContent).toBeTruthy();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("resends only after the countdown using the existing confirmation", async () => {
  vi.useFakeTimers();
  await act(async () => openLandingAuth());
  await requestCode();
  expect(mocks.begin).toHaveBeenCalledWith("+919876543210", "craves-recaptcha", expect.any(Function));
  expect(screen.getByRole("button", { name: "Resend code in 30s" })).toHaveProperty("disabled", true);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resend OTP" })));
  expect(mocks.begin).toHaveBeenCalledOnce();
  expect(mocks.resend).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it("verifies through the session API and routes only according to backend-owned roles", async () => {
  await act(async () => openLandingAuth());
  fireEvent.click(screen.getByRole("radio", { name: "Home Chef" }));
  await requestCode();
  await submitCode();
  expect(mocks.confirm).toHaveBeenCalledWith("123456", expect.any(Function));
  expect(mocks.fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify({ firebaseIdToken: "verified-token" }) }));
  expect(mocks.install).toHaveBeenCalledWith(identity);
  expect(mocks.navigate).toHaveBeenCalledWith("/chef/application");
  expect(mocks.user?.roles).toEqual(["CUSTOMER"]);
});

it("registers the original name fields before routing to customer home", async () => {
  await act(async () => openLandingAuth());
  fireEvent.click(screen.getByRole("button", { name: "Create a customer account" }));
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Asha" } });
  fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Rao" } });
  await requestCode();
  await submitCode();
  expect(mocks.fetch).toHaveBeenCalledWith("/api/customer/profile", expect.objectContaining({ method: "PUT", body: JSON.stringify({ firstName: "Asha", lastName: "Rao" }) }));
  expect(mocks.profile).toHaveBeenCalledWith(profile, expect.any(Object));
  expect(mocks.navigate).toHaveBeenCalledWith("/home");
});

it("does not create a session when a pending OTP verification completes after close", async () => {
  let finish!: (value: { user: { getIdToken: typeof mocks.token } }) => void;
  mocks.confirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => openLandingAuth());
  await requestCode();
  await submitCode();
  await closePopup();
  await act(async () => finish({ user: { getIdToken: mocks.token } }));
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("closes stale popup work when another session takes ownership", async () => {
  let finish!: (value: { confirm: typeof mocks.confirm }) => void;
  mocks.begin.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => openLandingAuth());
  await requestCode();
  await act(async () => mocks.install({ ...identity, id: "e1111111-1111-4111-8111-111111111111" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await act(async () => finish({ confirm: mocks.confirm }));
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
