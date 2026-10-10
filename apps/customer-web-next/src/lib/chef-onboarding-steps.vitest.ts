// @vitest-environment jsdom
// Disposable application fixtures; the App Router is replaced by an in-memory URL with Back support.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefOnboardingWorkspace } from "@/components/chef-onboarding-workspace";
import { ChefApplicationStatus } from "@/components/chef-application-status";
import { ChefApplicationWorkspace } from "@/components/chef-application-workspace";
import { EMPTY_ONBOARDING } from "./chef-onboarding-v2-contract";
import { setSessionIdentity } from "../services/auth/cravesAuth";

const url = vi.hoisted(() => {
  const entries = [""];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const search = (href: string) => href.split("?")[1] ?? "";
  return {
    get: () => entries[entries.length - 1]!,
    reset: (value = "") => void entries.splice(0, entries.length, value),
    push: (href: string) => { entries.push(search(href)); emit(); },
    replace: (href: string) => { entries[entries.length - 1] = search(href); emit(); },
    back: () => { entries.pop(); emit(); },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => void listeners.delete(listener); },
  };
});
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => navigation,
    usePathname: () => "/chef/application",
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(url.subscribe, url.get)),
  };
});
vi.mock("@/components/auth/EmailVerificationPanel", () => ({ EmailVerificationPanel: () => null }));
vi.mock("@/components/location/AddressMapPicker", () => ({ AddressMapPicker: () => null }));

const HUB = "/chef/application/status";
const id = "12345678-1234-4123-8123-123456789012";
type Fixture = Record<string, unknown> & { details: Record<string, unknown> | null; application: Record<string, unknown> };
let state: Fixture;
let application: Record<string, unknown>;

function draft(): Fixture {
  return {
    enabled: true, legacy: false, version: 1, resumeStep: "fssai", submitted: false, phoneNumber: "+910000000000",
    details: { ...EMPTY_ONBOARDING, email: "chef@example.invalid", firstName: "Test", lastName: "Chef", dateOfBirth: "1990-01-01",
      kitchenName: "Saved kitchen", addressLine1: "Test", city: "Hyderabad", state: "Telangana", postalCode: "500001", latitude: 17.4, longitude: 78.4 },
    application: { id, status: "PENDING", documents: [] },
    documents: ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"].map((documentType) => ({ id, documentType, originalFileName: "fixture.png", fileSizeBytes: 100, status: "UPLOADED", reviewReason: null, reviewedAt: null })),
    requiredDocuments: ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2", "FSSAI_LICENSE"],
    supportPhone: "+910000000000", supportEmail: "support@example.invalid",
  };
}

beforeEach(() => {
  url.reset();
  state = draft();
  application = { id, status: "PENDING", documents: [] };
  navigation.push.mockReset().mockImplementation((href: string) => { if (href.startsWith("/chef/application?") || href === "/chef/application") url.push(href); });
  navigation.replace.mockReset().mockImplementation((href: string) => { if (href.startsWith("/chef/application?") || href === "/chef/application") url.replace(href); });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  setSessionIdentity({ id, phoneNumber: "+910000000000", displayName: "Fixture", email: "chef@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const target = String(input);
    if (target === "/api/chef/onboarding") return Response.json(state);
    if (target === "/api/chef/application") return Response.json(application);
    if (target.includes("/content")) return Response.json([]);
    return Response.json([], { status: target.startsWith("/api/customer") ? 404 : 200 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mount() {
  return render(createElement(ChefOnboardingWorkspace, { fallback: createElement("p", null, "Legacy") }));
}

describe("Onboarding steps in the URL", () => {
  it("walks back through the steps with browser Back", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Continue application" }));
    await screen.findByRole("heading", { name: "FSSAI details" });
    expect(url.get()).toBe("step=fssai");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Your kitchen" });
    expect(url.get()).toBe("step=kitchen");
    act(() => url.back());
    await screen.findByRole("heading", { name: "FSSAI details" });
    act(() => url.back());
    await screen.findByRole("heading", { name: "Welcome back, Test" });
  });

  it("restores the step in the URL and sends an unknown step to the first incomplete one", async () => {
    url.reset("step=kitchen");
    const first = mount();
    await screen.findByRole("heading", { name: "Your kitchen" });
    first.unmount();
    url.reset("step=delivery");
    mount();
    await screen.findByRole("heading", { name: "FSSAI details" });
    expect(navigation.replace).toHaveBeenCalledWith("/chef/application?step=fssai", { scroll: false });
  });

  it("never reopens a submitted application's form from the URL", async () => {
    state.submitted = true;
    url.reset("step=kitchen");
    mount();
    await screen.findByText("Submitted");
    expect(screen.queryByRole("heading", { name: "Your kitchen" })).toBeNull();
    expect(url.get()).toBe("");
  });
});

describe("Leaving the application", () => {
  it("Save & exit, Escape and Back from Welcome back open the application hub", async () => {
    mount();
    await screen.findByRole("heading", { name: "Welcome back, Test" });
    fireEvent.click(screen.getByRole("button", { name: "Save & exit" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigation.push.mock.calls.filter(([href]) => href === HUB)).toHaveLength(3);
    expect(navigation.push).not.toHaveBeenCalledWith("/home");
  });

  it("asks before leaving unsaved first-step changes and warns before the page unloads", async () => {
    state.details = null;
    state.application = { id, status: "NOT_SUBMITTED", documents: [] };
    mount();
    await screen.findByRole("heading", { name: "Basic details" });
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Unsaved Chef" } });
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalledWith(HUB);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigation.push).toHaveBeenCalledWith(HUB);
  });
});

describe("Application hub", () => {
  function hub(draftsEnabled = false) {
    return render(createElement(ChefApplicationStatus, { draftsEnabled }));
  }
  it("opens the kitchen for an approved application", async () => {
    application = { id, status: "APPROVED", documents: [] };
    hub();
    expect((await screen.findByRole("link", { name: "Open your kitchen" })).getAttribute("href")).toBe("/chef");
  });
  it("explains what happens next for a submitted application and keeps the applicant in Chef Mode", async () => {
    hub();
    await screen.findByText("Submitted");
    expect(screen.getByText("What happens next?")).toBeTruthy();
    expect(screen.getByText(/reviewed in the order they arrive/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to customer app" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryAllByRole("link").some((link) => link.getAttribute("href") === "/home")).toBe(false);
  });
  it("continues a draft and shows a rejection with its reason and support", async () => {
    application = { id, status: "NOT_SUBMITTED", documents: [] };
    const view = hub();
    expect((await screen.findByRole("link", { name: "Continue application" })).getAttribute("href")).toBe("/chef/application");
    view.unmount();
    application = { id, status: "REJECTED", rejectionReason: "The ID photo was unreadable.", documents: [] };
    hub();
    await screen.findByText("The ID photo was unreadable.");
    expect(screen.getByRole("link", { name: "Contact Craves support" }).getAttribute("href")).toBe("/contact");
  });
  it("opens the section a reviewer asked to change", async () => {
    state.progress = { status: "MORE_INFORMATION_REQUIRED", reason: "Retake the kitchen photo.", nextAction: "EDIT_APPLICATION", sections: ["kitchen"], fssaiVerified: false, termsVersion: "v1" };
    application = { id, status: "PENDING", documents: [] };
    hub(true);
    await screen.findByText("Retake the kitchen photo.");
    expect(screen.getByRole("link", { name: "Update application" }).getAttribute("href")).toBe("/chef/application?step=kitchen");
  });
});

describe("Legacy application steps", () => {
  it("lets browser Back return to the previous step and signs existing chefs in to Chef Mode", async () => {
    application = { id, status: "NOT_SUBMITTED", documents: [] };
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    vi.stubGlobal("scrollTo", vi.fn());
    render(createElement(ChefApplicationWorkspace));
    expect((await screen.findByRole("link", { name: "Already a Chef? Login" })).getAttribute("href")).toBe("/chef/sign-in");
    fireEvent.click(screen.getByRole("button", { name: /Become a Chef/ }));
    await screen.findByRole("heading", { name: "What’s your name?" });
    expect(url.get()).toBe("step=about");
    act(() => url.back());
    await waitFor(() => expect(screen.getByRole("button", { name: /Become a Chef/ })).toBeTruthy());
  });
});
