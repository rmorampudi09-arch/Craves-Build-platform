import { z } from "zod";
import { day, id, instant, personName, reasonBody, reasonText, type FleetRoute } from "./fleet-common";
import { istDay } from "./payout-contract";

export const RIDER_STATUSES = ["NOT_RIDER", "PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export const riderStatusSchema = z.enum(RIDER_STATUSES);

/** Whose turn it is (docs/riders/FLOWS.md): REVIEW is ops's, FIXES and APPLYING the rider's; otherwise the status. */
export const RIDER_STAGES = ["REVIEW", "FIXES", "APPLYING", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export const riderStageSchema = z.enum([...RIDER_STAGES, "NOT_RIDER"]);
export type RiderStage = z.infer<typeof riderStageSchema>;

export const riderSummarySchema = z.object({
  riderId: id, name: personName, phoneMasked: z.string().max(20), status: riderStatusSchema,
  pendingDocuments: z.number().int().nonnegative(), pendingDevice: z.boolean(), createdAt: instant,
  // The application stage and what is left (server with the one-step review); optional so the list still reads an older server.
  stage: riderStageSchema.optional(), missingDocuments: z.number().int().nonnegative().optional(),
  documentsToFix: z.number().int().nonnegative().optional(), payoutAccountSent: z.boolean().optional(), readySince: instant.nullable().optional(),
});
export const riderPageSchema = z.object({
  riders: z.array(riderSummarySchema).max(100), nextCursor: z.string().max(200).nullable(),
  counts: z.record(z.string().max(20), z.number().int().nonnegative()).optional(),
});

export const DOCUMENT_TYPES = ["DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC", "PAN", "PHOTO", "ADDRESS_PROOF", "BANK_PROOF"] as const;
export const riderDocumentSchema = z.object({
  documentId: id,
  type: z.enum(DOCUMENT_TYPES),
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "EXPIRED"]),
  expiresOn: day.nullable(), reason: z.string().max(1000).nullable(),
  reviewedBy: personName.nullable(), reviewedAt: instant.nullable(), uploadedAt: instant,
});
export const riderDeviceSchema = z.object({
  deviceId: id, model: z.string().max(120), appVersion: z.string().max(40),
  state: z.enum(["BOUND", "PENDING_APPROVAL", "REPLACED"]), firstSeenAt: instant,
  approvedBy: personName.nullable(), approvedAt: instant.nullable(),
});
export const payoutAccountSchema = z.object({
  method: z.enum(["UPI", "BANK"]), maskedAccount: z.string().max(80), ifsc: z.string().max(11).nullable(),
  holderName: personName, setBy: personName, setAt: instant,
});
/** The phone's latest report on a shift (app 1.1.0). Read loosely: a strange value must not hide the whole rider page. */
export const phoneHealthSchema = z.object({
  batteryPct: z.number().nullable(), charging: z.boolean().nullable(), powerSave: z.boolean().nullable(),
  canRing: z.boolean().nullable(), batteryPerHourPct: z.number().nullable(), lastExitReason: z.string().max(200).nullable(),
  queuePending: z.number().nullable(), queueOldestAgeS: z.number().nullable(),
});
export const shiftSchema = z.object({
  shiftId: id, startedAt: instant, endedAt: instant.nullable(), selfieState: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  selfieReason: z.string().max(1000).nullable(), selfieReviewedBy: personName.nullable(), inZoneSeconds: z.number().int().nonnegative(),
  // The heartbeat and phone health (server and app 1.1.0); optional so the page still reads an older server.
  lastSeenAt: instant.nullable().optional(), maxSilenceSeconds: z.number().int().nonnegative().optional(),
  silencesOver60s: z.number().int().nonnegative().optional(), phone: phoneHealthSchema.nullable().optional(),
  // Phase 4: on a break, with no offers, until then (an open shift only).
  onBreakUntil: instant.nullable().optional(),
});
export const OFFER_STATES = ["ACTIVE", "ACCEPTED", "DECLINED", "EXPIRED", "LOST", "WITHDRAWN"] as const;
const count = z.number().int().nonnegative();
/** Why the rider got the offer (Phase 4), as the rider saw it; SOONEST (Phase 5) when riders were ranked by travel time. */
export const offerReasonSchema = z.object({
  rule: z.enum(["NEAREST", "FAIR", "SOONEST"]), place: count, riders: count, atOnce: count, round: count,
  bandM: count.optional(), bandRiders: count.optional(), earnedPerHourPaise: count.optional(), freeMinutes: count.optional(),
  // Phase 5: ranked by travel time, the band was counted in these minutes.
  bandMinutes: z.number().nonnegative().optional(),
});
export const riderOfferSchema = z.object({
  offerId: id, tripId: id, orderCode: z.string().max(9), state: z.enum(OFFER_STATES), offeredAt: instant,
  pushedAt: instant.nullable(), pushResult: z.string().max(40).nullable(), rangAt: instant.nullable(),
  rangChannel: z.enum(["fcm", "locations"]).nullable(), reason: offerReasonSchema.nullable().optional(),
});
export const STATUS_EVENT_KINDS = ["SAFETY_PAUSE", "NOTICE", "RESTORE", "DEACTIVATE"] as const;
export const statusEventSchema = z.object({
  eventId: id, kind: z.enum(STATUS_EVENT_KINDS), reason: z.string().max(1000), evidenceSummary: z.string().max(2000),
  deadline: instant.nullable(), reviewBy: instant.nullable(), appealPhone: z.string().max(20).nullable(),
  approverName: personName, createdAt: instant, statusAfter: riderStatusSchema,
});
export const VEHICLE_KINDS = ["PETROL", "ELECTRIC", "BICYCLE"] as const;
export const riderDetailSchema = z.object({
  rider: riderSummarySchema.extend({
    kycName: personName, language: z.enum(["en", "te", "hi"]), vehicleNumberMasked: z.string().max(20).nullable().optional(),
    vehicleKind: z.enum(VEHICLE_KINDS).nullable().optional(), vehicleLabel: z.string().max(80).optional(),
  }),
  documents: z.array(riderDocumentSchema).max(20),
  devices: z.array(riderDeviceSchema).max(10),
  payoutAccount: payoutAccountSchema.nullable(),
  submittedPayoutAccount: payoutAccountSchema.nullable().optional(),
  shifts: z.array(shiftSchema).max(20),
  statusEvents: z.array(statusEventSchema).max(100),
  recentOffers: z.array(riderOfferSchema).max(20).optional(),
  // What this rider must send (by vehicle) and whether dispatch may offer them trips in test mode.
  requiredDocuments: z.array(z.enum(DOCUMENT_TYPES)).max(8).optional(),
  pilotRider: z.boolean().optional(),
  // The rider's details and sent payout account as shown: the decision sends it back, so it applies only to what ops saw.
  applicationVersion: z.string().regex(/^[0-9a-f]{32}$/).optional(),
});

/** Ops's one decision on an application: a verdict per document, and the payout account confirmed or returned. */
export const documentVerdictSchema = z.object({
  documentId: id, verdict: z.enum(["OK", "FIX"]), expiresOn: day.optional(), reason: reasonText.optional(),
});
export const applicationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "FIXES"]),
  documents: z.array(documentVerdictSchema).max(20),
  payoutAccount: z.enum(["CONFIRM", "RETURN"]).optional(),
  applicationVersion: z.string().regex(/^[0-9a-f]{32}$/),
});
export const applicationResultSchema = z.object({
  riderId: id, decision: z.enum(["APPROVE", "FIXES"]), status: riderStatusSchema, stage: z.string().max(20),
  documentsVerified: z.number().int().nonnegative(), fixesAsked: z.number().int().nonnegative(),
  payoutAccountConfirmed: z.boolean(), payoutAccountReturned: z.boolean(), addedToPilot: z.boolean(), rateCardPublished: z.boolean(),
});
export type ApplicationDecision = z.infer<typeof applicationDecisionSchema>;
export type ApplicationResult = z.infer<typeof applicationResultSchema>;
export const selfieReviewSchema = z.object({
  shiftId: id, riderId: id, riderName: personName, startedAt: instant, state: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  reason: z.string().max(1000).nullable(), reviewedBy: personName.nullable(), reviewedAt: instant.nullable(),
});
export const auditEntrySchema = z.object({
  entryId: id, at: instant, actorName: personName, action: z.string().max(60),
  riderId: id.nullable(), targetId: z.string().max(64).nullable(), summary: z.string().max(1000),
});
export const auditPageSchema = z.object({ entries: z.array(auditEntrySchema).max(100), nextCursor: z.string().max(200).nullable() });
export const riderVehicleSchema = z.object({ label: z.string().max(60), regNumberMasked: z.string().max(20) });

/** Approve sends {expiresOn} for documents that expire and no body for the rest. */
export const approveDocumentSchema = z.object({ expiresOn: day }).optional();
export const EXPIRING_DOCUMENTS: readonly (typeof DOCUMENT_TYPES)[number][] = ["DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC"];

/** An expiring document is accepted only with the date printed on it, and not once that date has passed in IST. */
export function expiryProblem(expiresOn: string, today = istDay()): string | null {
  if (!day.safeParse(expiresOn).success) return "Enter the expiry date printed on the document.";
  return expiresOn < today ? "This document has expired. Reject it so the rider uploads a new one." : null;
}
export const riderVehicleInputSchema = z.object({
  label: z.string().trim().min(2, "Enter the vehicle, like Honda Activa 6G.").max(60, "Keep the vehicle to 60 characters."),
  regNumber: z.string().regex(/^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/, "Enter the registration number, like TS09EA1234."),
});

export const createRiderSchema = z.object({
  name: z.string().trim().min(2, "Enter the rider's name as on their documents.").max(120),
  phone: z.string().regex(/^\+91[6-9][0-9]{9}$/, "Enter the phone as +91 and 10 digits."),
  language: z.enum(["en", "te", "hi"]),
});
export const payoutAccountInputSchema = z.object({
  method: z.enum(["UPI", "BANK"]),
  upiId: z.string().regex(/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/, "Enter a UPI ID like name@bank.").optional(),
  accountNumber: z.string().regex(/^[0-9]{9,18}$/, "Enter the account number: 9 to 18 digits.").optional(),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter an IFSC like SBIN0001234.").optional(),
  holderName: z.string().trim().min(2, "Enter the account holder's name.").max(120),
  verifiedInPerson: z.literal(true, { errorMap: () => ({ message: "Tick that you saw the rider and their ID in person." }) }),
}).superRefine((value, context) => {
  if (value.method === "UPI" && !value.upiId) context.addIssue({ code: "custom", path: ["upiId"], message: "Enter a UPI ID like name@bank." });
  if (value.method === "BANK" && (!value.accountNumber || !value.ifsc)) context.addIssue({ code: "custom", path: ["accountNumber"], message: "Enter the account number and IFSC." });
});
export const statusEventInputSchema = z.object({
  kind: z.enum(STATUS_EVENT_KINDS), reason: reasonText,
  evidenceSummary: z.string().trim().min(3, "Summarise the evidence in at least 3 characters.").max(2000),
  deadline: instant.optional(), reviewBy: instant.optional(), appealPhone: z.string().regex(/^\+91[0-9]{10}$/, "Enter the appeal phone as +91 and 10 digits.").optional(),
});
export type StatusEventInput = z.infer<typeof statusEventInputSchema>;
export type RiderSummary = z.infer<typeof riderSummarySchema>;
export type RiderDetail = z.infer<typeof riderDetailSchema>;
export type RiderShift = z.infer<typeof shiftSchema>;
export type RiderOffer = z.infer<typeof riderOfferSchema>;
export type SelfieReview = z.infer<typeof selfieReviewSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;

const HOUR = 3_600_000;
/** The due-process rules a person must meet; the server checks them again. */
export function statusEventProblem(input: StatusEventInput, now = Date.now()): string | null {
  const parsed = statusEventInputSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the details.";
  if (input.kind !== "RESTORE" && !input.appealPhone) return "Add the appeal phone number: +91 and 10 digits.";
  if (input.kind === "NOTICE" && !(input.deadline && Date.parse(input.deadline) - now >= 7 * 24 * HOUR)) {
    return "The notice deadline must be at least 7 days from now.";
  }
  if (input.kind === "SAFETY_PAUSE" && !(input.reviewBy && Date.parse(input.reviewBy) > now && Date.parse(input.reviewBy) - now <= 72 * HOUR)) {
    return "The safety pause review must be within the next 72 hours.";
  }
  return null;
}

export const RIDER_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "riders", response: riderPageSchema,
    query: { status: riderStatusSchema, stage: z.enum(RIDER_STAGES), search: z.string().max(80), cursor: z.string().max(200) } },
  { method: "POST", path: "riders/:id/application/decision", body: applicationDecisionSchema, response: applicationResultSchema },
  { method: "POST", path: "riders", body: createRiderSchema, response: riderSummarySchema },
  { method: "GET", path: "riders/:id", response: riderDetailSchema },
  { method: "GET", path: "riders/:id/documents/:id/content", file: { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024 } },
  // Phase 4: everything kept about the rider, for a rider who asks support for a copy (audited; the rider sees the download).
  { method: "GET", path: "riders/:id/data-export", file: { types: ["application/json"], maxBytes: 20 * 1024 * 1024, attachment: ids => `rider-${ids[0]}-data.json` } },
  { method: "POST", path: "riders/:id/documents/:id/approve", body: approveDocumentSchema, response: riderDocumentSchema },
  { method: "POST", path: "riders/:id/documents/:id/reject", body: reasonBody, response: riderDocumentSchema },
  { method: "POST", path: "riders/:id/devices/:id/approve", response: riderDeviceSchema },
  { method: "PUT", path: "riders/:id/payout-account", body: payoutAccountInputSchema, response: payoutAccountSchema },
  { method: "POST", path: "riders/:id/payout-account/confirm", response: payoutAccountSchema },
  { method: "PUT", path: "riders/:id/vehicle", body: riderVehicleInputSchema, response: riderVehicleSchema },
  { method: "POST", path: "riders/:id/status-events", body: statusEventInputSchema, response: statusEventSchema },
  { method: "GET", path: "selfie-reviews", response: z.object({ items: z.array(selfieReviewSchema).max(200) }),
    query: { state: z.enum(["PENDING", "APPROVED", "REJECTED"]) } },
  { method: "GET", path: "shifts/:id/selfie", file: { types: ["image/jpeg"], maxBytes: 5 * 1024 * 1024 } },
  { method: "POST", path: "shifts/:id/selfie/approve", response: selfieReviewSchema },
  { method: "POST", path: "shifts/:id/selfie/reject", body: reasonBody, response: selfieReviewSchema },
  { method: "GET", path: "audit", response: auditPageSchema, query: { riderId: id, cursor: z.string().max(200) } },
  { method: "GET", path: "exports/rider-joins-exits", query: { date: day },
    file: { types: ["text/csv"], maxBytes: 2 * 1024 * 1024, attachment: (_, query) => `rider-joins-exits-${query.get("date")}.csv` } },
];
