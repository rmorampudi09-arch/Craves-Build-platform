import { parseChefApplication, type ChefApplication } from "./chef-application-contract.ts";
import {
  parseChefEvidenceList,
  type ChefEvidenceMetadata,
} from "./chef-application-evidence-contract.ts";

export const ONBOARDING_LANGUAGES = [
  ["en", "English"],
  ["as", "অসমীয়া"],
  ["bn", "বাংলা"],
  ["brx", "बड़ो"],
  ["doi", "डोगरी"],
  ["gu", "ગુજરાતી"],
  ["hi", "हिन्दी"],
  ["kn", "ಕನ್ನಡ"],
  ["ks", "کٲشُر"],
  ["kok", "कोंकणी"],
  ["mai", "मैथिली"],
  ["ml", "മലയാളം"],
  ["mni", "মৈতৈলোন্"],
  ["mr", "मराठी"],
  ["ne", "नेपाली"],
  ["or", "ଓଡ଼ିଆ"],
  ["pa", "ਪੰਜਾਬੀ"],
  ["sa", "संस्कृतम्"],
  ["sat", "ᱥᱟᱱᱛᱟᱲᱤ"],
  ["sd", "سنڌي"],
  ["ta", "தமிழ்"],
  ["te", "తెలుగు"],
  ["ur", "اردو"],
] as const;
export const PROOF_OPTIONS = [
  ["AADHAAR", "Aadhaar card"],
  ["PAN", "PAN card"],
  ["BANK_STATEMENT", "Bank statement"],
  ["OTHER_GOVERNMENT_ID", "Other government ID"],
] as const;
export type ProofKind = (typeof PROOF_OPTIONS)[number][0];
export type OnboardingStep =
  | "personal"
  | "kitchen"
  | "kitchen-photos"
  | "fssai"
  | "documents"
  | "review"
  | "waiting"
  | "legacy";
export type OnboardingDetails = {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  kitchenName: string;
  kitchenDescription: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  proofKind: ProofKind | null;
  otherGovernmentId: string;
  fssaiNumber: string;
  language: string;
};
export type OnboardingState = {
  enabled: boolean;
  legacy: boolean;
  version: number;
  resumeStep: OnboardingStep;
  submitted: boolean;
  bankEnrollmentRequired?: boolean;
  phoneNumber: string;
  details: OnboardingDetails | null;
  application: ChefApplication;
  documents: ChefEvidenceMetadata[];
  requiredDocuments: string[];
  supportPhone: string;
  supportEmail: string;
  progress?: {status: string; reason: string | null; nextAction: string; fssaiVerified: boolean; termsVersion: string};
};
export type LearningContent = {
  id: string;
  language: string;
  title: string;
  kind: "ARTICLE" | "VIDEO";
  body: string | null;
  published: boolean;
  ready: boolean;
  version: number;
  contentType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
};
export const EMPTY_ONBOARDING: OnboardingDetails = {
  email: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  kitchenName: "",
  kitchenDescription: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: null,
  longitude: null,
  proofKind: null,
  otherGovernmentId: "",
  fssaiNumber: "",
  language: "en",
};
export function proofNeedsBack(proof: ProofKind | null): boolean {
  return proof === "AADHAAR" || proof === "OTHER_GOVERNMENT_ID";
}
const steps = new Set<OnboardingStep>([
  "personal",
  "kitchen",
  "kitchen-photos",
  "fssai",
  "documents",
  "review",
  "waiting",
  "legacy",
]);
export function parseOnboardingState(value: unknown): OnboardingState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const application = parseChefApplication(raw.application);
  const documents = parseChefEvidenceList(raw.documents);
  if (
    !application ||
    !documents ||
    typeof raw.enabled !== "boolean" ||
    typeof raw.legacy !== "boolean" ||
    typeof raw.submitted !== "boolean" ||
    (raw.bankEnrollmentRequired !== undefined && typeof raw.bankEnrollmentRequired !== "boolean") ||
    typeof raw.version !== "number" ||
    !Number.isSafeInteger(raw.version) ||
    raw.version < 0 ||
    !steps.has(raw.resumeStep as OnboardingStep) ||
    typeof raw.phoneNumber !== "string" ||
    typeof raw.supportPhone !== "string" ||
    !/^[+0-9]{10,15}$/.test(raw.supportPhone) ||
    typeof raw.supportEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.supportEmail) ||
    !Array.isArray(raw.requiredDocuments) ||
    raw.requiredDocuments.some((x) => typeof x !== "string")
  )
    return null;
  let details: OnboardingDetails | null = null;
  if (raw.details != null) {
    if (typeof raw.details !== "object" || Array.isArray(raw.details)) return null;
    const d = raw.details as Record<string, unknown>;
    const next = { ...EMPTY_ONBOARDING };
    for (const key of Object.keys(EMPTY_ONBOARDING) as (keyof OnboardingDetails)[]) {
      if (key === "latitude" || key === "longitude" || key === "proofKind") continue;
      if (d[key] != null && typeof d[key] !== "string") return null;
      Object.assign(next, { [key]: d[key] ?? "" });
    }
    if (
      d.latitude != null &&
      (typeof d.latitude !== "number" || !Number.isFinite(d.latitude) || Math.abs(d.latitude) > 90)
    )
      return null;
    if (
      d.longitude != null &&
      (typeof d.longitude !== "number" ||
        !Number.isFinite(d.longitude) ||
        Math.abs(d.longitude) > 180)
    )
      return null;
    if (d.proofKind != null && !PROOF_OPTIONS.some(([key]) => key === d.proofKind)) return null;
    if (!ONBOARDING_LANGUAGES.some(([key]) => key === next.language)) return null;
    details = {
      ...next,
      latitude: (d.latitude ?? null) as number | null,
      longitude: (d.longitude ?? null) as number | null,
      proofKind: (d.proofKind ?? null) as ProofKind | null,
    };
  }
  return {
    enabled: raw.enabled,
    legacy: raw.legacy,
    version: raw.version,
    resumeStep: raw.resumeStep as OnboardingStep,
    submitted: raw.submitted,
    bankEnrollmentRequired: raw.bankEnrollmentRequired !== false,
    phoneNumber: raw.phoneNumber,
    details,
    application,
    documents,
    requiredDocuments: raw.requiredDocuments as string[],
    supportPhone: raw.supportPhone,
    supportEmail: raw.supportEmail,
    ...(raw.progress && typeof raw.progress === "object" && !Array.isArray(raw.progress) &&
      typeof (raw.progress as Record<string,unknown>).status === "string" &&
      typeof (raw.progress as Record<string,unknown>).nextAction === "string" &&
      typeof (raw.progress as Record<string,unknown>).fssaiVerified === "boolean" &&
      typeof (raw.progress as Record<string,unknown>).termsVersion === "string" &&
      ((raw.progress as Record<string,unknown>).reason === null || typeof (raw.progress as Record<string,unknown>).reason === "string")
      ? {progress: raw.progress as NonNullable<OnboardingState["progress"]>} : {}),
  };
}

