// @vitest-environment jsdom
// Disposable response fixtures exercise the updated flow; no production APIs are called.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { ChefLanguageStart, ChefOnboardingWorkspace } from "@/features/chef-onboarding/components/chef-onboarding-workspace";
import { ChefApplicationStatus } from "@/features/chef-onboarding/components/chef-application-status";
import { LanguagePicker } from "@/features/chef-onboarding/components/chef-language-picker";
import { useChefOnboarding } from "@/features/chef-onboarding/components/use-chef-onboarding";
import { EMPTY_ONBOARDING, ONBOARDING_LANGUAGES } from "./chef-onboarding-v2-contract";
import {
  CHEF_SECTIONS,
  applicationPhaseCopy,
  chefSectionDescription,
  chefSectionLabel,
  chefSectionTitle,
  fssaiGuideText,
  type ChefApplicationPhase,
  type ChefFormScreen,
} from "./chef-onboarding-flow";
import { setSessionIdentity } from "../../auth/api/cravesAuth";
import { LanguageProvider } from "@/shared/i18n/language-context";
import type { Language } from "@/shared/i18n/language";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/chef/application", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/sign-in/components/EmailVerificationPanel", () => ({ EmailVerificationPanel: () => null }));
vi.mock("@/features/addresses/components/AddressMapPicker", () => ({ AddressMapPicker: () => null }));
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
// The language picker opens a sheet; skipped animations let it leave the page at once.
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
async function chooseLanguage(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: /^Video language/ }));
  fireEvent.click(await screen.findByRole("button", { name }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Video language" })).toBeNull());
}

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
  document.cookie = "craves_lang=; Path=/; Max-Age=0";
});
// createElement passes children as its third argument; the cast only makes that prop optional.
const Provider = LanguageProvider as (props: { initial: Language; chosen: boolean; children?: ReactNode }) => ReactNode;
const inLanguage = (language: Language, chosen = true) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { initial: language, chosen }, children);
  };
function mount() {
  return render(
    createElement(ChefOnboardingWorkspace, {
      fallback: createElement("p", null, "Existing Chef workspace"),
    }),
  );
}
async function resume() {
  fireEvent.click(await screen.findByRole("button", { name: "Continue application" }));
  return screen.findByRole("heading", { name: "FSSAI details" });
}
it("names every video language in English under its own script", async () => {
  render(createElement(LanguagePicker, { labelId: "language-label", value: "en", onChange: () => undefined }));
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("dialog", { name: "Video language" });
  for (const [code, label] of ONBOARDING_LANGUAGES) {
    if (code === "en") continue;
    const option = screen.getByText(label).closest("button");
    expect(option?.textContent?.length, `${code} needs an English name`).toBeGreaterThan(label.length);
  }
});

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
  await screen.findByText(/The video guide is coming soon/);
  await chooseLanguage(/తెలుగు/);
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("language=te"))).toBe(
      true,
    ),
  );
  expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
});
it("keeps an approved Chef's kitchen available without forcing new application submission", async () => {
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
  expect((await screen.findByRole("link", { name: "Open your kitchen" })).getAttribute("href")).toBe(
    "/chef",
  );
  expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
});
it("explains an absent FSSAI number and continues without one only after the backend save", async () => {
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
  await screen.findByRole("heading", { name: "How to apply for FSSAI" });
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByRole("heading", { name: "Identity verification" });
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "PUT")).toBe(true);
});
it("uses the number-only FSSAI form without offering a certificate or selfie upload", async () => {
  mount();
  await resume();
  expect(screen.getByLabelText("FSSAI registration number")).toBeTruthy();
  expect(screen.queryByLabelText(/certificate|licence document|selfie/i)).toBeNull();
});
it("preserves an unsaved language choice after a failed save and confirms only a successful retry", async () => {
  let failSave = true;
  const saveBodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        const body = JSON.parse(String(options.body));
        saveBodies.push(body);
        if (failSave) return Response.json({ message: "Save is temporarily unavailable." }, { status: 503 });
        return Response.json({ ...state, version: 2, details: body.details });
      }
      return Response.json(url.includes("/content") ? [] : state);
    }),
  );
  mount();
  await resume();
  fireEvent.click(screen.getByRole("button", { name: "Don’t have FSSAI?" }));
  await chooseLanguage(/తెలుగు/);
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Save is temporarily unavailable.");
  expect(screen.queryByRole("heading", { name: "Identity verification" })).toBeNull();
  expect(screen.getByRole("button", { name: /^Video language/ }).textContent).toContain("తెలుగు");
  failSave = false;
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByRole("heading", { name: "Identity verification" });
  expect(saveBodies).toHaveLength(2);
  expect(saveBodies).toEqual([
    expect.objectContaining({ expectedVersion: 1, details: expect.objectContaining({ language: "te" }) }),
    expect.objectContaining({ expectedVersion: 1, details: expect.objectContaining({ language: "te" }) }),
  ]);
});
it("keeps what was typed when the chef has to sign in again, and brings it back afterwards", async () => {
  const first = mount();
  await resume();
  fireEvent.change(screen.getByLabelText("FSSAI registration number"), { target: { value: "12345678901234" } });
  // "Sign in again" announces itself before leaving for the OTP page.
  window.dispatchEvent(new Event("craves:before-sign-in"));
  first.unmount();
  mount();
  await screen.findByText(/You’re signed in again/);
  await resume();
  expect((screen.getByLabelText("FSSAI registration number") as HTMLInputElement).value.replace(/\D/g, "")).toBe("12345678901234");
  // Kept once: a later visit opens the saved application as it is.
  cleanup();
  mount();
  await resume();
  expect((screen.getByLabelText("FSSAI registration number") as HTMLInputElement).value).toBe("");
});

it("asks a chef new to this device for a language before anything else, and one tap carries on", async () => {
  render(createElement(ChefLanguageStart, null, createElement("p", null, "Application")), { wrapper: inLanguage("en", false) });
  // Asked in all three languages, with no Back, Save & exit or footer to get in the way.
  expect(screen.getByRole("dialog", { name: "Choose your language" })).toBeTruthy();
  expect(screen.getByText("మీ భాషను ఎంచుకోండి")).toBeTruthy();
  expect(screen.getByText("ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Back|Save & exit|^Change language/ })).toBeNull();
  expect(screen.queryByText("Application")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /ಕನ್ನಡ/ }));
  expect(await screen.findByText("Application")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.cookie).toContain("craves_lang=kn");
});

it("speaks the chef's language on every step and keeps the language one tap away", async () => {
  render(createElement(ChefOnboardingWorkspace, { fallback: null }), { wrapper: inLanguage("te") });
  expect(await screen.findByRole("heading", { name: "మళ్లీ స్వాగతం, Test" })).toBeTruthy();
  expect(screen.getByText("వంటగది వివరాలు")).toBeTruthy();
  expect(screen.getByRole("button", { name: "దరఖాస్తు కొనసాగించండి" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "సేవ్ చేసి వెళ్లండి" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "భాష మార్చండి: తెలుగు" }));
  fireEvent.click(await screen.findByRole("button", { name: /ಕನ್ನಡ/ }));
  expect(await screen.findByRole("heading", { name: "ಮತ್ತೆ ಸ್ವಾಗತ, Test" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ಉಳಿಸಿ ಹೊರಡಿ" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ಭಾಷೆ ಬದಲಿಸಿ: ಕನ್ನಡ" })).toBeTruthy();
});

it("starts the FSSAI video in the chef's language until the first save, which sends it", async () => {
  const draft = { ...state, details: null, application: { id, status: "NOT_SUBMITTED", documents: [] } };
  const saves: { details: { language: string } }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        const body = JSON.parse(String(options.body));
        saves.push(body);
        return Response.json({ ...draft, version: 2, details: body.details });
      }
      return Response.json(url.includes("/content") ? [] : draft);
    }),
  );
  const fresh = renderHook(() => useChefOnboarding(), { wrapper: inLanguage("kn") });
  await waitFor(() => expect(fresh.result.current.details.language).toBe("kn"));
  // Not something the chef typed: leaving asks nothing.
  expect(fresh.result.current.dirty).toBe(false);
  await act(() => fresh.result.current.persist());
  expect(saves).toEqual([expect.objectContaining({ details: expect.objectContaining({ language: "kn" }) })]);
  fresh.unmount();

  // A saved application keeps its own choice.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(state)));
  const saved = renderHook(() => useChefOnboarding(), { wrapper: inLanguage("kn") });
  await waitFor(() => expect(saved.result.current.state).not.toBeNull());
  expect(saved.result.current.details.language).toBe("en");
});

it("explains the application status in the chef's language", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id, status: "PENDING", documents: [] })));
  render(createElement(ChefApplicationStatus, { draftsEnabled: false }), { wrapper: inLanguage("kn") });
  expect(await screen.findByText("ಕಳುಹಿಸಲಾಗಿದೆ")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "ನಿಮ್ಮ ಅರ್ಜಿ" })).toBeTruthy();
  expect(screen.getByText("ಮುಂದೆ ಏನಾಗುತ್ತದೆ?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "ಸ್ಥಿತಿ ಮತ್ತೆ ನೋಡಿ" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ಗ್ರಾಹಕ ಆ್ಯಪ್‌ಗೆ ಬದಲಿಸಿ" })).toBeTruthy();
});

it("names every screen, section and status in Telugu and Kannada", () => {
  const screens: ChefFormScreen[] = [...CHEF_SECTIONS, "review", "resume", "submitted", "status"];
  const phases: ChefApplicationPhase[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED"];
  for (const language of ["te", "kn"] as const) {
    for (const screen of screens) {
      expect(chefSectionTitle(screen, language), screen).not.toBe(chefSectionTitle(screen));
      expect(chefSectionDescription(screen, language), screen).not.toBe(chefSectionDescription(screen));
    }
    // "FSSAI" is a name and stays as it is.
    for (const section of CHEF_SECTIONS.filter((section) => section !== "fssai"))
      expect(chefSectionLabel(section, language), section).not.toBe(chefSectionLabel(section));
    for (const phase of phases) {
      expect(applicationPhaseCopy(phase, language).label, phase).not.toBe(applicationPhaseCopy(phase).label);
      expect(applicationPhaseCopy(phase, language).message, phase).not.toBe(applicationPhaseCopy(phase).message);
    }
    expect(fssaiGuideText(language).title).not.toBe(fssaiGuideText().title);
  }
});
