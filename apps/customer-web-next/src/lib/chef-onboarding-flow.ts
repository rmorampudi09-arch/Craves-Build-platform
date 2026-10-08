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
  status: "Check your application and the next action available to you.",
};
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
      (!proofNeedsBack(d.proofKind) || evidenceComplete(state, "SELECTED_PROOF_BACK")),
    ),
    bank: bankCanContinue(bank) && sameChefBankName(bank?.accountHolderName, chefFullName(d ?? {firstName:"",lastName:""})),
  };
}
export function firstIncompleteSection(
  state: OnboardingState,
  bank: BankStatus | null,
): ChefFormSection | "review" {
  const completion = completedSections(state, bank);
  return CHEF_SECTIONS.find((section) => !completion[section]) ?? "review";
}
export function afterSectionSave(section: ChefFormSection, fromReview: boolean): ChefFormScreen {
  if (fromReview) return "review";
  return CHEF_SECTIONS[CHEF_SECTIONS.indexOf(section) + 1] ?? "review";
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
    if (proofNeedsBack(details.proofKind) && !evidenceComplete(state, "SELECTED_PROOF_BACK"))
      return { field: "SELECTED_PROOF_BACK", message: "Upload the back of your chosen document." };
  }
  return null;
}
