import assert from "node:assert/strict";
import test from "node:test";
import {
  proofNeedsBack,
  parseOnboardingState,
  ONBOARDING_LANGUAGES,
  EMPTY_ONBOARDING,
} from "./chef-onboarding-v2-contract.ts";
import { onboardingRoute } from "./chef-onboarding-route-policy.ts";
import { validateChefSection } from "./chef-onboarding-flow.ts";
test("single-file and two-sided proof requirements match the selected option", () => {
  for (const proof of ["PAN", "BANK_STATEMENT"] as const)
    assert.equal(proofNeedsBack(proof), false);
  for (const proof of ["AADHAAR", "OTHER_GOVERNMENT_ID"] as const)
    assert.equal(proofNeedsBack(proof), true);
  assert.equal(ONBOARDING_LANGUAGES.length, 23);
});
test("unknown routes, extra segments and traversal cannot reach other APIs", () => {
  const id = "12345678-1234-4123-8123-123456789012";
  assert.equal(onboardingRoute("PUT", [], false), "/chef/onboarding");
  assert.equal(
    onboardingRoute("GET", ["content", id, "playback"], false),
    "/chef/onboarding/content/" + id + "/playback",
  );
  assert.equal(
    onboardingRoute("GET", ["applications", id], true),
    "/backoffice/chef-onboarding/applications/" + id,
  );
  for (const path of [
    [".."],
    ["content", id, "publication"],
    ["content", "bad", "playback"],
    ["help", "anything", "else"],
  ])
    assert.equal(onboardingRoute("PUT", path, false), null);
  assert.equal(onboardingRoute("POST", ["applications", id], true), null);
});
test("saved FSSAI resume state survives parsing and malformed state cannot appear complete", () => {
  const application = { id: null, status: "NOT_SUBMITTED", documents: [] };
  const state = {
    enabled: true,
    legacy: false,
    version: 1,
    resumeStep: "fssai",
    submitted: false,
    phoneNumber: "9000000000",
    details: {
      ...EMPTY_ONBOARDING,
      email: "chef@example.test",
      firstName: "Test",
      lastName: "Chef",
      dateOfBirth: "1990-01-01",
    },
    application,
    documents: [],
    requiredDocuments: [],
    supportPhone: "8367366787",
    supportEmail: "support@craves.in",
  };
  assert.equal(parseOnboardingState(state)?.resumeStep, "fssai");
  assert.equal(parseOnboardingState(state)?.bankEnrollmentRequired, true);
  assert.equal(parseOnboardingState({ ...state, bankEnrollmentRequired: false })?.bankEnrollmentRequired, false);
  for (const value of [null, "false", 0, {}])
    assert.equal(parseOnboardingState({ ...state, bankEnrollmentRequired: value }), null);
  assert.equal(parseOnboardingState({ ...state, supportEmail: "invalid" }), null);
  assert.equal(parseOnboardingState({ ...state, supportEmail: "support @craves.in" }), null);
  assert.equal(parseOnboardingState({ ...state, resumeStep: "approved-without-fssai" }), null);
  assert.equal(parseOnboardingState({ ...state, version: -1 }), null);
  assert.equal(
    parseOnboardingState({ ...state, details: { ...state.details, proofKind: "UNREVIEWED" } }),
    null,
  );
});
for (const [dateOfBirth, valid] of [
  ["2000-02-29", true],
  ["1996-02-29", true],
  ["1900-02-29", false],
  ["2023-02-29", false],
  ["1990-04-31", false],
] as const) {
  test(`Basic details ${valid ? "accept" : "reject"} calendar DOB ${dateOfBirth}`, () => {
    const details = {
      ...EMPTY_ONBOARDING,
      email: "chef@example.invalid",
      firstName: "Test",
      lastName: "Chef",
      dateOfBirth,
    };
    const state = parseOnboardingState({
      enabled: true, legacy: false, version: 1, resumeStep: "personal", submitted: false,
      phoneNumber: "+910000000000", details,
      application: { id: null, status: "NOT_SUBMITTED", documents: [] },
      documents: [], requiredDocuments: [],
      supportPhone: "+910000000000", supportEmail: "support@example.invalid",
    });
    assert.ok(state);
    assert.equal(validateChefSection("personal", details, state, true)?.field ?? null,
      valid ? null : "dateOfBirth");
  });
}


test("application phases follow authoritative application and review state", async () => {
  const { applicationPhase } = await import("./chef-onboarding-flow.ts");
  const app = (status: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED") => ({ status });
  assert.equal(applicationPhase({ application: app("NOT_SUBMITTED"), submitted: false }), "DRAFT");
  assert.equal(applicationPhase({ application: app("PENDING"), submitted: false }), "DRAFT");
  assert.equal(applicationPhase({ application: app("PENDING"), submitted: true }), "SUBMITTED");
  assert.equal(
    applicationPhase({ application: app("PENDING"), submitted: true, progress: { status: "UNDER_REVIEW" } }),
    "UNDER_REVIEW",
  );
  assert.equal(
    applicationPhase({ application: app("PENDING"), submitted: false, progress: { status: "MORE_INFORMATION_REQUIRED" } }),
    "MORE_INFORMATION_REQUIRED",
  );
  assert.equal(
    applicationPhase({ application: app("REJECTED"), submitted: true, progress: { status: "MORE_INFORMATION_REQUIRED" } }),
    "MORE_INFORMATION_REQUIRED",
  );
  assert.equal(applicationPhase({ application: app("REJECTED"), submitted: true }), "REJECTED");
  // A stale review status can never make an approved application look pending, or vice versa.
  assert.equal(
    applicationPhase({ application: app("APPROVED"), submitted: true, progress: { status: "UNDER_REVIEW" } }),
    "APPROVED",
  );
});

test("Welcome back progress distinguishes not started, in progress, complete and reviewer requests", async () => {
  const { sectionProgress } = await import("./chef-onboarding-flow.ts");
  const base = parseOnboardingState({
    enabled: true, legacy: false, version: 2, resumeStep: "kitchen", submitted: false,
    bankEnrollmentRequired: false, phoneNumber: "+910000000000",
    details: {
      ...EMPTY_ONBOARDING, email: "chef@example.invalid", firstName: "Test", lastName: "Chef",
      dateOfBirth: "1990-01-01", kitchenName: "Saved kitchen",
    },
    application: { id: null, status: "NOT_SUBMITTED", documents: [] },
    documents: [{
      id: "12345678-1234-4123-8123-123456789012", documentType: "SELECTED_PROOF_FRONT",
      originalFileName: "front.png", fileSizeBytes: 10, status: "REJECTED", reviewReason: "Blurred", reviewedAt: null,
    }],
    requiredDocuments: [], supportPhone: "+910000000000", supportEmail: "support@example.invalid",
  });
  assert.ok(base);
  const progress = sectionProgress(base, null);
  assert.equal(progress.personal, "complete");
  assert.equal(progress.kitchen, "in-progress");
  assert.equal(progress.fssai, "not-started");
  assert.equal(progress.documents, "attention");
  assert.equal(progress.bank, "complete");
});

test("applicants must be 18, using the local calendar and leap-day birthdays from 1 March", async () => {
  const { adultCutoff } = await import("./chef-onboarding-flow.ts");
  assert.equal(adultCutoff(new Date(2026, 9, 9)), "2008-10-09");
  assert.ok("2008-02-29" > adultCutoff(new Date(2026, 1, 28)));
  assert.ok("2008-02-29" <= adultCutoff(new Date(2026, 2, 1)));
  const details = {
    ...EMPTY_ONBOARDING, email: "chef@example.invalid", firstName: "Young", lastName: "Chef",
    dateOfBirth: `${new Date().getFullYear() - 10}-01-01`,
  };
  const state = parseOnboardingState({
    enabled: true, legacy: false, version: 1, resumeStep: "personal", submitted: false,
    phoneNumber: "+910000000000", details, application: { id: null, status: "NOT_SUBMITTED", documents: [] },
    documents: [], requiredDocuments: [], supportPhone: "+910000000000", supportEmail: "support@example.invalid",
  });
  assert.ok(state);
  assert.match(validateChefSection("personal", details, state, true)?.message ?? "", /at least 18/);
});

test("an Other government ID can be single-sided; Aadhaar always needs its back", () => {
  assert.equal(proofNeedsBack("OTHER_GOVERNMENT_ID", false), false);
  assert.equal(proofNeedsBack("OTHER_GOVERNMENT_ID", null), true);
  assert.equal(proofNeedsBack("AADHAAR", false), true);
});

test("callback status, reviewer sections and the short reference survive parsing", () => {
  const base = {
    enabled: true, legacy: false, version: 3, resumeStep: "review", submitted: false,
    phoneNumber: "+910000000000", details: { ...EMPTY_ONBOARDING, proofKind: "OTHER_GOVERNMENT_ID", proofHasBack: false },
    application: { id: "12345678-1234-4123-8123-123456789012", status: "PENDING", documents: [], referenceCode: "CRV-10042" },
    documents: [], requiredDocuments: [], supportPhone: "+910000000000", supportEmail: "support@example.invalid",
    progress: { status: "MORE_INFORMATION_REQUIRED", reason: "Retake", nextAction: "EDIT_APPLICATION", fssaiVerified: false,
      termsVersion: "v1", sections: ["documents", "menu", "kitchen"] },
    callbackRequest: { caseNumber: "SUP-1", status: "CONTACTED", requestedAt: "2026-10-09T00:00:00Z" },
  };
  const state = parseOnboardingState(base);
  assert.ok(state);
  assert.deepEqual(state.progress?.sections, ["kitchen", "documents"]);
  assert.equal(state.callbackRequest?.status, "CONTACTED");
  assert.equal(state.application.referenceCode, "CRV-10042");
  assert.equal(state.details?.proofHasBack, false);
  assert.equal(parseOnboardingState({ ...base, callbackRequest: { caseNumber: "SUP-1", status: "LOST", requestedAt: "x" } }), null);
  assert.equal(parseOnboardingState({ ...base, callbackRequest: undefined })?.callbackRequest, null);
});
