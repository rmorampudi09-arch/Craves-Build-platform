import type { BankStatus } from "./bank-onboarding-contract.ts";
import type { ChefApplication } from "./chef-application-contract.ts";
import type { OnboardingDetails, OnboardingState } from "./chef-onboarding-v2-contract.ts";
import { proofNeedsBack } from "./chef-onboarding-v2-contract.ts";

export type ChefFormSection = "personal" | "kitchen" | "fssai" | "documents" | "bank";
export type ChefFormScreen = ChefFormSection | "resume" | "review" | "submitted" | "status";
export const CHEF_SECTIONS: readonly ChefFormSection[] = [
  "personal",
  "kitchen",
  "fssai",
  "documents",
  "bank",
];
export const CHEF_SECTION_TITLES: Record<ChefFormScreen, string> = {
  personal: "Basic details",
  kitchen: "Your kitchen",
  fssai: "FSSAI details",
  documents: "Identity verification",
  bank: "Bank details",
  review: "Review your application",
  resume: "Welcome back",
  submitted: "Application submitted",
  status: "Your application",
};
export const CHEF_SECTION_DESCRIPTIONS: Record<ChefFormScreen, string> = {
  personal: "Tell us a little about yourself.",
  kitchen: "Tell us where you prepare your food.",
  fssai: "Add your FSSAI registration number or get help applying.",
  documents: "Upload a valid identity document.",
  bank: "Add the account where you will receive your earnings.",
  review: "Please check your details before submitting.",
  resume: "Continue setting up your kitchen.",
  submitted:
    "Thank you for joining Craves. Your application has been received, and our team will review your details.",
  status: "Your application status and what happens next.",
};
/** Short section names used in the Welcome back list and on Review. */
export const CHEF_SECTION_LABELS: Record<ChefFormSection, string> = {
  personal: "Basic details",
  kitchen: "Kitchen details",
  fssai: "FSSAI",
  documents: "Identity proof",
  bank: "Bank details",
};
export const FSSAI_GUIDE_TITLE = "How to apply for FSSAI";
export const FSSAI_GUIDE_DESCRIPTION = "Follow these simple steps to apply for your registration.";
export function chefFullName(details: Pick<OnboardingDetails, "firstName" | "lastName">): string {
  return [details.firstName, details.lastName].filter(Boolean).join(" ");
}
export function splitChefName(value: string): Pick<OnboardingDetails, "firstName" | "lastName"> {
  const parts = value.trim().split(/\s+/);
  return {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? ""),
    lastName: parts.length > 1 ? parts.at(-1)! : "",
  };
}
export function evidenceComplete(state: OnboardingState, type: string): boolean {
  return state.documents.some(
    (document) =>
      document.documentType === type && ["UPLOADED", "APPROVED"].includes(document.status),
  );
}
export function sameChefBankName(left: string | null | undefined, right: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toUpperCase().replace(/[.\-'’]/g, " ").replace(/\s+/g, " ").trim();
  return Boolean(left && normalize(left) === normalize(right));
}
export function bankCanContinue(bank: BankStatus | null): boolean {
  return Boolean(
    bank?.id &&
    ["QUEUED", "SUBMITTING", "VALIDATING", "WAITING_APPROVAL", "VERIFIED"].includes(bank.state),
  );
}
export function completedSections(
  state: OnboardingState,
  bank: BankStatus | null,
): Record<ChefFormSection, boolean> {
  const d = state.details;
  return {
    personal: Boolean(d?.firstName && d.lastName && d.dateOfBirth && d.email),
    kitchen: Boolean(
      d?.kitchenName &&
      d.addressLine1 &&
      d.city &&
      d.state &&
      d.postalCode &&
      d.latitude != null &&
      d.longitude != null &&
      evidenceComplete(state, "KITCHEN_PHOTO_1") &&
      evidenceComplete(state, "KITCHEN_PHOTO_2"),
    ),
    fssai: Boolean(d?.fssaiNumber && /^[0-9]{14}$/.test(d.fssaiNumber)),
    documents: Boolean(
      d?.proofKind &&
      evidenceComplete(state, "SELECTED_PROOF_FRONT") &&
      (!proofNeedsBack(d.proofKind, d.proofHasBack) || evidenceComplete(state, "SELECTED_PROOF_BACK")),
    ),
    bank: state.bankEnrollmentRequired === false || (bankCanContinue(bank) && sameChefBankName(bank?.accountHolderName, chefFullName(d ?? {firstName:"",lastName:""}))),
  };
}
export type ChefSectionProgress = "complete" | "in-progress" | "not-started" | "attention";
const SECTION_DOCUMENTS: Record<ChefFormSection, readonly string[]> = {
  personal: [],
  kitchen: ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"],
  fssai: ["FSSAI_LICENSE"],
  documents: ["SELECTED_PROOF_FRONT", "SELECTED_PROOF_BACK"],
  bank: [],
};
/** The onboarding section that owns a document type, used to explain review requests. */
export function sectionForDocument(type: string): ChefFormSection | null {
  return (
    (Object.keys(SECTION_DOCUMENTS) as ChefFormSection[]).find((section) =>
      SECTION_DOCUMENTS[section].includes(type),
    ) ?? null
  );
}
/** Sections a reviewer asked the applicant to change; empty unless more information is required. */
export function correctionSections(state: OnboardingState): ChefFormSection[] {
  return state.progress?.status === "MORE_INFORMATION_REQUIRED"
    ? CHEF_SECTIONS.filter((section) => state.progress?.sections?.includes(section))
    : [];
}
export const MINIMUM_CHEF_AGE = 18;
/** Latest date of birth that is 18 today (yyyy-mm-dd, local calendar). Plain string comparison is correct for leap days. */
export function adultCutoff(today = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${today.getFullYear() - MINIMUM_CHEF_AGE}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
/** Display-only progress for the Welcome back list; completion itself stays authoritative. */
export function sectionProgress(
  state: OnboardingState,
  bank: BankStatus | null,
): Record<ChefFormSection, ChefSectionProgress> {
  const completion = completedSections(state, bank);
  const d = state.details;
  const rejected = (section: ChefFormSection) =>
    state.documents.some(
      (document) =>
        document.status === "REJECTED" && SECTION_DOCUMENTS[section].includes(document.documentType),
    );
  const uploaded = (section: ChefFormSection) =>
    state.documents.some(
      (document) =>
        document.status !== "REJECTED" && SECTION_DOCUMENTS[section].includes(document.documentType),
    );
  const started: Record<ChefFormSection, boolean> = {
    personal: Boolean(d && (d.firstName || d.lastName || d.dateOfBirth)),
    kitchen: Boolean(d && (d.kitchenName || d.addressLine1 || d.latitude != null)) || uploaded("kitchen"),
    fssai: Boolean(d?.fssaiNumber),
    documents: Boolean(d?.proofKind) || uploaded("documents"),
    bank: Boolean(bank?.id),
  };
  const result = {} as Record<ChefFormSection, ChefSectionProgress>;
  const requested = correctionSections(state);
  for (const section of CHEF_SECTIONS) {
    result[section] = rejected(section) || requested.includes(section)
      ? "attention"
      : completion[section]
        ? "complete"
        : started[section]
          ? "in-progress"
          : "not-started";
  }
  if (bank && ["VALIDATION_FAILED", "NAME_MISMATCH", "APPLICANT_ACTION_REQUIRED"].includes(bank.state))
    result.bank = "attention";
  return result;
}

export type ChefApplicationPhase =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "MORE_INFORMATION_REQUIRED"
  | "APPROVED"
  | "REJECTED";
/** Maps the authoritative application and review progress to the phase shown to the applicant. */
export function applicationPhase(input: {
  application: Pick<ChefApplication, "status">;
  progress?: { status: string } | null;
  submitted: boolean;
}): ChefApplicationPhase {
  const review = input.progress?.status;
  if (input.application.status === "APPROVED") return "APPROVED";
  if (review === "MORE_INFORMATION_REQUIRED") return "MORE_INFORMATION_REQUIRED";
  if (input.application.status === "REJECTED") return "REJECTED";
  if (input.application.status === "NOT_SUBMITTED" || !input.submitted) return "DRAFT";
  if (review === "UNDER_REVIEW") return "UNDER_REVIEW";
  return "SUBMITTED";
}
export const APPLICATION_PHASE_COPY: Record<
  ChefApplicationPhase,
  { label: string; message: string }
> = {
  DRAFT: {
    label: "Draft",
    message: "Your application is not complete.",
  },
  SUBMITTED: {
    label: "Submitted",
    message: "Your application has been submitted for review.",
  },
  UNDER_REVIEW: {
    label: "Under review",
    message: "Our team is reviewing your application.",
  },
  MORE_INFORMATION_REQUIRED: {
    label: "More information required",
    message: "Some details need to be updated.",
  },
  APPROVED: {
    label: "Approved",
    message: "Your application has been approved.",
  },
  REJECTED: {
    label: "Not approved",
    message: "Your application was not approved.",
  },
};

export function firstIncompleteSection(
  state: OnboardingState,
  bank: BankStatus | null,
): ChefFormSection | "review" {
  const completion = completedSections(state, bank);
  return CHEF_SECTIONS.find((section) => !completion[section]) ?? "review";
}
export function activeChefSections(state: OnboardingState | null): readonly ChefFormSection[] {
  return state?.bankEnrollmentRequired === false ? CHEF_SECTIONS.filter((section) => section !== "bank") : CHEF_SECTIONS;
}
export function afterSectionSave(section: ChefFormSection, fromReview: boolean, state: OnboardingState | null = null): ChefFormScreen {
  if (fromReview) return "review";
  const sections = activeChefSections(state);
  return sections[sections.indexOf(section) + 1] ?? "review";
}
export function applicationIsApproved(application: ChefApplication): boolean {
  return application.status === "APPROVED";
}
export function applicationIsPending(application: ChefApplication): boolean {
  return application.status === "PENDING";
}
export function kitchenAddress(details: OnboardingDetails): string {
  return [
    details.addressLine1,
    details.addressLine2,
    details.landmark,
    details.city,
    details.state,
    details.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}
export type ChefFieldError = { field: string; message: string };
export function validateChefSection(
  section: ChefFormSection,
  details: OnboardingDetails,
  state: OnboardingState,
  emailVerified: boolean,
): ChefFieldError | null {
  if (section === "personal") {
    if (!details.firstName.trim() || !details.lastName.trim())
      return {
        field: "fullName",
        message: "Enter your full name, including your first and last name.",
      };
    if (chefFullName(details).length > 120 || details.firstName.length > 100 || details.lastName.length > 100)
      return { field: "fullName", message: "Keep your full name within 120 characters." };
    const birthTimestamp = Date.parse(details.dateOfBirth);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(details.dateOfBirth) ||
      !Number.isFinite(birthTimestamp) ||
      new Date(birthTimestamp).toISOString().slice(0, 10) !== details.dateOfBirth ||
      details.dateOfBirth < "1900-01-01" ||
      details.dateOfBirth > new Date().toISOString().slice(0, 10)
    )
      return { field: "dateOfBirth", message: "Enter a valid date of birth." };
    if (details.dateOfBirth > adultCutoff())
      return {
        field: "dateOfBirth",
        message: "You must be at least 18 years old to apply as a Craves home chef.",
      };
    if (!state.phoneNumber)
      return { field: "phoneNumber", message: "Sign in again to verify your mobile number." };
    if (!emailVerified)
      return { field: "email", message: "Verify your email address before saving these details." };
  }
  if (section === "kitchen") {
    for (const [field, label] of [
      ["kitchenName", "Kitchen name"],
      ["addressLine1", "House or building"],
      ["city", "City"],
      ["state", "State"],
    ] as const) {
      if (!details[field].trim()) return { field, message: `${label} is required.` };
    }
    if (!/^\d{6}$/.test(details.postalCode))
      return { field: "postalCode", message: "Enter a six-digit PIN code." };
    if (details.latitude == null || details.longitude == null)
      return {
        field: "location",
        message: "Search for your kitchen address or choose a location on the map.",
      };
    if (!evidenceComplete(state, "KITCHEN_PHOTO_1"))
      return { field: "KITCHEN_PHOTO_1", message: "Upload an overall kitchen photo." };
    if (!evidenceComplete(state, "KITCHEN_PHOTO_2"))
      return { field: "KITCHEN_PHOTO_2", message: "Upload a cooking setup photo." };
  }
  if (section === "fssai" && !/^[0-9]{14}$/.test(details.fssaiNumber))
    return {
      field: "fssaiNumber",
      message:
        "Enter your 14-digit FSSAI registration number. You can save an incomplete application and return later.",
    };
  if (section === "documents") {
    if (!details.proofKind)
      return { field: "proofKind", message: "Choose your identity document." };
    if (details.proofKind === "OTHER_GOVERNMENT_ID" && !details.otherGovernmentId.trim())
      return { field: "otherGovernmentId", message: "Enter the government ID name." };
    if (!evidenceComplete(state, "SELECTED_PROOF_FRONT"))
      return {
        field: "SELECTED_PROOF_FRONT",
        message: "Upload the front of your chosen document.",
      };
    if (proofNeedsBack(details.proofKind, details.proofHasBack) && !evidenceComplete(state, "SELECTED_PROOF_BACK"))
      return { field: "SELECTED_PROOF_BACK", message: "Upload the back of your chosen document." };
  }
  return null;
}

