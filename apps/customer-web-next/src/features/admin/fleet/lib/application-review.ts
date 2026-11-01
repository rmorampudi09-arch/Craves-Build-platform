import { reasonText } from "./fleet-common";
import { istDay } from "./payout-contract";
import { EXPIRING_DOCUMENTS, type ApplicationDecision, type DOCUMENT_TYPES, type RiderDetail, type RiderStage, type RiderSummary } from "./rider-contract";

// One application, one decision (docs/riders/FLOWS.md): what the review page shows for each item and what one press sends.

type DocumentType = (typeof DOCUMENT_TYPES)[number];
type Document = RiderDetail["documents"][number];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  DRIVING_LICENCE: "Driving licence", VEHICLE_RC: "Vehicle RC", VEHICLE_INSURANCE: "Vehicle insurance", PUC: "PUC certificate",
  PAN: "PAN card", PHOTO: "Photo", ADDRESS_PROOF: "Address proof", BANK_PROOF: "Bank proof",
};

/** What to compare on each photo, so a new reviewer checks the same things. */
export const DOCUMENT_CHECKS: Record<DocumentType, string> = {
  DRIVING_LICENCE: "Name matches, covers two-wheelers, not expired.",
  VEHICLE_RC: "Plate and make match the vehicle above, not expired.",
  VEHICLE_INSURANCE: "Same plate as the RC, policy not expired.",
  PUC: "Same plate as the RC, certificate not expired.",
  PAN: "Name matches the other documents.",
  PHOTO: "A clear photo of the rider's face. Compare with the licence photo. Every go-online selfie is checked against this one.",
  ADDRESS_PROOF: "Name matches, address readable.",
  BANK_PROOF: "Name, account number and IFSC match the payout account below.",
};

/** Reasons ops picks most, written for the rider; any other reason can be typed. */
export const FIX_REASONS = [
  "The photo is blurry. Take it again in good light.",
  "All four corners must be in the photo.",
  "This document has expired. Send the renewed one.",
  "The name doesn't match your other documents.",
  "This is not the document we asked for.",
] as const;

export const STAGE_LABELS: Record<RiderStage, string> = {
  REVIEW: "Ready for review", FIXES: "Waiting for fixes", APPLYING: "Still applying", ACTIVE: "Active", SUSPENDED: "Paused",
  DEACTIVATED: "Closed", NOT_RIDER: "Not a rider",
};

export const VEHICLE_LABELS = { PETROL: "Petrol scooter or bike", ELECTRIC: "Electric scooter or bike", BICYCLE: "Bicycle" } as const;
// The server's names for a kind, used as the label when the rider gave no make and model.
const KIND_NAMES = new Set(["Petrol two-wheeler", "Electric two-wheeler", "Bicycle", "Two-wheeler"]);

/** The make and model the rider typed, or null when the label is only the kind's name. */
export function vehicleModel(label: string | undefined): string | null {
  return label && !KIND_NAMES.has(label) ? label : null;
}

export type ItemState = "MISSING" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
export type ReviewItem = { type: DocumentType; label: string; document: Document | null; state: ItemState; expiring: boolean };
export type Mark = { verdict: "OK"; expiresOn: string } | { verdict: "FIX"; reason: string };
export type PayoutState = "MISSING" | "SENT" | "CONFIRMED";
export type PayoutMark = { verdict: "OK" } | { verdict: "FIX" } | null;

/** The rider's latest photo of each required type (the server lists the last 20, newest first). */
export function reviewItems(detail: RiderDetail): ReviewItem[] {
  const required = detail.requiredDocuments ?? ["DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC", "PAN", "BANK_PROOF"];
  return required.map(type => {
    const document = detail.documents.find(item => item.type === type) ?? null;
    return { type, label: DOCUMENT_LABELS[type], document, state: document?.status ?? "MISSING", expiring: EXPIRING_DOCUMENTS.includes(type) };
  });
}

export function payoutState(detail: RiderDetail): PayoutState {
  return detail.submittedPayoutAccount ? "SENT" : detail.payoutAccount ? "CONFIRMED" : "MISSING";
}

export type Plan = {
  /** Items waiting for a verdict (the payout account included), and how many have one. */
  toCheck: number;
  marked: number;
  fixes: number;
  /** Why Approve and activate can't be pressed yet; empty when it can. */
  approveBlockers: string[];
  /** Why the fixes can't be sent yet; null when they can. */
  fixesProblem: string | null;
  /** The decision bodies, less the application version the page adds. */
  approve: Omit<ApplicationDecision, "applicationVersion">;
  askFixes: Omit<ApplicationDecision, "applicationVersion">;
};

/** What one press of either button sends, and what stops it, from the marks ops made on the page. */
export function plan(items: ReviewItem[], marks: Record<string, Mark | undefined>, payout: PayoutState, payoutMark: PayoutMark, today = istDay()): Plan {
  const pending = items.filter(item => item.state === "PENDING" && item.document);
  const blockers: string[] = [];
  const missing = items.filter(item => item.state === "MISSING").map(item => item.label);
  if (missing.length) blockers.push(`Waiting for the rider to send: ${missing.join(", ")}.`);
  const resend = items.filter(item => item.state === "REJECTED" || item.state === "EXPIRED").map(item => item.label);
  if (resend.length) blockers.push(`Waiting for a new photo of: ${resend.join(", ")}.`);
  if (payout === "MISSING") blockers.push("Waiting for the rider to send a payout account.");

  let fixesProblem: string | null = null;
  const verdicts: ApplicationDecision["documents"] = [];
  const unmarked: string[] = [];
  for (const item of pending) {
    const mark = marks[item.document!.documentId];
    if (!mark) {
      unmarked.push(item.label);
    } else if (mark.verdict === "FIX") {
      const reason = reasonText.safeParse(mark.reason);
      if (reason.success) verdicts.push({ documentId: item.document!.documentId, verdict: "FIX", reason: reason.data });
      else fixesProblem ??= `Write what the rider must fix on the ${item.label}.`;
    } else {
      const problem = !item.expiring ? null : !/^\d{4}-\d{2}-\d{2}$/.test(mark.expiresOn) ? `Enter the expiry date printed on the ${item.label}.`
        : mark.expiresOn < today ? `The ${item.label} has expired. Mark it “Needs a fix”.` : null;
      if (problem) fixesProblem ??= problem;
      else verdicts.push({ documentId: item.document!.documentId, verdict: "OK", ...(item.expiring ? { expiresOn: mark.expiresOn } : {}) });
    }
  }
  // Every "Needs a fix" counts, written reason or not, so the page switches to sending fixes as soon as one is marked.
  const fixes = pending.filter(item => marks[item.document!.documentId]?.verdict === "FIX").length
    + (payout === "SENT" && payoutMark?.verdict === "FIX" ? 1 : 0);
  if (unmarked.length) blockers.push(`Mark ${unmarked.join(", ")}.`);
  if (payout === "SENT" && !payoutMark) blockers.push("Mark the payout account.");
  if (fixes) blockers.push("Something is marked “Needs a fix”. Send the fixes instead.");
  if (fixesProblem) blockers.push(fixesProblem);

  const payoutAction = payout !== "SENT" || !payoutMark ? {} : { payoutAccount: payoutMark.verdict === "OK" ? "CONFIRM" as const : "RETURN" as const };
  return {
    toCheck: pending.length + (payout === "SENT" ? 1 : 0),
    marked: pending.filter(item => marks[item.document!.documentId]).length + (payout === "SENT" && payoutMark ? 1 : 0),
    fixes,
    approveBlockers: blockers,
    fixesProblem: fixesProblem ?? (fixes ? null : "Mark at least one item “Needs a fix”, with a reason."),
    approve: { decision: "APPROVE", documents: verdicts, ...payoutAction },
    askFixes: { decision: "FIXES", documents: verdicts, ...payoutAction },
  };
}

const HOUR = 3_600_000;

/** How long an application has waited for ops, in words: "waiting 40 min", "waiting 3 h", "waiting 2 days". */
export function waited(since: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(since));
  if (ms < HOUR) return `waiting ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 48 * HOUR) return `waiting ${Math.floor(ms / HOUR)} h`;
  return `waiting ${Math.floor(ms / (24 * HOUR))} days`;
}

/** The queue's "next step" for one rider: whose turn it is and what is left, in plain words. */
export function nextStep(rider: RiderSummary, now = Date.now()): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  switch (rider.stage) {
    case "REVIEW":
      return `Review the application${rider.readySince ? ` · ${waited(rider.readySince, now)}` : ""}`;
    case "FIXES":
      return `Rider is fixing: ${[rider.documentsToFix ? plural(rider.documentsToFix, "document") : "",
        rider.payoutAccountSent === false ? "payout account" : ""].filter(Boolean).join(", ") || "items sent back"}`;
    case "APPLYING":
      return `Rider still to send: ${[rider.missingDocuments ? plural(rider.missingDocuments, "document") : "",
        rider.documentsToFix ? `${plural(rider.documentsToFix, "photo")} again` : "",
        rider.payoutAccountSent === false ? "payout account" : ""].filter(Boolean).join(", ") || "their details"}`;
    default: {
      const work = [rider.pendingDocuments ? `${plural(rider.pendingDocuments, "document")} to check` : "",
        rider.pendingDevice ? "new phone to approve" : ""].filter(Boolean);
      return work.length ? work.join(", ") : "Nothing to do";
    }
  }
}
