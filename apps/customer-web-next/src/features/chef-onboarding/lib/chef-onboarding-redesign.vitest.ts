// @vitest-environment jsdom
// Isolated fixtures for the redesigned Chef onboarding popup. No production APIs are called.
import { createElement, useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefOnboardingWorkspace } from "../components/chef-onboarding-workspace";
import { ChefApplicationSessionBoundary } from "../components/chef-application-session-boundary";
import { EMPTY_ONBOARDING, type OnboardingState } from "./chef-onboarding-v2-contract";
import type { ChefEvidenceMetadata } from "./chef-application-evidence-contract";
import {
  captureSessionContext,
  invalidateSession,
  setSessionIdentity,
} from "../../auth/api/cravesAuth";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("../../addresses/components/AddressMapPicker", () => ({ AddressMapPicker: () => null }));
vi.mock("../../sign-in/components/EmailVerificationPanel", () => ({
  EmailVerificationPanel: ({ onStateChange }: { onStateChange: (value: unknown) => void }) => {
    useEffect(() => {
      onStateChange({
        email: "fixture@example.invalid",
        emailVerified: true,
        emailRevision: 1,
        pending: null,
        serverTime: "2026-10-09T00:00:00Z",
      });
    }, [onStateChange]);
    return null;
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
const document = (
  documentType: string,
  status: ChefEvidenceMetadata["status"] = "UPLOADED",
  reviewReason: string | null = null,
): ChefEvidenceMetadata => ({
  id: id.replace(/^1/, String(documentType.length % 9)),
  documentType,
  originalFileName: documentType.toLowerCase() + ".png",
  fileSizeBytes: 100,
  status,
  reviewReason,
  reviewedAt: null,
});
function fixture(): OnboardingState {
  return {
    enabled: true,
    legacy: false,
    version: 1,
    resumeStep: "review",
    submitted: false,
    bankEnrollmentRequired: false,
    phoneNumber: identity.phoneNumber,
    supportPhone: "+910000000000",
    supportEmail: "support@example.invalid",
    requiredDocuments: ["SELECTED_PROOF_FRONT", "KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"],
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
    documents: ["SELECTED_PROOF_FRONT", "KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"].map((type) =>
      document(type),
    ),
  };
}
let saved: OnboardingState;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function normal(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
  if (url === "/api/auth/refresh") return Promise.resolve(Response.json({ identity }));
  if (url === "/api/chef/onboarding" && ["PUT", "PATCH"].includes(init?.method ?? "")) {
    const request = JSON.parse(String(init?.body));
    saved = { ...saved, version: saved.version + 1, details: request.details };
  }
  if (url === "/api/chef/onboarding") return Promise.resolve(Response.json(saved));
  if (url.startsWith("/api/chef/onboarding/content")) return Promise.resolve(Response.json([]));
  return Promise.resolve(Response.json({ message: "Fixture unavailable" }, { status: 503 }));
}
beforeEach(() => {
  saved = fixture();
  setSessionIdentity(identity);
  navigation.push.mockReset();
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
    createElement(ChefOnboardingWorkspace, { fallback: createElement("p", null, "Legacy") }),
  );
}

describe("Redesigned Chef onboarding popup", () => {
  it("never submits the next section when the Welcome back action opens it", async () => {
    saved.details = {
      ...EMPTY_ONBOARDING,
      ...{
        firstName: "Fixture",
        lastName: "Chef",
        email: identity.email,
        dateOfBirth: "1990-01-01",
      },
    };
    saved.documents = [];
    open();
    expect(await screen.findByRole("heading", { name: "Welcome back, Fixture" })).toBeTruthy();
    expect(screen.getAllByText("Not started")).toHaveLength(3);
    expect(screen.getByText("Complete")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue application" }));
    await screen.findByRole("heading", { name: "Your kitchen" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("removes kitchen type and service area and shows the map placeholder before address fields", async () => {
    saved.details = { ...saved.details!, latitude: null, longitude: null };
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Kitchen details/ }));
    await screen.findByRole("heading", { name: "Your kitchen" });
    expect(screen.queryByText(/Kitchen type|Service area|Delivers within|km/i)).toBeNull();
    const placeholder = screen.getByText("Your kitchen pin will appear here");
    const firstAddressField = screen.getByLabelText("Flat / house number / building");
    expect(
      placeholder.compareDocumentPosition(firstAddressField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Overall kitchen photo")).toBeTruthy();
    expect(screen.getByText("Cooking setup photo")).toBeTruthy();
    expect(screen.queryByText(/Storage|Add more/i)).toBeNull();
  });

  it("lets an applicant continue without FSSAI but routes submission back to the FSSAI number", async () => {
    saved.details = { ...saved.details!, fssaiNumber: "" };
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Continue application" }));
    await screen.findByRole("heading", { name: "FSSAI details" });
    fireEvent.click(screen.getByRole("button", { name: "Don’t have FSSAI?" }));
    await screen.findByRole("heading", { name: "How to apply for FSSAI" });
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByRole("button", { name: /Call us|Chat with us/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I have an FSSAI number" }));
    await screen.findByRole("heading", { name: "FSSAI details" });
    fireEvent.click(screen.getByRole("button", { name: "Don’t have FSSAI?" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save and continue" }));
    await screen.findByRole("heading", { name: "Identity verification" });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await screen.findByRole("heading", { name: "Review your application" });
    expect(screen.getByText("Not added yet")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Accept terms and privacy policy"));
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
    await screen.findByRole("heading", { name: "FSSAI details" });
    expect((await screen.findByRole("alert")).textContent).toContain("Add your 14-digit FSSAI");
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/submit"))).toBe(false);
  });

  it("shows a more-information request on the status screen and opens the affected section", async () => {
    saved.application = { ...saved.application, submittedAt: "2026-10-08T00:00:00Z" };
    saved.documents = [
      document("SELECTED_PROOF_FRONT"),
      document("KITCHEN_PHOTO_1"),
      document("KITCHEN_PHOTO_2", "REJECTED", "The stove is not visible."),
    ];
    saved.progress = {
      status: "MORE_INFORMATION_REQUIRED",
      reason: "Please retake the cooking setup photo.",
      nextAction: "EDIT_APPLICATION",
      fssaiVerified: false,
      termsVersion: "craves-chef-terms-20261008-v1",
    };
    open();
    await screen.findByText("More information required");
    expect(screen.getByText("Please retake the cooking setup photo.")).toBeTruthy();
    expect(screen.getByText("The stove is not visible.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /dashboard/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Update application" }));
    await screen.findByRole("heading", { name: "Your kitchen" });
  });

  it("does not offer the dashboard or a home shortcut after submission", async () => {
    saved.submitted = true;
    saved.application = { ...saved.application, submittedAt: "2026-10-08T00:00:00Z" };
    saved.progress = {
      status: "UNDER_REVIEW",
      reason: null,
      nextAction: "VIEW_STATUS",
      fssaiVerified: false,
      termsVersion: "v1",
    };
    open();
    await screen.findByText("Under review");
    expect(screen.getByRole("button", { name: "Refresh status" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /dashboard/i })).toBeNull();
  });

  it("uploads a chosen kitchen photo without a second confirmation step", async () => {
    saved.documents = saved.documents.filter((item) => item.documentType !== "KITCHEN_PHOTO_2");
    const sent: FormData[] = [];
    class FakeRequest {
      upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
      status = 0;
      responseText = "";
      timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      abort() {
        this.onabort?.();
      }
      send(body: FormData) {
        sent.push(body);
        // The server stores a sanitised name, so the upload is confirmed by its id.
        const stored = {
          ...document("KITCHEN_PHOTO_2"),
          id: "77777777-7777-4777-8777-777777777777",
          originalFileName: "my-stove-(1).png",
        };
        saved = { ...saved, documents: [...saved.documents, stored] };
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 } as ProgressEvent);
        this.status = 201;
        this.responseText = JSON.stringify(stored);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Continue application" }));
    await screen.findByRole("heading", { name: "Your kitchen" });
    const input = screen
      .getAllByLabelText("Cooking setup photo")
      .find(
        (element) => element.tagName === "INPUT" && !element.hasAttribute("capture"),
      ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "my stove (1).png", { type: "image/png" })] },
    });
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.get("documentType")).toBe("KITCHEN_PHOTO_2");
    expect(await screen.findByRole("button", { name: "Replace cooking setup photo" })).toBeTruthy();
    expect(screen.queryByText("Upload failed")).toBeNull();
  });

  it("shows the server's reason when a submission is refused", async () => {
    fetcher.mockImplementation((input, init) =>
      String(input).endsWith("/submit")
        ? Promise.resolve(
            Response.json(
              { code: "ONBOARDING_INCOMPLETE", message: "Complete the kitchen photos before submitting." },
              { status: 409 },
            ),
          )
        : normal(input, init),
    );
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Review application" }));
    await screen.findByRole("heading", { name: "Review your application" });
    fireEvent.click(screen.getByLabelText("Accept terms and privacy policy"));
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Complete the kitchen photos before submitting.",
    );
  });
});

describe("Backend gap fixes", () => {
  it("blocks applicants under 18 before saving Basic details", async () => {
    saved.details = null;
    saved.application = { ...saved.application, status: "NOT_SUBMITTED" };
    open();
    await screen.findByRole("heading", { name: "Basic details" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Young Chef" } });
    fireEvent.change(screen.getByLabelText("Date of birth"), {
      target: { value: `${new Date().getFullYear() - 16}-05-01` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("at least 18 years old");
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("lets an Other government ID be marked as having no back side", async () => {
    saved.details = { ...saved.details!, proofKind: "OTHER_GOVERNMENT_ID", otherGovernmentId: "Voter ID" };
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Identity proof/ }));
    await screen.findByRole("heading", { name: "Identity verification" });
    expect(screen.getByText("Back side")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("This document has no back side"));
    expect(screen.queryByText("Back side")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await screen.findByRole("heading", { name: "Review your application" });
    expect(saved.details?.proofHasBack).toBe(false);
  });

  it("shows an earlier callback request after a reload and an English fallback guide", async () => {
    saved.details = { ...saved.details!, fssaiNumber: "", language: "te" };
    saved.callbackRequest = { caseNumber: "SUP-2041", status: "OPEN", requestedAt: "2026-10-09T05:00:00Z" };
    fetcher.mockImplementation((input, init) =>
      String(input).startsWith("/api/chef/onboarding/content")
        ? Promise.resolve(
            Response.json([
              {
                id: "22222222-2222-4222-8222-222222222222", language: "en", title: "Apply for FSSAI",
                kind: "ARTICLE", body: "Synthetic English guide", published: true, ready: true, version: 1,
                contentType: null, fileSizeBytes: null, createdAt: "2026-10-09T00:00:00Z",
              },
            ]),
          )
        : normal(input, init),
    );
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Continue application" }));
    await screen.findByRole("heading", { name: "FSSAI details" });
    fireEvent.click(screen.getByRole("button", { name: "Don’t have FSSAI?" }));
    expect(await screen.findByText(/showing the English guide/)).toBeTruthy();
    expect(screen.getByText("Apply for FSSAI")).toBeTruthy();
    expect(screen.getByText("Request received")).toBeTruthy();
    expect(screen.getByText(/SUP-2041/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request a call from Craves" })).toBeNull();
  });

  it("names reviewer-requested sections and shows the short application reference", async () => {
    saved.application = { ...saved.application, submittedAt: "2026-10-08T00:00:00Z", referenceCode: "CRV-10042" };
    saved.progress = {
      status: "MORE_INFORMATION_REQUIRED",
      reason: "Please confirm your date of birth.",
      nextAction: "EDIT_APPLICATION",
      fssaiVerified: false,
      termsVersion: "v1",
      sections: ["personal"],
    };
    open();
    await screen.findByText("More information required");
    expect(screen.getByText("CRV-10042")).toBeTruthy();
    expect(screen.queryByText("Application ID")).toBeNull();
    const card = screen.getByRole("heading", { name: "What needs updating" }).closest("section")!;
    expect(card.textContent).toContain("Basic details");
    fireEvent.click(screen.getByRole("button", { name: "Update application" }));
    await screen.findByRole("heading", { name: "Basic details" });
  });
});

describe("Become a chef entry", () => {
  it("opens the phone-first Home Chef popup for a signed-out visitor without mounting the application", async () => {
    invalidateSession(captureSessionContext());
    fetcher.mockImplementation((input) =>
      String(input) === "/api/auth/me"
        ? Promise.resolve(Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }))
        : Promise.resolve(Response.json({}, { status: 401 })),
    );
    render(
      createElement(
        ChefApplicationSessionBoundary,
        null,
        createElement("p", null, "Private application"),
      ),
    );
    expect(await screen.findByText("Join Craves as a Home Chef")).toBeTruthy();
    expect(screen.getByText("Home Chef")).toBeTruthy();
    expect(screen.getByLabelText(/Mobile number/)).toBeTruthy();
    expect(screen.queryByLabelText(/First name/)).toBeNull();
    expect(screen.queryByText("Private application")).toBeNull();
  });
});
