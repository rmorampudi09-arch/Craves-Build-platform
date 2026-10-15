import {
  PROOF_OPTIONS,
  type OnboardingState,
} from "../../chef-onboarding/lib/chef-onboarding-v2-contract.ts";

type Evidence = OnboardingState["documents"][number];
type Details = OnboardingState["details"];
export type DocumentKind = "id" | "photo" | "fssai" | "file";
export type DocumentRow = {
  kind: DocumentKind;
  title: string;
  subtitle: string;
  chip: { label: string; tone: "success" | "warning" | "attention" };
  /** The file the chef can open; null for a line that is not a file (FSSAI). */
  previewId: string | null;
};
export type VerificationBanner = {
  tone: "ok" | "wait" | "problem";
  title: string;
  message: string;
};

const APPROVED = { label: "Approved", tone: "success" } as const;
const UNDER_REVIEW = { label: "Under review", tone: "warning" } as const;
const NEEDS_UPDATE = { label: "Needs update", tone: "attention" } as const;
const ORDER = [
  "SELECTED_PROOF_FRONT",
  "SELECTED_PROOF_BACK",
  "FSSAI",
  "KITCHEN_PHOTO_1",
  "KITCHEN_PHOTO_2",
];
const UPLOAD_TYPES = [
  "SELECTED_PROOF_FRONT",
  "SELECTED_PROOF_BACK",
  "KITCHEN_PHOTO_1",
  "KITCHEN_PHOTO_2",
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The ID proof the chef chose in the application, as `Aadhaar card`. */
function proofName(details: Details): string {
  if (details?.proofKind === "OTHER_GOVERNMENT_ID")
    return details.otherGovernmentId.trim() || "Other government ID";
  return PROOF_OPTIONS.find(([kind]) => kind === details?.proofKind)?.[1] ?? "ID proof";
}

function titleOf(documentType: string, details: Details): string {
  switch (documentType) {
    case "SELECTED_PROOF_FRONT":
      return `${proofName(details)} · front`;
    case "SELECTED_PROOF_BACK":
      return `${proofName(details)} · back`;
    case "KITCHEN_PHOTO_1":
      return "Kitchen photo";
    case "KITCHEN_PHOTO_2":
      return "Cooking setup photo";
    default: {
      const words = documentType.toLowerCase().replace(/_/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

const kindOf = (documentType: string): DocumentKind =>
  documentType.startsWith("SELECTED_PROOF_")
    ? "id"
    : documentType.startsWith("KITCHEN_PHOTO_")
      ? "photo"
      : "file";

function fileRow(document: Evidence, details: Details): DocumentRow {
  const common = {
    kind: kindOf(document.documentType),
    title: titleOf(document.documentType, details),
    previewId: document.id,
  };
  if (document.status === "APPROVED")
    return { ...common, subtitle: "Checked by Craves", chip: APPROVED };
  if (document.status === "REJECTED")
    return {
      ...common,
      subtitle: document.reviewReason || "Please upload a new one",
      chip: NEEDS_UPDATE,
    };
  return { ...common, subtitle: "Craves is checking it", chip: UNDER_REVIEW };
}

/** `1234 5678 9012 34` for a 14 digit FSSAI number; anything else as given. */
export function formatFssai(value: string): string {
  return /^\d{14}$/.test(value)
    ? value.replace(/^(\d{4})(\d{4})(\d{4})(\d{2})$/, "$1 $2 $3 $4")
    : value;
}

/** Every document the chef gave in the application, in the app's order: ID proof, FSSAI, kitchen photos, the rest. */
export function documentRows(state: OnboardingState): DocumentRow[] {
  const rows = state.documents.map((document) => {
    const found = ORDER.indexOf(document.documentType);
    return { order: found === -1 ? ORDER.length : found, row: fileRow(document, state.details) };
  });
  const fssai = state.details?.fssaiNumber.trim();
  if (fssai) {
    rows.push({
      order: ORDER.indexOf("FSSAI"),
      row: {
        kind: "fssai",
        title: "FSSAI registration",
        subtitle: formatFssai(fssai),
        chip: state.progress?.fssaiVerified ? APPROVED : UNDER_REVIEW,
        previewId: null,
      },
    });
  }
  return rows.sort((a, b) => a.order - b.order).map(({ row }) => row);
}

/** The files "Upload another document" takes: ID front and back, and the two kitchen photos. */
export function uploadChoices(state: OnboardingState): { type: string; title: string }[] {
  return UPLOAD_TYPES.map((type) => ({ type, title: titleOf(type, state.details) }));
}

/** No application on file (approved before the current one, or never sent): the documents were checked when the chef joined. */
export function hasNoApplication(state: OnboardingState): boolean {
  return state.application.status === "NOT_SUBMITTED" && state.documents.length === 0;
}

function formatDate(value: string | null): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : "";
}

/** The status line at the top of Documents & verification. */
export function verificationBanner(state: OnboardingState): VerificationBanner {
  const { status, reviewedAt, rejectionReason } = state.application;
  if (status === "APPROVED") {
    const date = formatDate(reviewedAt);
    return {
      tone: "ok",
      title: "Your kitchen is verified",
      message: date ? `Approved by Craves on ${date}` : "Approved by Craves",
    };
  }
  if (status === "REJECTED") {
    return {
      tone: "problem",
      title: "Your documents need an update",
      message: rejectionReason || "Craves needs a few changes before it can approve your kitchen.",
    };
  }
  if (status === "NOT_SUBMITTED")
    return {
      tone: "wait",
      title: "Your application is not finished",
      message: "Finish your application to get verified.",
    };
  return {
    tone: "wait",
    title: "Craves is checking your documents",
    message: "We will tell you as soon as it is done.",
  };
}
