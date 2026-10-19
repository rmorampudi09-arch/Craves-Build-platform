import type { OnboardingState } from "../../chef-onboarding/lib/chef-onboarding-v2-contract.ts";
import { format, messages, type Language } from "../../../shared/i18n/language.ts";

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

// Dates keep the English month, as elsewhere on the chef side.
const WORDS = messages({
  en: {
    AADHAAR: "Aadhaar card", PAN: "PAN card", BANK_STATEMENT: "Bank statement", OTHER_GOVERNMENT_ID: "Other government ID", idProof: "ID proof",
    front: "{proof} · front", back: "{proof} · back", kitchenPhoto: "Kitchen photo", setupPhoto: "Cooking setup photo",
    applicantPhoto: "Applicant photo", fssai: "FSSAI registration",
    approved: "Approved", underReview: "Under review", needsUpdate: "Needs update", accepted: "Accepted",
    checked: "Checked by Craves", uploadNew: "Please upload a new one", checking: "Craves is checking it", sent: "Sent with your application",
    verifiedTitle: "Your kitchen is verified", approvedOn: "Approved by Craves on {date}", approvedBy: "Approved by Craves",
    updateTitle: "Your documents need an update", updateMessage: "Craves needs a few changes before it can approve your kitchen.",
    unfinishedTitle: "Your application is not finished", unfinishedMessage: "Finish your application to get verified.",
    checkingTitle: "Craves is checking your documents", checkingMessage: "We will tell you as soon as it is done.",
  },
  te: {
    AADHAAR: "ఆధార్ కార్డు", PAN: "PAN కార్డు", BANK_STATEMENT: "బ్యాంక్ స్టేట్‌మెంట్", OTHER_GOVERNMENT_ID: "ఇతర ప్రభుత్వ గుర్తింపు కార్డు", idProof: "గుర్తింపు పత్రం",
    front: "{proof} · ముందు వైపు", back: "{proof} · వెనుక వైపు", kitchenPhoto: "వంటగది ఫోటో", setupPhoto: "వంట చేసే చోటు ఫోటో",
    applicantPhoto: "మీ ఫోటో", fssai: "FSSAI నమోదు",
    approved: "ఆమోదించబడింది", underReview: "Craves చూస్తోంది", needsUpdate: "మార్చాలి", accepted: "అంగీకరించారు",
    checked: "Craves చెక్ చేసింది", uploadNew: "దయచేసి కొత్తది అప్‌లోడ్ చేయండి", checking: "Craves దీన్ని చెక్ చేస్తోంది", sent: "మీ దరఖాస్తుతో పంపారు",
    verifiedTitle: "మీ వంటగది ధృవీకరించబడింది", approvedOn: "{date} న Craves ఆమోదించింది", approvedBy: "Craves ఆమోదించింది",
    updateTitle: "మీ పత్రాలు మార్చాలి", updateMessage: "మీ వంటగదిని ఆమోదించే ముందు Craves కి కొన్ని మార్పులు కావాలి.",
    unfinishedTitle: "మీ దరఖాస్తు ఇంకా పూర్తి కాలేదు", unfinishedMessage: "ధృవీకరణ కోసం మీ దరఖాస్తు పూర్తి చేయండి.",
    checkingTitle: "Craves మీ పత్రాలు చూస్తోంది", checkingMessage: "పూర్తవగానే మీకు చెబుతాం.",
  },
  kn: {
    AADHAAR: "ಆಧಾರ್ ಕಾರ್ಡ್", PAN: "PAN ಕಾರ್ಡ್", BANK_STATEMENT: "ಬ್ಯಾಂಕ್ ಸ್ಟೇಟ್‌ಮೆಂಟ್", OTHER_GOVERNMENT_ID: "ಇತರ ಸರ್ಕಾರಿ ಗುರುತಿನ ಚೀಟಿ", idProof: "ಗುರುತಿನ ದಾಖಲೆ",
    front: "{proof} · ಮುಂಭಾಗ", back: "{proof} · ಹಿಂಭಾಗ", kitchenPhoto: "ಅಡುಗೆಮನೆ ಫೋಟೋ", setupPhoto: "ಅಡುಗೆ ಮಾಡುವ ಜಾಗದ ಫೋಟೋ",
    applicantPhoto: "ನಿಮ್ಮ ಫೋಟೋ", fssai: "FSSAI ನೋಂದಣಿ",
    approved: "ಅನುಮೋದಿಸಲಾಗಿದೆ", underReview: "Craves ಪರಿಶೀಲಿಸುತ್ತಿದೆ", needsUpdate: "ಬದಲಾಯಿಸಬೇಕು", accepted: "ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
    checked: "Craves ಪರಿಶೀಲಿಸಿದೆ", uploadNew: "ದಯವಿಟ್ಟು ಹೊಸದನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ", checking: "Craves ಇದನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದೆ", sent: "ನಿಮ್ಮ ಅರ್ಜಿಯೊಂದಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ",
    verifiedTitle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಪರಿಶೀಲಿಸಲಾಗಿದೆ", approvedOn: "{date} ರಂದು Craves ಅನುಮೋದಿಸಿದೆ", approvedBy: "Craves ಅನುಮೋದಿಸಿದೆ",
    updateTitle: "ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ಬದಲಾಯಿಸಬೇಕು", updateMessage: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಅನುಮೋದಿಸುವ ಮೊದಲು Craves ಗೆ ಕೆಲವು ಬದಲಾವಣೆಗಳು ಬೇಕು.",
    unfinishedTitle: "ನಿಮ್ಮ ಅರ್ಜಿ ಇನ್ನೂ ಪೂರ್ಣವಾಗಿಲ್ಲ", unfinishedMessage: "ಪರಿಶೀಲನೆಗಾಗಿ ನಿಮ್ಮ ಅರ್ಜಿ ಪೂರ್ಣಗೊಳಿಸಿ.",
    checkingTitle: "Craves ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದೆ", checkingMessage: "ಮುಗಿದ ತಕ್ಷಣ ನಿಮಗೆ ತಿಳಿಸುತ್ತೇವೆ.",
  },
});
type Words = (typeof WORDS)["en"];
type Status = Pick<DocumentRow, "subtitle" | "chip">;

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
function proofName(details: Details, words: Words): string {
  if (details?.proofKind === "OTHER_GOVERNMENT_ID")
    return details.otherGovernmentId.trim() || words.OTHER_GOVERNMENT_ID;
  return details?.proofKind ? words[details.proofKind] : words.idProof;
}

function titleOf(documentType: string, details: Details, words: Words): string {
  switch (documentType) {
    case "SELECTED_PROOF_FRONT":
      return format(words.front, { proof: proofName(details, words) });
    case "SELECTED_PROOF_BACK":
      return format(words.back, { proof: proofName(details, words) });
    case "KITCHEN_PHOTO_1":
      return words.kitchenPhoto;
    case "KITCHEN_PHOTO_2":
      return words.setupPhoto;
    case "APPLICANT_PHOTO":
      return words.applicantPhoto;
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

function fileRow(document: Evidence, details: Details, words: Words, waiting: Status): DocumentRow {
  const common = {
    kind: kindOf(document.documentType),
    title: titleOf(document.documentType, details, words),
    previewId: document.id,
  };
  if (document.status === "APPROVED")
    return { ...common, subtitle: words.checked, chip: { label: words.approved, tone: "success" } };
  if (document.status === "REJECTED")
    return {
      ...common,
      subtitle: document.reviewReason || words.uploadNew,
      chip: { label: words.needsUpdate, tone: "attention" },
    };
  return { ...common, ...waiting };
}

/** `1234 5678 9012 34` for a 14 digit FSSAI number; anything else as given. */
export function formatFssai(value: string): string {
  return /^\d{14}$/.test(value)
    ? value.replace(/^(\d{4})(\d{4})(\d{4})(\d{2})$/, "$1 $2 $3 $4")
    : value;
}

/** Every document the chef gave in the application, in the app's order: ID proof, FSSAI, kitchen photos, the rest. */
export function documentRows(state: OnboardingState, language: Language = "en"): DocumentRow[] {
  const words = WORDS[language];
  // Once Craves approves the application, what was sent with it was accepted with it, even where a file was never
  // marked on its own: "under review" next to "Your kitchen is verified" told approved chefs the opposite.
  const waiting: Status =
    state.application.status === "APPROVED"
      ? { subtitle: words.sent, chip: { label: words.accepted, tone: "success" } }
      : { subtitle: words.checking, chip: { label: words.underReview, tone: "warning" } };
  const rows = state.documents.map((document) => {
    const found = ORDER.indexOf(document.documentType);
    return {
      order: found === -1 ? ORDER.length : found,
      row: fileRow(document, state.details, words, waiting),
    };
  });
  const fssai = state.details?.fssaiNumber.trim();
  if (fssai) {
    rows.push({
      order: ORDER.indexOf("FSSAI"),
      row: {
        kind: "fssai",
        title: words.fssai,
        subtitle: formatFssai(fssai),
        chip: state.progress?.fssaiVerified ? { label: words.approved, tone: "success" } : waiting.chip,
        previewId: null,
      },
    });
  }
  return rows.sort((a, b) => a.order - b.order).map(({ row }) => row);
}

/** The files "Upload another document" takes: ID front and back, and the two kitchen photos. */
export function uploadChoices(
  state: OnboardingState,
  language: Language = "en",
): { type: string; title: string }[] {
  return UPLOAD_TYPES.map((type) => ({ type, title: titleOf(type, state.details, WORDS[language]) }));
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
export function verificationBanner(state: OnboardingState, language: Language = "en"): VerificationBanner {
  const words = WORDS[language];
  const { status, reviewedAt, rejectionReason } = state.application;
  if (status === "APPROVED") {
    const date = formatDate(reviewedAt);
    return {
      tone: "ok",
      title: words.verifiedTitle,
      message: date ? format(words.approvedOn, { date }) : words.approvedBy,
    };
  }
  if (status === "REJECTED") {
    return {
      tone: "problem",
      title: words.updateTitle,
      message: rejectionReason || words.updateMessage,
    };
  }
  if (status === "NOT_SUBMITTED")
    return { tone: "wait", title: words.unfinishedTitle, message: words.unfinishedMessage };
  return { tone: "wait", title: words.checkingTitle, message: words.checkingMessage };
}
