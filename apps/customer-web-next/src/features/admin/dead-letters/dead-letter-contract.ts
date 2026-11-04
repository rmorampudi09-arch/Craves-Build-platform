import { z } from "zod";

// Handbook 105, read-only: integration-service GET /api/v1/admin/operations/dead-letters (AdminDeadLetterController).
// Payloads never leave the service; a row says what failed, how often and why.
export const SOURCES = ["DELIVERY_WEBHOOK", "CASHFREE_WEBHOOK", "DELIVERY_COMMAND"] as const;
export type DeadLetterSource = (typeof SOURCES)[number];
export const SOURCE_LABELS: Readonly<Record<DeadLetterSource, string>> = {
  DELIVERY_WEBHOOK: "Delivery webhooks", CASHFREE_WEBHOOK: "Cashfree webhooks", DELIVERY_COMMAND: "Delivery commands",
};
export const STATUSES = ["DEAD_LETTER", "FAILED"] as const;
export type DeadLetterStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Readonly<Record<DeadLetterStatus, string>> = { DEAD_LETTER: "Gave up", FAILED: "Failed, still retrying" };

export const PROVIDER = /^[a-z0-9_-]{1,80}$/;
/** The reason travels in the X-Admin-Reason header, so printable ASCII only; integration-service wants 10 to 500 characters. */
export const ADMIN_REASON = /^[\x20-\x7E]{10,500}$/;
// Display only, so any UUID version the database holds is accepted.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const instant = z.string().datetime({ offset: true });
const text = (max: number) => z.string().max(max).nullable();

export const deadLetterSchema = z.object({
  id: uuid, source: z.enum(SOURCES), provider: text(80), kind: text(80), status: z.string().max(40), attemptCount: z.number().int().min(0),
  firstSeenAt: instant.nullable(), lastChangedAt: instant.nullable(), nextAttemptAt: instant.nullable(), providerEventId: text(500),
  deliveryJobId: uuid.nullable(), orderId: uuid.nullable(), chefSubOrderId: uuid.nullable(), lastError: text(500),
  payloadBytes: z.number().int().min(0).nullable(),
});
export const pageSchema = z.object({
  source: z.enum(SOURCES), status: z.enum(STATUSES), total: z.number().int().min(0), limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0), items: z.array(deadLetterSchema).max(100),
});
export type DeadLetter = z.infer<typeof deadLetterSchema>;
export type DeadLetterPage = z.infer<typeof pageSchema>;

/** Every filter the service accepts; anything else is refused before it is sent. */
export const querySchema = z.object({
  source: z.enum(SOURCES), status: z.enum(STATUSES).optional(), provider: z.string().regex(PROVIDER).optional(),
  limit: z.string().regex(/^(100|[1-9][0-9]?)$/).optional(), offset: z.string().regex(/^(10000|[0-9]{1,4})$/).optional(),
}).strict().refine(query => !(query.provider && query.source === "CASHFREE_WEBHOOK"), "Cashfree webhooks have no provider filter.");

const MESSAGES: Record<number, string> = {
  400: "Check the filters and the reason (10 to 500 plain characters), then try again.",
  401: "Your session has ended. Sign in again.",
  403: "Delivery sources need a platform, operations, support or audit admin; Cashfree needs a platform, payments, support or audit admin.",
  // The service answers 404 while CRAVES_DEAD_LETTER_CONSOLE_ENABLED is off (its default), and so does the gateway before its operation exists.
  404: "The dead-letter console is switched off or not set up yet. A platform admin turns it on with CRAVES_DEAD_LETTER_CONSOLE_ENABLED on the integration app and runs scripts/apim/configure-dead-letters-admin-apim.sh once.",
};

/** A fixed message per status: the service's own texts are not shown (a refusal must not reveal roles or internals). */
export function deadLetterError(status: number): { code: string; message: string } {
  const code = status === 404 ? "DEAD_LETTER_CONSOLE_OFF" : status === 401 ? "AUTHENTICATION_REQUIRED" : status === 403 ? "ADMIN_ROLE_REQUIRED"
    : status === 400 ? "INVALID_REQUEST" : "DEAD_LETTERS_UNAVAILABLE";
  return { code, message: MESSAGES[status] ?? "The integration service is unavailable. Try again shortly." };
}
