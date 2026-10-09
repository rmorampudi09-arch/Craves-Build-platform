// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminChefAttention, summarizeHelp } from "../components/admin-chef-attention";
import { AdminChefOnboardingContent } from "../components/admin-chef-onboarding-content";
import { AdminChefReviewDetails } from "../components/admin-chef-review-details";

const routes = new Map<string, unknown>();
const fetcher = vi.fn(async (input: RequestInfo | URL) => {
  const path = String(input);
  return routes.has(path) ? Response.json(routes.get(path)) : Response.json({ message: "unmocked " + path }, { status: 404 });
});
vi.mock("@/lib/admin-renewal", () => ({ adminFetch: (input: RequestInfo | URL) => fetcher(input) }));

const APP = "11111111-1111-4111-8111-111111111111";
const help = (id: string, status: string, createdAt: string, applicationId: string | null = APP) => ({
  id, caseNumber: "SUP-" + id.slice(0, 4), phoneNumber: "+919000000000", status, createdAt, applicationId,
  message: "Please call me", details: { firstName: "Gopi", lastName: "Nagalla", email: "gopi@example.com", language: "te",
    dateOfBirth: "1990-01-01", kitchenName: "Gopi's Kitchen", addressLine1: "1 Road", addressLine2: "", landmark: "",
    city: "Hyderabad", state: "Telangana", postalCode: "500001" },
});

beforeEach(() => { routes.clear(); fetcher.mockClear(); vi.stubGlobal("confirm", () => true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Admins can see chefs who are waiting", () => {
  it("counts open help requests and the oldest one", () => {
    expect(summarizeHelp([
      { status: "RESOLVED", createdAt: "2026-10-01T00:00:00Z" },
      { status: "CONTACTED", createdAt: "2026-10-05T00:00:00Z" },
      { status: "OPEN", createdAt: "2026-10-08T00:00:00Z" },
    ], false)).toEqual({ open: 2, oldestOpen: "2026-10-05T00:00:00Z", more: false });
  });

  it("shows pending applications and open help requests on the admin overview", async () => {
    routes.set("/api/admin/chef-reviews?status=PENDING", [{ id: APP }, { id: "22222222-2222-4222-8222-222222222222" }]);
    routes.set("/api/admin/chef-onboarding/help", { items: [help("aaaa1111-1111-4111-8111-111111111111", "OPEN", "2026-10-08T00:00:00Z"), help("bbbb1111-1111-4111-8111-111111111111", "RESOLVED", "2026-10-01T00:00:00Z")], nextCursor: null });
    render(createElement(AdminChefAttention));
    expect(await screen.findByRole("heading", { name: "Chefs are waiting for you" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /2 chef applications waiting for review/ }).getAttribute("href")).toBe("/admin/chef-reviews");
    expect(screen.getByRole("link", { name: /1 chef help request open/ }).getAttribute("href")).toBe("/admin/chef-onboarding");
  });

  it("lists open help requests first and links each to the chef's application", async () => {
    routes.set("/api/admin/chef-onboarding/content", []);
    routes.set("/api/admin/chef-onboarding/help", { items: [
      help("bbbb1111-1111-4111-8111-111111111111", "RESOLVED", "2026-10-09T00:00:00Z"),
      help("aaaa1111-1111-4111-8111-111111111111", "OPEN", "2026-10-08T00:00:00Z"),
      help("cccc1111-1111-4111-8111-111111111111", "OPEN", "2026-10-07T00:00:00Z", null),
    ], nextCursor: null });
    render(createElement(AdminChefOnboardingContent));
    expect(await screen.findByText(/2 open requests/)).toBeTruthy();
    const cases = screen.getAllByRole("heading", { level: 3 }).map(item => item.textContent).filter(text => text?.includes("SUP-"));
    expect(cases).toEqual(["Gopi Nagalla · SUP-aaaa", "Gopi Nagalla · SUP-cccc", "Gopi Nagalla · SUP-bbbb"]);
    expect(screen.getAllByRole("link", { name: "Open this chef’s application" })[0]!.getAttribute("href")).toBe(`/admin/chef-reviews/${APP}`);
    expect(screen.getByText(/No application saved yet/)).toBeTruthy();
  });
});

describe("Admin approval explains what is still needed", () => {
  function reviewFixtures(fssaiVerified: boolean) {
    routes.set(`/api/admin/chef-reviews/${APP}`, { id: APP, phoneNumber: "+919000000000", email: "gopi@example.com", firstName: "Gopi", lastName: "Nagalla",
      addressLine1: "1 Road", addressLine2: null, landmark: null, city: "Hyderabad", state: "Telangana", postalCode: "500001", latitude: 17.4, longitude: 78.4,
      status: "PENDING", rejectionReason: null, submittedAt: "2026-10-09T00:00:00Z", reviewedAt: null, documents: [], referenceCode: "CRV-10001" });
    routes.set(`/api/admin/chef-reviews/${APP}/evidence-status`, ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2", "SELECTED_PROOF_FRONT"].map((documentType, index) => ({
      id: `3333333${index}-3333-4333-8333-333333333333`, documentType, originalFileName: documentType.toLowerCase() + ".jpg", fileSizeBytes: 2048,
      status: "APPROVED", reviewReason: null, reviewedAt: "2026-10-09T01:00:00Z" })));
    routes.set(`/api/admin/chef-onboarding/applications/${APP}`, {
      enabled: true, legacy: false, version: 4, resumeStep: "review", submitted: true, bankEnrollmentRequired: false,
      phoneNumber: "+919000000000", supportPhone: "+910000000000", supportEmail: "support@example.invalid",
      requiredDocuments: ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2", "SELECTED_PROOF_FRONT"],
      details: { email: "gopi@example.com", firstName: "Gopi", lastName: "Nagalla", dateOfBirth: "1990-01-01", kitchenName: "Gopi's Kitchen",
        kitchenDescription: "", addressLine1: "1 Road", addressLine2: "", landmark: "", city: "Hyderabad", state: "Telangana", postalCode: "500001",
        latitude: 17.4, longitude: 78.4, proofKind: "PAN", otherGovernmentId: "", fssaiNumber: "12345678901234", language: "te", proofHasBack: null },
      application: { id: APP, email: "gopi@example.com", firstName: "Gopi", lastName: "Nagalla", addressLine1: "1 Road", addressLine2: null, landmark: null,
        city: "Hyderabad", state: "Telangana", postalCode: "500001", latitude: 17.4, longitude: 78.4, status: "PENDING", rejectionReason: null,
        submittedAt: "2026-10-09T00:00:00Z", reviewedAt: null, documents: [] },
      documents: [], progress: { status: "UNDER_REVIEW", reason: null, nextAction: "WAIT", fssaiVerified, termsVersion: "v1" },
      callbackRequest: { caseNumber: "SUP-1001", status: "OPEN", requestedAt: "2026-10-08T00:00:00Z" },
    });
  }

  it("keeps approval blocked until FSSAI is recorded and says so", async () => {
    reviewFixtures(false);
    render(createElement(AdminChefReviewDetails, { applicationId: APP, onboardingV2Enabled: true }));
    expect(await screen.findByText(/Needed: FSSAI number checked/)).toBeTruthy();
    expect(screen.getByText("Done: Every required document approved (3/3)")).toBeTruthy();
    expect(screen.getByText("Done: Chef has submitted the application")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Approve Chef application" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/FSSAI callback: SUP-1001 · OPEN/)).toBeTruthy();
  });

  it("does not copy FSSAI evidence into the whole-application rejection reason", async () => {
    reviewFixtures(false);
    render(createElement(AdminChefReviewDetails, { applicationId: APP, onboardingV2Enabled: true }));
    fireEvent.change(await screen.findByLabelText("Onboarding review evidence"), { target: { value: "Checked on FoSCoS portal" } });
    expect((screen.getByPlaceholderText(/Use only for an application-level problem/) as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Reject entire application" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables final approval once documents are approved and FSSAI is verified", async () => {
    reviewFixtures(true);
    render(createElement(AdminChefReviewDetails, { applicationId: APP, onboardingV2Enabled: true }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Approve Chef application" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/^Needed:/)).toBeNull();
  });
});
