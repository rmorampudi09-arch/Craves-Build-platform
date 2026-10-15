import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_ONBOARDING,
  type OnboardingState,
} from "../../chef-onboarding/lib/chef-onboarding-v2-contract.ts";
import {
  documentRows,
  formatFssai,
  hasNoApplication,
  uploadChoices,
  verificationBanner,
} from "./chef-documents.ts";

const document = (
  id: string,
  documentType: string,
  status: "UPLOADED" | "APPROVED" | "REJECTED",
  reviewReason: string | null = null,
) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  documentType,
  originalFileName: "a.jpg",
  fileSizeBytes: 1000,
  status,
  reviewReason,
  reviewedAt: null,
});
const state = (
  patch: Partial<OnboardingState> = {},
  application: Partial<OnboardingState["application"]> = {},
) =>
  ({
    details: { ...EMPTY_ONBOARDING, proofKind: "AADHAAR", fssaiNumber: "12345678901234" },
    documents: [],
    progress: {
      status: "",
      reason: null,
      nextAction: "",
      fssaiVerified: false,
      termsVersion: "",
      sections: [],
    },
    ...patch,
    application: { status: "PENDING", reviewedAt: null, rejectionReason: null, ...application },
  }) as unknown as OnboardingState;

test("one row per document, in the app's order, with its state in words", () => {
  const rows = documentRows(
    state({
      documents: [
        document("1", "KITCHEN_PHOTO_2", "UPLOADED"),
        document("2", "APPLICANT_PHOTO", "APPROVED"),
        document("3", "SELECTED_PROOF_BACK", "REJECTED", "The photo is blurred"),
        document("4", "SELECTED_PROOF_FRONT", "APPROVED"),
      ],
    }),
  );
  assert.deepEqual(
    rows.map((row) => [row.title, row.subtitle, row.chip.label]),
    [
      ["Aadhaar card · front", "Checked by Craves", "Approved"],
      ["Aadhaar card · back", "The photo is blurred", "Needs update"],
      ["FSSAI registration", "1234 5678 9012 34", "Under review"],
      ["Cooking setup photo", "Craves is checking it", "Under review"],
      ["Applicant photo", "Checked by Craves", "Approved"],
    ],
  );
  assert.equal(rows[2].previewId, null);
  assert.equal(rows[0].previewId, "00000000-0000-4000-8000-000000000004");
  assert.equal(
    documentRows(state({ documents: [document("3", "SELECTED_PROOF_BACK", "REJECTED")] }))[0]
      .subtitle,
    "Please upload a new one",
  );
});

test("the FSSAI line shows Approved once Craves verified it, and is left out without a number", () => {
  const verified = state({
    progress: { status: "", reason: null, nextAction: "", fssaiVerified: true, termsVersion: "" },
  });
  assert.equal(documentRows(verified)[0].chip.label, "Approved");
  assert.deepEqual(documentRows(state({ details: { ...EMPTY_ONBOARDING, fssaiNumber: " " } })), []);
  assert.equal(formatFssai("ABC"), "ABC");
});

test("upload choices name the chef's own ID proof", () => {
  assert.deepEqual(
    uploadChoices(
      state({
        details: {
          ...EMPTY_ONBOARDING,
          proofKind: "OTHER_GOVERNMENT_ID",
          otherGovernmentId: "Voter ID",
        },
      }),
    ).map((choice) => choice.title),
    ["Voter ID · front", "Voter ID · back", "Kitchen photo", "Cooking setup photo"],
  );
  assert.equal(uploadChoices(state({ details: null }))[0].title, "ID proof · front");
});

test("the banner follows the application", () => {
  assert.deepEqual(
    verificationBanner(
      state({}, { status: "APPROVED", reviewedAt: new Date(2026, 9, 2, 12).toISOString() }),
    ),
    {
      tone: "ok",
      title: "Your kitchen is verified",
      message: "Approved by Craves on 2 Oct 2026",
    },
  );
  assert.equal(
    verificationBanner(state({}, { status: "REJECTED", rejectionReason: "Upload a clear ID" }))
      .message,
    "Upload a clear ID",
  );
  assert.equal(verificationBanner(state()).title, "Craves is checking your documents");
  assert.equal(
    verificationBanner(state({}, { status: "NOT_SUBMITTED" })).title,
    "Your application is not finished",
  );
  assert.equal(hasNoApplication(state({}, { status: "NOT_SUBMITTED" })), true);
  assert.equal(
    hasNoApplication(
      state(
        { documents: [document("1", "KITCHEN_PHOTO_1", "UPLOADED")] },
        { status: "NOT_SUBMITTED" },
      ),
    ),
    false,
  );
});
