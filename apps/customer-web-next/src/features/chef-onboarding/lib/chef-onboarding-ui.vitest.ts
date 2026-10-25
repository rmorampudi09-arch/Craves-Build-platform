// @vitest-environment jsdom
// All identities, bank accounts, documents and HTTP responses are isolated fixtures.
import { createElement, useEffect, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { ChefOnboardingWorkspace } from "../components/chef-onboarding-workspace";
import { ChefApplicationStatus } from "../components/chef-application-status";
import { ChefAccessBoundary } from "../../chef/components/chef-access-boundary";
import { ChefOnboardingBank } from "../components/chef-onboarding-bank";
import { prepareChefUpload } from "../components/chef-onboarding-upload";
import { ChefReviewDetails } from "../components/chef-onboarding-sections";
import { DocumentCenter } from "../components/document-center";
import { DateOfBirthPicker } from "../components/chef-date-of-birth";
import type { ChefOnboardingFlow } from "../components/use-chef-onboarding";
import { LanguageProvider } from "../../../shared/i18n/language-context";
import type { Language } from "../../../shared/i18n/language";
import {
  EMPTY_ONBOARDING,
  parseOnboardingState,
  type OnboardingState,
} from "./chef-onboarding-v2-contract";
import {
  afterSectionSave,
  bankCanContinue,
  firstIncompleteSection,
  type ChefFormSection,
} from "./chef-onboarding-flow";
import { setSessionIdentity } from "../../auth/api/cravesAuth";
import { markChefModeVerified } from "../../chef/lib/chef-mode";
import type { BankStatus } from "../../admin/finance/lib/bank-onboarding-contract";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/chef/application", useSearchParams: () => new URLSearchParams() }));
vi.mock("../../addresses/components/AddressMapPicker", () => ({
  AddressMapPicker: ({ onCenterChange }: { onCenterChange: (value: unknown) => void }) =>
    createElement(
      "button",
      {
        type: "button",
        onClick: () => onCenterChange({ latitude: 17.4, longitude: 78.4 }),
        "aria-label": "Move kitchen pin",
      },
      "Map",
    ),
}));
let verifiedEmail = true;
vi.mock("../../sign-in/components/EmailVerificationPanel", () => ({
  EmailVerificationPanel: ({ onStateChange }: { onStateChange: (value: unknown) => void }) => {
    useEffect(() => {
      onStateChange({
        email: "fixture@example.invalid",
        emailVerified: verifiedEmail,
        emailRevision: 1,
        pending: null,
        serverTime: "2026-10-08T00:00:00Z",
      });
    }, [onStateChange]);
    return createElement(
      "p",
      null,
      verifiedEmail ? "Verified email" : "Email verification required",
    );
  },
}));
const id = "11111111-1111-4111-8111-111111111111";
const identity = {
  id,
  phoneNumber: "+910000000000",
  displayName: "Fixture Chef",
  email: "fixture@example.invalid",
  emailVerified: true,
  status: "ACTIVE",
  roles: ["CUSTOMER"],
};
const bankFixture: BankStatus = {
  accountHolderName: "Fixture Chef",
  bankName: "Test Bank", branchName: "Test branch",
  id,
  state: "WAITING_APPROVAL",
  lastFour: "5678",
  ifsc: "TEST0000001",
  bankValidated: true,
  applicationApproved: false,
  automaticActivation: true,
  message: "Bank verified; waiting for application approval.",
  updatedAt: "2026-10-08T00:00:00Z",
};
function complete(): OnboardingState {
  return {
    enabled: true,
    legacy: false,
    version: 1,
    resumeStep: "review",
    submitted: false,
    phoneNumber: identity.phoneNumber,
    supportPhone: "+910000000000",
    supportEmail: "support@example.invalid",
    requiredDocuments: [
      "SELECTED_PROOF_FRONT",
      "KITCHEN_PHOTO_1",
      "KITCHEN_PHOTO_2",
      "FSSAI_LICENSE",
    ],
    details: {
      ...EMPTY_ONBOARDING,
      firstName: "Fixture",
      lastName: "Chef",
      email: identity.email,
      dateOfBirth: "1990-01-01",
      kitchenName: "Fixture Kitchen",
      addressLine1: "1 Fixture Road",
      city: "Fixture City",
      state: "Fixture State",
      postalCode: "500001",
      latitude: 17.4,
      longitude: 78.4,
      proofKind: "PAN",
      fssaiNumber: "12345678901234",
    },
    application: {
      id,
      email: identity.email,
      firstName: "Fixture",
      lastName: "Chef",
      addressLine1: "1 Fixture Road",
      addressLine2: null,
      landmark: null,
      city: "Fixture City",
      state: "Fixture State",
      postalCode: "500001",
      latitude: 17.4,
      longitude: 78.4,
      status: "PENDING",
      rejectionReason: null,
      submittedAt: null,
      reviewedAt: null,
      documents: [],
    },
    documents: ["SELECTED_PROOF_FRONT", "KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"].map(
      (documentType) => ({
        id,
        documentType,
        originalFileName: documentType + ".png",
        fileSizeBytes: 100,
        status: "UPLOADED",
        reviewReason: null,
        reviewedAt: null,
      }),
    ),
  };
}
let saved: OnboardingState, bank: BankStatus, fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function normal(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
  if (url === "/api/auth/refresh") return Promise.resolve(Response.json({ identity }));
  if (url === "/api/customer/profile") return Promise.resolve(Response.json({}, { status: 404 }));
  if(url.startsWith("/api/chef-onboarding/bank/ifsc/")) return Promise.resolve(Response.json({ifsc:"TEST0000001",bankName:"Test Bank",branchName:"Test branch"}));
  if (url === "/api/chef-onboarding/bank") return Promise.resolve(Response.json(bank));
  if (url === "/api/chef/application") return Promise.resolve(Response.json(saved.application));
  if (url === "/api/chef/onboarding" && ["PUT","PATCH"].includes(init?.method ?? "")) {
    const request = JSON.parse(String(init?.body));
    if (request.expectedVersion !== saved.version)
      return Promise.resolve(Response.json({ message: "Version changed" }, { status: 409 }));
    saved = { ...saved, version: saved.version + 1, details: request.details };
  }
  if (url === "/api/chef/onboarding") return Promise.resolve(Response.json(saved));
  if (url.startsWith("/api/chef/onboarding/content?")) return Promise.resolve(Response.json([]));
  return Promise.resolve(
    Response.json({ message: "Fixture service unavailable" }, { status: 503 }),
  );
}
// Pickers open sheets; skipped animations let a closed sheet leave the page at once.
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
/** Date of birth is a calendar: year, then month, then day, then Done. */
async function pickDateOfBirth(year: number, month: string, day: number) {
  fireEvent.click(screen.getByRole("button", { name: /^Date of birth/ }));
  fireEvent.click(await screen.findByRole("button", { name: String(year) }));
  fireEvent.click(await screen.findByRole("button", { name: `${month} ${year}` }));
  fireEvent.click(await screen.findByRole("button", { name: `${day} ${month} ${year}` }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Date of birth" })).toBeNull());
}

beforeEach(() => {
  saved = complete();
  bank = { ...bankFixture };
  verifiedEmail = true;
  setSessionIdentity({ ...identity, id: "22222222-2222-4222-8222-222222222222" });
  setSessionIdentity(identity);
  navigation.push.mockReset();
  navigation.replace.mockReset();
  fetcher = vi.fn<typeof fetch>(normal);
  vi.stubGlobal("fetch", fetcher);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function open() {
  return render(
    createElement(ChefOnboardingWorkspace, {
      fallback: createElement("p", null, "Legacy onboarding"),
    }),
  );
}
async function review() {
  fireEvent.click(await screen.findByRole("button", { name: "Review application" }));
  await screen.findByRole("heading", { name: "Review your application" });
}
function primary(name: string) {
  return screen.getByRole("button", { name });
}

describe("Chef onboarding navigation and persistence", () => {
  it("submits the initial Chef application without loading or posting bank details", async () => {
    saved.bankEnrollmentRequired = false;
    fetcher.mockImplementation((url, init) => {
      if (String(url).includes("/chef-onboarding/bank")) return Promise.reject(new Error("Provider disabled"));
      if (String(url).endsWith("/submit")) {
        saved = { ...saved, submitted: true, version: saved.version + 1, application: { ...saved.application, submittedAt: "2026-10-08T00:00:00Z" } };
        return Promise.resolve(Response.json(saved));
      }
      return normal(url, init);
    });
    open();
    await review();
    expect(screen.getByText(/You can add bank details later/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Bank details" })).toBeNull();
    fireEvent.click(primary("Submit application"));
    await screen.findByText("Accept the terms before submitting your application.");
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/submit"))).toBe(false);
    fireEvent.click(screen.getByLabelText(/I confirm these details are correct/));
    fireEvent.click(primary("Submit application"));
    await screen.findByRole("heading", { name: "Application submitted" });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/chef-onboarding/bank"))).toBe(false);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/submit"))).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).toBeNull();
  });
  it("lets an applicant save optional bank details early, reading bank status only when they choose to", async () => {
    saved.bankEnrollmentRequired = false;
    bank = { ...bankFixture, id: null, state: "NOT_SUBMITTED", lastFour: null, ifsc: null, bankValidated: false, automaticActivation: true, message: "Add your bank details once." };
    open();
    await review();
    expect(screen.getByText(/one less step when payouts open/)).toBeTruthy();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/chef-onboarding/bank"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Add or check bank details" }));
    await screen.findByLabelText("Bank account number");
    expect(fetcher.mock.calls.some(([url]) => String(url) === "/api/chef-onboarding/bank")).toBe(true);
  });
  it("skips deferred bank on document save and back navigation without changing other sections", async () => {
    saved.bankEnrollmentRequired = false;
    open();
    await review();
    fireEvent.click(primary("Back"));
    await screen.findByRole("heading", { name: "Identity verification" });
    fireEvent.click(primary("Save and continue"));
    await screen.findByRole("heading", { name: "Review your application" });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/chef-onboarding/bank"))).toBe(false);
  });
  it.each(["personal", "kitchen", "fssai", "documents", "bank"] as ChefFormSection[])(
    "returns %s edits directly to Review after a confirmed save",
    async (section) => {
      open();
      await review();
      const labels = {
        personal: "Basic details",
        kitchen: "Kitchen details",
        fssai: "FSSAI",
        documents: "Identity proof",
        bank: "Bank details",
      };
      fireEvent.click(primary(`Edit ${labels[section]}`));
      if (section === "personal")
        fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Updated Chef" } });
      if (section === "kitchen")
        fireEvent.change(screen.getByLabelText("Kitchen name"), {
          target: { value: "Updated Kitchen" },
        });
      if (section === "fssai")
        fireEvent.change(screen.getByLabelText("FSSAI registration number"), {
          target: { value: "23456789012345" },
        });
      fireEvent.click(primary("Save and return to review"));
      await screen.findByRole("heading", { name: "Review your application" });
      // The saved bank enrollment keeps its own holder name, so only Basic details shows the edit.
      if (section === "personal") expect(screen.getAllByText("Updated Chef")).toHaveLength(1);
      if (section === "kitchen") expect(screen.getByText("Updated Kitchen")).toBeTruthy();
      if (section === "fssai") expect(screen.getByText("2345 6789 0123 45")).toBeTruthy();
      if (section !== "bank")
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    },
  );
  it("keeps edits on a failed save and does not display a saved receipt", async () => {
    open();
    await review();
    fireEvent.click(primary("Edit Kitchen details"));
    fireEvent.change(screen.getByLabelText("Kitchen name"), {
      target: { value: "Unsaved Kitchen" },
    });
    fetcher.mockImplementation((url, init) =>
      init?.method === "PUT"
        ? Promise.resolve(Response.json({ message: "Storage unavailable" }, { status: 503 }))
        : normal(url, init),
    );
    fireEvent.click(primary("Save and return to review"));
    await screen.findByText(/^Storage unavailable \(Ref: HTTP_503\)$/);
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect((screen.getByLabelText("Kitchen name") as HTMLInputElement).value).toBe(
      "Unsaved Kitchen",
    );
    expect(screen.queryByRole("heading", { name: "Review your application" })).toBeNull();
  });
  it("restores a saved kitchen and resumes the first incomplete section", async () => {
    saved.details!.fssaiNumber = "";
    const view = open();
    fireEvent.click(await screen.findByRole("button", { name: "Continue application" }));
    await screen.findByRole("heading", { name: "FSSAI details" });
    view.unmount();
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Continue application" }));
    await screen.findByRole("heading", { name: "FSSAI details" });
    fireEvent.click(primary("Back"));
    expect((screen.getByLabelText("Kitchen name") as HTMLInputElement).value).toBe(
      "Fixture Kitchen",
    );
    expect(
      screen.queryByLabelText(/Cuisine|Kitchen type|Service radius|Selfie|Licence document/i),
    ).toBeNull();
  });
  it("does not save Basic details until email verification is confirmed", async () => {
    verifiedEmail = false;
    saved.details = null;
    saved.application.status = "NOT_SUBMITTED";
    open();
    await screen.findByRole("heading", { name: "Basic details" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Fixture Chef" } });
    await pickDateOfBirth(1990, "January", 1);
    fireEvent.click(primary("Save and continue"));
    await screen.findByText("Verify your email address before saving these details.");
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });
  it("preserves a selected map pin when reverse geocoding fails", async () => {
    open();
    await review();
    fireEvent.click(primary("Edit Kitchen details"));
    fireEvent.click(primary("Move kitchen pin"));
    await screen.findByText(/Your pin is selected/);
    expect((screen.getByLabelText("Flat / house number / building") as HTMLInputElement).value).toBe(
      "1 Fixture Road",
    );
    fireEvent.click(primary("Save and return to review"));
    await screen.findByRole("heading", { name: "Review your application" });
    expect(saved.details).toMatchObject({ latitude: 17.4, longitude: 78.4 });
  });
  it("confirms callbacks only after a real case response and reuses uncertain request keys", async () => {
    open();
    await review();
    fireEvent.click(primary("Edit FSSAI"));
    fireEvent.click(primary("Don’t have FSSAI?"));
    let attempts = 0;
    fetcher.mockImplementation((url, init) => {
      if (String(url).endsWith("/help")) {
        attempts++;
        return attempts === 1
          ? Promise.resolve(Response.json({}, { status: 503 }))
          : Promise.resolve(Response.json({ id, caseNumber: "FIXTURE-123" }));
      }
      return normal(url, init);
    });
    fireEvent.click(primary("Request a call from Craves"));
    await screen.findByText(/We could not complete this request/);
    expect(screen.queryByText("Request received")).toBeNull();
    fireEvent.click(primary("Request a call from Craves"));
    await screen.findByText("Request received");
    expect(screen.getByText(/call you on your registered mobile number/)).toBeTruthy();
    const requests = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/help"));
    expect(JSON.parse(String(requests[0][1]?.body)).requestKey).toBe(
      JSON.parse(String(requests[1][1]?.body)).requestKey,
    );
    expect(requests).toHaveLength(2);
  });
  it("shows a backend eligibility rejection without fabricating submission", async () => {
    open();
    await review();
    fireEvent.click(screen.getByLabelText(/I confirm these details are correct/));
    fetcher.mockImplementation((url, init) =>
      String(url).endsWith("/submit")
        ? Promise.resolve(
            Response.json(
              { message: "Current bank enrollment requires correction" },
              { status: 400 },
            ),
          )
        : normal(url, init),
    );
    fireEvent.click(primary("Submit application"));
    await screen.findByText(/^Current bank enrollment requires correction \(Ref: HTTP_400\)$/);
    expect(screen.queryByRole("heading", { name: "Application submitted" })).toBeNull();
  });
  it("prevents duplicate submissions and routes confirmed submissions to application status", async () => {
    open();
    await review();
    fireEvent.click(screen.getByLabelText(/I confirm these details are correct/));
    let resolve!: (response: Response) => void;
    fetcher.mockImplementation((url, init) =>
      String(url).endsWith("/submit")
        ? new Promise((done) => {
            resolve = done;
          })
        : normal(url, init),
    );
    const submit = primary("Submit application");
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/submit"))).toHaveLength(1));
    await act(async () => {
      saved = {
        ...saved,
        submitted: true,
        version: 2,
        application: { ...saved.application, submittedAt: "2026-10-08T00:00:00Z" },
      };
      resolve(Response.json(saved));
    });
    await screen.findByRole("heading", { name: "Application submitted" });
    expect(screen.getByRole("link", { name: "View application status" }).getAttribute("href")).toBe(
      "/chef/application/status",
    );
    // Replace, so Back from the status page cannot reopen the submitted form.
    expect(navigation.replace).toHaveBeenCalledWith("/chef/application/status");
    expect(navigation.push).not.toHaveBeenCalledWith("/home");
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).toBeNull();
  });
});

describe("Authoritative status and bank verification", () => {
  it.each(["service", "network"])(
    "keeps chef tools closed during a %s failure and retries the approval check",
    async (failure) => {
      const chef = { ...identity, roles: ["CHEF"] };
      saved.application = { ...saved.application, status: "APPROVED" };
      setSessionIdentity(chef);
      markChefModeVerified(chef.id);
      let checks = 0;
      fetcher.mockImplementation((url, init) => {
        if (String(url) === "/api/auth/me") return Promise.resolve(Response.json(chef));
        if (String(url) === "/api/auth/refresh")
          return Promise.resolve(Response.json({ identity: chef }));
        if (String(url) === "/api/chef/application" && ++checks === 1)
          return failure === "network"
            ? Promise.reject(new Error("offline"))
            : Promise.resolve(Response.json({}, { status: 503 }));
        return normal(url, init);
      });
      render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private operations")));
      await screen.findByRole("button", { name: "Try again" });
      expect(screen.getByRole("heading", { name: "We couldn’t reach Craves" })).toBeTruthy();
      expect(screen.queryByText(/Sign in again/)).toBeNull();
      expect(screen.queryByText("Private operations")).toBeNull();
      expect(navigation.replace).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("Private operations");
      expect(checks).toBeGreaterThanOrEqual(2);
    },
  );
  it("blocks direct operational access with a stale CHEF role when the application is pending", async () => {
    const chef = { ...identity, roles: ["CHEF"] };
    setSessionIdentity(chef);
    markChefModeVerified(chef.id);
    fetcher.mockImplementation((url, init) =>
      String(url) === "/api/auth/me" ? Promise.resolve(Response.json(chef)) : normal(url, init),
    );
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private operations")));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/chef/application/status"),
    );
    expect(screen.queryByText("Private operations")).toBeNull();
  });
  it("does not offer a dashboard on pending status", async () => {
    render(createElement(ChefApplicationStatus, { draftsEnabled: false }));
    await screen.findByText("Submitted");
    expect(screen.queryByRole("link", { name: "Open Chef Dashboard" })).toBeNull();
    expect(screen.queryByRole("link", { name: /dashboard/i })).toBeNull();
  });
  it("explains a switched-off bank setup instead of offering a Continue that does nothing", async () => {
    saved = { ...saved, bankEnrollmentRequired: true };
    bank = { ...bankFixture, id: null, state: "NOT_SUBMITTED", automaticActivation: false };
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Bank details/ }));
    await screen.findByRole("heading", { name: "Bank details" });
    expect(await screen.findByText(/Adding a bank account isn’t open on Craves yet/)).toBeTruthy();
    expect(screen.queryByLabelText("Bank account number")).toBeNull();
    expect((primary("Continue") as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps bank re-entry in the same step, confirms masked details and retries with the same key", async () => {
    const onSaved = vi.fn(),
      onBusy = vi.fn();
    render(
      createElement(ChefOnboardingBank, {
        name: "Fixture Chef",
        bank: { ...bank, id: null, state: "NOT_SUBMITTED" },
        unavailable: false,
        busy: false,
        onSaved,
        onBusy,
        onRefresh: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByLabelText("Bank account number"), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText("Confirm bank account number"), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText("IFSC code"), { target: { value: "test0000001" } });
    fireEvent.click(screen.getByLabelText("Consent to bank verification"));
    await screen.findByText("Test Bank · Test branch");
    fireEvent.submit(document.getElementById("chef-bank-form")!);
    await screen.findByText("•••• 5678");
    fireEvent.click(primary("Re-enter bank details"));
    expect((screen.getByLabelText("IFSC code") as HTMLInputElement).value).toBe("TEST0000001");
    fireEvent.submit(document.getElementById("chef-bank-form")!);
    let attempts = 0;
    fetcher.mockImplementation(() => {
      attempts++;
      return attempts === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(Response.json(bank));
    });
    fireEvent.submit(document.getElementById("chef-bank-form")!);
    await screen.findByText("offline");
    fireEvent.submit(document.getElementById("chef-bank-form")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(bank));
    const posts=fetcher.mock.calls.filter(([,init])=>init?.method==="POST");
    expect(posts).toHaveLength(2);
    expect(posts[0]![1]?.body).toBe(posts[1]![1]?.body);
  });
  it("walks only the sections Craves asked to change, then review", () => {
    const flagged = { ...complete(), progress: { status: "MORE_INFORMATION_REQUIRED", reason: "Fix these", nextAction: "EDIT_APPLICATION", fssaiVerified: false, termsVersion: "v1", sections: ["personal", "documents"] } };
    expect(afterSectionSave("personal", false, flagged)).toBe("documents");
    expect(afterSectionSave("documents", false, flagged)).toBe("review");
    // Without a reviewer request the usual order applies.
    expect(afterSectionSave("personal", false, complete())).toBe("kitchen");
  });
  it("accepts no failed or unknown bank state as a completed section", () => {
    for (const state of [
      "UNKNOWN",
      "VALIDATION_FAILED",
      "NAME_MISMATCH",
      "APPLICANT_ACTION_REQUIRED",
      "SUPERSEDED",
    ] as const)
      expect(bankCanContinue({ ...bank, state })).toBe(false);
    expect(firstIncompleteSection(complete(), { ...bank, state: "VALIDATION_FAILED" })).toBe(
      "bank",
    );
    for (const section of [
      "personal",
      "kitchen",
      "fssai",
      "documents",
      "bank",
    ] as ChefFormSection[])
      expect(afterSectionSave(section, true)).toBe("review");
  });
  it("requires bank enrollment unless the server explicitly defers it, while retaining all other requirements", () => {
    expect(firstIncompleteSection(complete(), null)).toBe("bank");
    const deferred = { ...complete(), bankEnrollmentRequired: false };
    expect(firstIncompleteSection(deferred, null)).toBe("review");
    expect(afterSectionSave("documents", false, deferred)).toBe("review");
    deferred.details!.fssaiNumber = "";
    expect(firstIncompleteSection(deferred, null)).toBe("fssai");
  });
  it("normalizes omitted coordinates and rejects malformed onboarding state", () => {
    const raw = complete();
    delete (raw.details as Partial<typeof EMPTY_ONBOARDING>).latitude;
    expect(parseOnboardingState(raw)?.details?.latitude).toBeNull();
    expect(parseOnboardingState({ ...raw, version: -1 })).toBeNull();
  });
  it("rejects PDFs as photos and oversized identity files before upload", async () => {
    await expect(
      prepareChefUpload(new File(["fixture"], "identity.pdf", { type: "application/pdf" }), true),
    ).rejects.toThrow();
    const file = new File(["fixture"], "photo.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    await expect(prepareChefUpload(file, false)).rejects.toThrow("up to 10 MB");
  });
});

describe("The application in Telugu and Kannada", () => {
  function inLanguage(language: Language, element: ReactElement) {
    return render(createElement(LanguageProvider, { initial: language, chosen: true }, element));
  }
  it("asks for bank details and explains a wrong file in the chef's language", async () => {
    inLanguage("te", createElement(ChefOnboardingBank, {
      name: "Fixture Chef", bank: { ...bank, id: null, state: "NOT_SUBMITTED" }, unavailable: false, busy: false,
      onSaved: vi.fn(), onBusy: vi.fn(), onRefresh: vi.fn(),
    }));
    fireEvent.submit(document.getElementById("chef-bank-form")!);
    expect(await screen.findByText("6 నుంచి 24 అంకెల బ్యాంక్ ఖాతా నంబర్ రాయండి.")).toBeTruthy();
    expect(screen.getByLabelText("IFSC కోడ్")).toBeTruthy();
    await expect(prepareChefUpload(new File(["x"], "id.gif", { type: "image/gif" }), false, "kn")).rejects.toThrow(
      "PDF, JPG, PNG, HEIC ಅಥವಾ WebP ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.",
    );
  });
  it("shows Review in Kannada with every name and number filled in", () => {
    const flow = {
      details: saved.details, state: saved, bank, busy: false, terms: false, fieldErrors: [], setTerms: vi.fn(), edit: vi.fn(),
    } as unknown as ChefOnboardingFlow;
    inLanguage("kn", createElement(ChefReviewDetails, { flow }));
    expect(screen.getByRole("button", { name: "ನಿಮ್ಮ ವಿವರಗಳು ಬದಲಾಯಿಸಿ" })).toBeTruthy();
    expect(screen.getByText("PAN ಕಾರ್ಡ್")).toBeTruthy();
    expect(screen.getByLabelText(/Craves ಚೆಫ್ ನಿಯಮಗಳು/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\{\w+\}/);
  });
  it("labels the date of birth calendar in Telugu while months stay English", async () => {
    inLanguage("te", createElement(DateOfBirthPicker, { id: "dob", labelId: "dob-label", value: "", max: "2008-01-01", onChange: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "పుట్టిన తేదీ ఎంచుకోండి" }));
    fireEvent.click(await screen.findByRole("button", { name: "1990" }));
    expect(await screen.findByRole("group", { name: "1990 లో నెల" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "January 1990" })).toBeTruthy();
  });
  it("makes PDF statements in Telugu", async () => {
    fetcher.mockImplementation((url) => Promise.resolve(Response.json(String(url).startsWith("/api/documents/capabilities")
      ? { enabled: true, emailEnabled: true, types: ["CHEF_EARNINGS_STATEMENT"], maxPeriodDays: 31, maxRows: 1000, taxInvoicesEnabled: false }
      : { items: [], nextCursor: null })));
    inLanguage("te", createElement(DocumentCenter, { mode: "chef" }));
    expect(await screen.findByRole("button", { name: "PDF తయారు చేయండి" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "ఈ నెల" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "బ్యాంక్‌కు పంపిన డబ్బు" })).toBeTruthy();
    expect(screen.getByText("ఇంకా PDFలు లేవు")).toBeTruthy();
  });
});

