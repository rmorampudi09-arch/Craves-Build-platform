import { z } from "zod";
import { day, id, instant, personName, reasonBody, reasonText, type FleetRoute } from "./fleet-common";
import { istDay } from "./payout-contract";

export const RIDER_STATUSES = ["NOT_RIDER", "PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export const riderStatusSchema = z.enum(RIDER_STATUSES);

export const riderSummarySchema = z.object({
  riderId: id, name: personName, phoneMasked: z.string().max(20), status: riderStatusSchema,
  pendingDocuments: z.number().int().nonnegative(), pendingDevice: z.boolean(), createdAt: instant,
});
export const riderPageSchema = z.object({ riders: z.array(riderSummarySchema).max(100), nextCursor: z.string().max(200).nullable() });

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
export const shiftSchema = z.object({
  shiftId: id, startedAt: instant, endedAt: instant.nullable(), selfieState: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  selfieReason: z.string().max(1000).nullable(), selfieReviewedBy: personName.nullable(), inZoneSeconds: z.number().int().nonnegative(),
});
export const STATUS_EVENT_KINDS = ["SAFETY_PAUSE", "NOTICE", "RESTORE", "DEACTIVATE"] as const;
export const statusEventSchema = z.object({
  eventId: id, kind: z.enum(STATUS_EVENT_KINDS), reason: z.string().max(1000), evidenceSummary: z.string().max(2000),
  deadline: instant.nullable(), reviewBy: instant.nullable(), appealPhone: z.string().max(20).nullable(),
  approverName: personName, createdAt: instant, statusAfter: riderStatusSchema,
});
export const riderDetailSchema = z.object({
  rider: riderSummarySchema.extend({
    kycName: personName, language: z.enum(["en", "te", "hi"]), vehicleNumberMasked: z.string().max(20).nullable().optional(),
  }),
  documents: z.array(riderDocumentSchema).max(20),
  devices: z.array(riderDeviceSchema).max(10),
  payoutAccount: payoutAccountSchema.nullable(),
  submittedPayoutAccount: payoutAccountSchema.nullable().optional(),
  shifts: z.array(shiftSchema).max(20),
  statusEvents: z.array(statusEventSchema).max(100),
});
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
    query: { status: riderStatusSchema, search: z.string().max(80), cursor: z.string().max(200) } },
  { method: "POST", path: "riders", body: createRiderSchema, response: riderSummarySchema },
  { method: "GET", path: "riders/:id", response: riderDetailSchema },
  { method: "GET", path: "riders/:id/documents/:id/content", file: { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024 } },
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
