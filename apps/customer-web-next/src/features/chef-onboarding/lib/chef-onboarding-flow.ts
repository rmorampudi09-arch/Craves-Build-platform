import type { BankStatus } from "../../admin/finance/lib/bank-onboarding-contract.ts";
import { messages, type Language } from "../../../shared/i18n/language.ts";
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
const SECTION_TITLES = messages({
  en: {
    personal: "Basic details",
    kitchen: "Your kitchen",
    fssai: "FSSAI details",
    documents: "Identity verification",
    bank: "Bank details",
    review: "Review your application",
    resume: "Welcome back",
    submitted: "Application submitted",
    status: "Your application",
  },
  te: {
    personal: "మీ వివరాలు",
    kitchen: "మీ వంటగది",
    fssai: "FSSAI వివరాలు",
    documents: "గుర్తింపు నిర్ధారణ",
    bank: "బ్యాంక్ వివరాలు",
    review: "మీ దరఖాస్తు ఒకసారి చూడండి",
    resume: "మళ్లీ స్వాగతం",
    submitted: "దరఖాస్తు పంపారు",
    status: "మీ దరఖాస్తు",
  },
  kn: {
    personal: "ನಿಮ್ಮ ವಿವರಗಳು",
    kitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ",
    fssai: "FSSAI ವಿವರಗಳು",
    documents: "ಗುರುತಿನ ಪರಿಶೀಲನೆ",
    bank: "ಬ್ಯಾಂಕ್ ವಿವರಗಳು",
    review: "ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಒಮ್ಮೆ ನೋಡಿ",
    resume: "ಮತ್ತೆ ಸ್ವಾಗತ",
    submitted: "ಅರ್ಜಿ ಕಳುಹಿಸಲಾಗಿದೆ",
    status: "ನಿಮ್ಮ ಅರ್ಜಿ",
  },
});
const SECTION_DESCRIPTIONS = messages({
  en: {
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
  },
  te: {
    personal: "మీ గురించి కొంచెం చెప్పండి.",
    kitchen: "మీరు వంట ఎక్కడ చేస్తారో చెప్పండి.",
    fssai: "మీ FSSAI నంబర్ ఇవ్వండి, లేదా దరఖాస్తు చేయడానికి సహాయం పొందండి.",
    documents: "సరైన గుర్తింపు పత్రం అప్‌లోడ్ చేయండి.",
    bank: "మీ సంపాదన వచ్చే బ్యాంక్ ఖాతాను జోడించండి.",
    review: "పంపే ముందు మీ వివరాలు ఒకసారి చూడండి.",
    resume: "మీ వంటగది సిద్ధం చేయడం కొనసాగించండి.",
    submitted: "Craves లో చేరినందుకు ధన్యవాదాలు. మీ దరఖాస్తు మాకు అందింది. మా బృందం మీ వివరాలు చూస్తుంది.",
    status: "మీ దరఖాస్తు స్థితి, తర్వాత ఏమి జరుగుతుంది.",
  },
  kn: {
    personal: "ನಿಮ್ಮ ಬಗ್ಗೆ ಸ್ವಲ್ಪ ತಿಳಿಸಿ.",
    kitchen: "ನೀವು ಅಡುಗೆ ಎಲ್ಲಿ ಮಾಡುತ್ತೀರಿ ಎಂದು ತಿಳಿಸಿ.",
    fssai: "ನಿಮ್ಮ FSSAI ಸಂಖ್ಯೆ ಸೇರಿಸಿ, ಅಥವಾ ಅರ್ಜಿ ಹಾಕಲು ಸಹಾಯ ಪಡೆಯಿರಿ.",
    documents: "ಸರಿಯಾದ ಗುರುತಿನ ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
    bank: "ನಿಮ್ಮ ಗಳಿಕೆ ಬರುವ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಸೇರಿಸಿ.",
    review: "ಕಳುಹಿಸುವ ಮೊದಲು ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಒಮ್ಮೆ ನೋಡಿ.",
    resume: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧಪಡಿಸುವುದನ್ನು ಮುಂದುವರಿಸಿ.",
    submitted: "Craves ಗೆ ಸೇರಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಅರ್ಜಿ ನಮಗೆ ತಲುಪಿದೆ. ನಮ್ಮ ತಂಡ ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    status: "ನಿಮ್ಮ ಅರ್ಜಿಯ ಸ್ಥಿತಿ ಮತ್ತು ಮುಂದೆ ಏನಾಗುತ್ತದೆ.",
  },
});
const SECTION_LABELS = messages({
  en: {
    personal: "Basic details",
    kitchen: "Kitchen details",
    fssai: "FSSAI",
    documents: "Identity proof",
    bank: "Bank details",
  },
  te: {
    personal: "మీ వివరాలు",
    kitchen: "వంటగది వివరాలు",
    fssai: "FSSAI",
    documents: "గుర్తింపు పత్రం",
    bank: "బ్యాంక్ వివరాలు",
  },
  kn: {
    personal: "ನಿಮ್ಮ ವಿವರಗಳು",
    kitchen: "ಅಡುಗೆಮನೆ ವಿವರಗಳು",
    fssai: "FSSAI",
    documents: "ಗುರುತಿನ ದಾಖಲೆ",
    bank: "ಬ್ಯಾಂಕ್ ವಿವರಗಳು",
  },
});
/** Short section names in English, for the admin review. Chef screens use chefSectionLabel. */
export const CHEF_SECTION_LABELS: Record<ChefFormSection, string> = SECTION_LABELS.en;
export function chefSectionTitle(screen: ChefFormScreen, language: Language = "en"): string {
  return SECTION_TITLES[language][screen];
}
export function chefSectionDescription(screen: ChefFormScreen, language: Language = "en"): string {
  return SECTION_DESCRIPTIONS[language][screen];
}
/** Short section names used in the Welcome back list and on Review. */
export function chefSectionLabel(section: ChefFormSection, language: Language = "en"): string {
  return SECTION_LABELS[language][section];
}
const FSSAI_GUIDE = messages({
  en: { title: "How to apply for FSSAI", description: "Follow these simple steps to apply for your registration." },
  te: { title: "FSSAI కి ఎలా దరఖాస్తు చేయాలి", description: "మీ రిజిస్ట్రేషన్ కోసం ఈ సులభమైన దశలు పాటించండి." },
  kn: { title: "FSSAI ಗೆ ಅರ್ಜಿ ಹಾಕುವುದು ಹೇಗೆ", description: "ನಿಮ್ಮ ನೋಂದಣಿಗಾಗಿ ಈ ಸುಲಭ ಹಂತಗಳನ್ನು ಅನುಸರಿಸಿ." },
});
export function fssaiGuideText(language: Language = "en"): { title: string; description: string } {
  return FSSAI_GUIDE[language];
}
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
const PHASE_LABELS = messages({
  en: {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    UNDER_REVIEW: "Under review",
    MORE_INFORMATION_REQUIRED: "More information required",
    APPROVED: "Approved",
    REJECTED: "Not approved",
  },
  te: {
    DRAFT: "డ్రాఫ్ట్",
    SUBMITTED: "పంపారు",
    UNDER_REVIEW: "Craves చూస్తోంది",
    MORE_INFORMATION_REQUIRED: "మరిన్ని వివరాలు కావాలి",
    APPROVED: "ఆమోదించబడింది",
    REJECTED: "ఆమోదించలేదు",
  },
  kn: {
    DRAFT: "ಡ್ರಾಫ್ಟ್",
    SUBMITTED: "ಕಳುಹಿಸಲಾಗಿದೆ",
    UNDER_REVIEW: "Craves ಪರಿಶೀಲಿಸುತ್ತಿದೆ",
    MORE_INFORMATION_REQUIRED: "ಇನ್ನಷ್ಟು ಮಾಹಿತಿ ಬೇಕು",
    APPROVED: "ಅನುಮೋದಿಸಲಾಗಿದೆ",
    REJECTED: "ಅನುಮೋದಿಸಲಾಗಿಲ್ಲ",
  },
});
const PHASE_MESSAGES = messages({
  en: {
    DRAFT: "Your application is not complete.",
    SUBMITTED: "Your application has been submitted for review.",
    UNDER_REVIEW: "Our team is reviewing your application.",
    MORE_INFORMATION_REQUIRED: "Some details need to be updated.",
    APPROVED: "Your application has been approved.",
    REJECTED: "Your application was not approved.",
  },
  te: {
    DRAFT: "మీ దరఖాస్తు ఇంకా పూర్తి కాలేదు.",
    SUBMITTED: "మీ దరఖాస్తు పరిశీలనకు పంపారు.",
    UNDER_REVIEW: "మా బృందం మీ దరఖాస్తు చూస్తోంది.",
    MORE_INFORMATION_REQUIRED: "కొన్ని వివరాలు మార్చాలి.",
    APPROVED: "మీ దరఖాస్తు ఆమోదించబడింది.",
    REJECTED: "మీ దరఖాస్తు ఆమోదించబడలేదు.",
  },
  kn: {
    DRAFT: "ನಿಮ್ಮ ಅರ್ಜಿ ಇನ್ನೂ ಪೂರ್ಣಗೊಂಡಿಲ್ಲ.",
    SUBMITTED: "ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.",
    UNDER_REVIEW: "ನಮ್ಮ ತಂಡ ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದೆ.",
    MORE_INFORMATION_REQUIRED: "ಕೆಲವು ವಿವರಗಳನ್ನು ಬದಲಾಯಿಸಬೇಕು.",
    APPROVED: "ನಿಮ್ಮ ಅರ್ಜಿ ಅನುಮೋದನೆಯಾಗಿದೆ.",
    REJECTED: "ನಿಮ್ಮ ಅರ್ಜಿ ಅನುಮೋದನೆಯಾಗಿಲ್ಲ.",
  },
});
export function applicationPhaseCopy(
  phase: ChefApplicationPhase,
  language: Language = "en",
): { label: string; message: string } {
  return { label: PHASE_LABELS[language][phase], message: PHASE_MESSAGES[language][phase] };
}

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
  // Changes Craves asked for: only the flagged sections, in order, then review. The rest is already done.
  const flagged = state ? correctionSections(state) : [];
  if (flagged.length) return flagged.find((next) => CHEF_SECTIONS.indexOf(next) > CHEF_SECTIONS.indexOf(section)) ?? "review";
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
/**
 * Kitchen details the server needs before it creates the application record that photos
 * are saved to (ChefOnboardingPolicy.kitchenComplete), in the order they appear on screen.
 */
export const KITCHEN_REQUIRED: readonly (ChefFieldError & { label: string; noun: string })[] = [
  { field: "kitchenName", label: "Kitchen name", noun: "kitchen name", message: "Add your kitchen name." },
  {
    field: "location",
    label: "Map pin",
    noun: "map pin",
    message: "Search for your kitchen address or use your current location to place the pin.",
  },
  {
    field: "addressLine1",
    label: "Flat / house number / building",
    noun: "flat or house number",
    message: "Add your flat, house number or building.",
  },
  { field: "postalCode", label: "PIN code", noun: "PIN code", message: "Enter a six-digit PIN code." },
  { field: "city", label: "City", noun: "city", message: "Add your city." },
  { field: "state", label: "State", noun: "state", message: "Add your state." },
];
/** "a", "a and b", "a, b and c". */
export function listInWords(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
/** Required kitchen details still missing, in screen order (empty when photos can be saved). */
export function missingKitchenFields(details: OnboardingDetails): (typeof KITCHEN_REQUIRED)[number][] {
  const filled: Record<string, boolean> = {
    kitchenName: Boolean(details.kitchenName.trim()),
    location: details.latitude != null && details.longitude != null,
    addressLine1: Boolean(details.addressLine1.trim()),
    postalCode: /^\d{6}$/.test(details.postalCode),
    city: Boolean(details.city.trim()),
    state: Boolean(details.state.trim()),
  };
  return KITCHEN_REQUIRED.filter((item) => !filled[item.field]);
}
/** Every problem in a section, in screen order, so all of them can be shown at once. */
export function validateChefSectionAll(
  section: ChefFormSection,
  details: OnboardingDetails,
  state: OnboardingState,
  emailVerified: boolean,
): ChefFieldError[] {
  if (section !== "kitchen") {
    const first = validateChefSection(section, details, state, emailVerified);
    return first ? [first] : [];
  }
  const errors: ChefFieldError[] = missingKitchenFields(details).map(({ field, message }) => ({ field, message }));
  if (!evidenceComplete(state, "KITCHEN_PHOTO_1"))
    errors.push({ field: "KITCHEN_PHOTO_1", message: "Upload an overall kitchen photo." });
  if (!evidenceComplete(state, "KITCHEN_PHOTO_2"))
    errors.push({ field: "KITCHEN_PHOTO_2", message: "Upload a cooking setup photo." });
  return errors;
}
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
  if (section === "kitchen") return validateChefSectionAll(section, details, state, emailVerified)[0] ?? null;
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

