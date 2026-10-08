// @vitest-environment jsdom
// Disposable response fixtures exercise the updated flow; no production APIs are called.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChefOnboardingWorkspace } from "@/components/chef-onboarding-workspace";
import { EMPTY_ONBOARDING } from "./chef-onboarding-v2-contract";
import { setSessionIdentity } from "../services/auth/cravesAuth";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/auth/EmailVerificationPanel", () => ({ EmailVerificationPanel: () => null }));
vi.mock("@/components/location/AddressMapPicker", () => ({ AddressMapPicker: () => null }));
const id = "12345678-1234-4123-8123-123456789012";
const state = {
  enabled: true,
  legacy: false,
  version: 1,
  resumeStep: "fssai",
  submitted: false,
  phoneNumber: "+910000000000",
  details: {
    ...EMPTY_ONBOARDING,
    email: "chef@example.invalid",
    firstName: "Test",
    lastName: "Chef",
    dateOfBirth: "1990-01-01",
    kitchenName: "Saved kitchen",
    addressLine1: "Test",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500001",
    latitude: 17.4,
    longitude: 78.4,
  },
  application: { id, status: "PENDING", documents: [] },
  documents: ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"].map((documentType) => ({
    id,
    documentType,
    originalFileName: "fixture.png",
    fileSizeBytes: 100,
    status: "UPLOADED",
    reviewReason: null,
    reviewedAt: null,
  })),
  requiredDocuments: ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2", "FSSAI_LICENSE"],
  supportPhone: "+910000000000",
  supportEmail: "support@example.invalid",
};
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  setSessionIdentity({
    id,
    phoneNumber: state.phoneNumber,
    displayName: "Fixture",
    email: state.details.email,
    emailVerified: true,
    status: "ACTIVE",
    roles: ["CUSTOMER"],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => Response.json(url.includes("/content") ? [] : state)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  return render(
    createElement(ChefOnboardingWorkspace, {
      fallback: createElement("p", null, "Existing Chef workspace"),
    }),
  );
}
async function resume() {
  fireEvent.click(await screen.findByRole("button", { name: "Continue onboarding" }));
  return screen.findByRole("heading", { name: "FSSAI details" });
}
it("restores the first incomplete FSSAI section on the next mount", async () => {
  const first = mount();
  await resume();
  first.unmount();
  mount();
  await resume();
  expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
});
it("shows the selected-language empty state without claiming translated content", async () => {
  mount();
  await resume();
  fireEvent.click(screen.getByRole("button", { name: "Don’t have FSSAI?" }));
  await screen.findByText(/No learning content is published/);
  fireEvent.change(screen.getByLabelText("Preferred language"), { target: { value: "te" } });
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("language=te"))).toBe(
      true,
    ),
  );
  expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
});
it("keeps an approved Chef's dashboard available without forcing new application submission", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ...state,
        legacy: true,
        application: { ...state.application, status: "APPROVED" },
      }),
    ),
  );
  mount();
  expect((await screen.findByRole("link", { name: "Go to dashboard" })).getAttribute("href")).toBe(
    "/chef",
  );
  expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
});
it("explains an absent FSSAI number and confirms save-for-later only after the backend save", async () => {
  mount();
  await resume();
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Enter your 14-digit FSSAI registration number",
  );
  expect(
    vi.mocked(fetch).mock.calls.every(([, options]) => !options || options.method !== "PUT"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Don’t have FSSAI?" }));
  fireEvent.click(screen.getByRole("button", { name: "Save progress for later" }));
  await screen.findByText("Your progress is saved. Add your FSSAI number when you are ready.");
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "PUT")).toBe(true);
});
it("uses the number-only FSSAI form without offering a certificate or selfie upload", async () => {
  mount();
  await resume();
  expect(screen.getByLabelText("FSSAI registration number")).toBeTruthy();
  expect(screen.queryByLabelText(/certificate|licence document|selfie/i)).toBeNull();
});
