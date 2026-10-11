import { z } from "zod";

export const documentTypes = ["ORDER_SUMMARY", "PAYMENT_RECEIPT", "SUBSCRIPTION_RECEIPT", "CHEF_ORDER_STATEMENT", "CHEF_EARNINGS_STATEMENT", "CHEF_SETTLEMENT_STATEMENT"] as const;
export type DocumentType = typeof documentTypes[number];
export const documentTypeSchema = z.enum(documentTypes);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const instant = z.string().datetime({ offset: true });
const nullableInstant = instant.nullable().optional();
export const documentRequestSchema = z.object({
  type: documentTypeSchema,
  sourceId: z.string().uuid().nullable().optional(),
  from: date.nullable().optional(),
  to: date.nullable().optional(),
  timezone: z.string().min(1).max(80).default("Asia/Kolkata").refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
}).strict().superRefine((value, context) => {
  if (value.type.startsWith("CHEF_")) {
    const days = value.from && value.to ? (Date.parse(value.to) - Date.parse(value.from)) / 86400000 : 0;
    if (value.sourceId || !value.from || !value.to || days < 1 || days > 31) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a period of 1 to 31 days; the end date is exclusive." });
  } else if (!value.sourceId || value.from || value.to) context.addIssue({ code: z.ZodIssueCode.custom, message: "An order or invoice ID is required without a period." });
});
export type DocumentRequest = z.infer<typeof documentRequestSchema>;
export const documentSummarySchema = z.object({
  id: z.string().uuid(), type: documentTypeSchema, reference: z.string().max(160),
  currency: z.string().regex(/^[A-Z]{3}$/), status: z.enum(["QUEUED", "RENDERING", "READY", "FAILED"]),
  createdAt: instant, readyAt: nullableInstant,
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
  bytes: z.number().int().min(5).max(4 * 1024 * 1024).nullable().optional(),
  templateVersion: z.string().min(1).max(60), errorCode: z.string().max(100).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "READY" && (!value.sha256 || !value.bytes || !value.readyAt)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete ready document metadata" });
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export const documentPageSchema = z.object({ items: z.array(documentSummarySchema).max(50), nextCursor: z.string().max(180).nullable().optional() }).strict();
export const documentEmailSchema = z.object({
  id: z.string().uuid(), documentId: z.string().uuid(), status: z.enum(["QUEUED", "SENDING", "ACCEPTED", "FAILED", "UNKNOWN"]),
  createdAt: instant, updatedAt: instant, errorCode: z.string().max(100).nullable().optional(),
}).strict();
export const documentCapabilitiesSchema = z.object({
  enabled: z.boolean(), emailEnabled: z.boolean(), types: z.array(documentTypeSchema).max(6),
  maxPeriodDays: z.literal(31), maxRows: z.literal(1000), taxInvoicesEnabled: z.literal(false),
}).strict();
export type DocumentCapabilities = z.infer<typeof documentCapabilitiesSchema>;
export const documentLabels: Record<DocumentType, string> = {
  ORDER_SUMMARY: "Order summary", PAYMENT_RECEIPT: "Payment receipt", SUBSCRIPTION_RECEIPT: "Subscription receipt",
  CHEF_ORDER_STATEMENT: "Order activity", CHEF_EARNINGS_STATEMENT: "Earnings statement", CHEF_SETTLEMENT_STATEMENT: "Settlement allocations",
};
export function documentError(code: string): string {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Please sign in to access your documents.", SESSION_EXPIRED: "Your session expired. Please sign in again.",
    DOCUMENTS_DISABLED: "PDF documents have not been activated yet.", DOCUMENT_EMAIL_DISABLED: "Email copies have not been activated yet.",
    DOCUMENT_SOURCE_NOT_ELIGIBLE: "This record is not eligible for that document. A receipt requires a paid record; otherwise choose an order summary.",
    DOCUMENT_REQUEST_LIMIT: "You have reached the document request limit. Wait for current jobs to finish or try later.",
    STATEMENT_TOO_LARGE_REDUCE_PERIOD: "There are too many records. Choose a shorter statement period.",
    EMAIL_PENDING_OR_OUTCOME_UNKNOWN: "An email is already pending or its outcome is uncertain. Another copy was not submitted.",
    UNSUPPORTED_DOCUMENT_GLYPH: "The configured PDF font cannot render some text. Contact support; the source data has not been changed.",
  };
  return messages[code] ?? "The document operation could not be completed. Refresh the history before retrying.";
}
