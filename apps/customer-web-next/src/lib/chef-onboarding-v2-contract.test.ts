import assert from "node:assert/strict";
import test from "node:test";
import {
  proofNeedsBack,
  parseOnboardingState,
  ONBOARDING_LANGUAGES,
  EMPTY_ONBOARDING,
} from "./chef-onboarding-v2-contract.ts";
import { onboardingRoute } from "./chef-onboarding-route-policy.ts";
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
  assert.equal(parseOnboardingState({ ...state, supportEmail: "invalid" }), null);
  assert.equal(parseOnboardingState({ ...state, supportEmail: "support @craves.in" }), null);
  assert.equal(parseOnboardingState({ ...state, resumeStep: "approved-without-fssai" }), null);
  assert.equal(parseOnboardingState({ ...state, version: -1 }), null);
  assert.equal(
    parseOnboardingState({ ...state, details: { ...state.details, proofKind: "UNREVIEWED" } }),
    null,
  );
});
