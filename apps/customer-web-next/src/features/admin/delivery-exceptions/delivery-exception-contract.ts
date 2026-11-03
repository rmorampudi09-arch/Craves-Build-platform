import { z } from "zod";
import { id, instant, UUID, type FleetRoute } from "@/features/admin/fleet/lib/fleet-common";

// M25 delivery exception cases: integration-service /api/v1/admin/operations/delivery-exceptions
// (decisions in docs/advanced-features/modules.md). Recording only: nothing here books or cancels a delivery.
export const REASONS: Readonly<Record<string, string>> = {
  PICKUP_DELAYED: "Pickup delayed", RIDER_NOT_ASSIGNED: "No rider assigned", RIDER_UNREACHABLE: "Rider unreachable",
  CUSTOMER_UNREACHABLE: "Customer unreachable", ADDRESS_ISSUE: "Address problem", FOOD_DAMAGED: "Food damaged",
  PROVIDER_CANCELLED: "Provider cancelled", OTHER: "Something else",
};
export const STATUSES = ["OPEN", "ACKNOWLEDGED", "REASSIGNMENT_REQUESTED", "RESOLVED", "DISMISSED"] as const;
export type CaseStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Readonly<Record<CaseStatus, string>> = {
  OPEN: "Open", ACKNOWLEDGED: "Acknowledged", REASSIGNMENT_REQUESTED: "Another provider asked for", RESOLVED: "Resolved", DISMISSED: "Dismissed",
};
export const ACTIONS = ["ACKNOWLEDGE", "ASSIGN", "REQUEST_REASSIGNMENT", "RESOLVE", "DISMISS"] as const;
export type CaseAction = (typeof ACTIONS)[number];
/** Providers integration-service registers; it refuses one that is not active. */
export const PROVIDERS = ["pidge", "borzo", "craves_fleet", "shadowfax", "porter", "delhivery", "shiprocket"] as const;

const reason = z.enum(Object.keys(REASONS) as [string, ...string[]]);
const note = z.string().max(1000);
const provider = z.string().max(80);
const typedId = z.string().trim().regex(UUID, "Paste the full 36-character ID.");

export const caseSchema = z.object({
  id, deliveryJobId: id, orderId: id, currentProviderId: provider, deliveryStatus: z.string().max(40), reason,
  status: z.enum(STATUSES), assigneeId: id.nullable(), reassignToProviderId: provider.nullable(), resolutionNote: note.nullable(),
  openedBy: id, version: z.number().int().min(0), createdAt: instant, updatedAt: instant, closedAt: instant.nullable(),
});
export const eventSchema = z.object({
  id: z.number().int(), action: z.string().max(30), status: z.enum(STATUSES), actorId: id, note: note.nullable(), occurredAt: instant,
});
export const detailSchema = z.object({ exceptionCase: caseSchema, events: z.array(eventSchema).max(1000) });
export const pageSchema = z.object({ items: z.array(caseSchema).max(100), hasMore: z.boolean() });

/** Open by order (its only delivery job) or by delivery job; a note is required for "Something else". */
export const openSchema = z.object({ deliveryJobId: typedId.optional(), orderId: typedId.optional(), reason, note: note.trim().optional() })
  .refine(body => !body.deliveryJobId !== !body.orderId, "Give the order ID or the delivery job ID, not both.")
  .refine(body => body.reason !== "OTHER" || Boolean(body.note), "Write a note for “Something else”.");
/** ASSIGN without an assignee gives the case to the admin who sends it. */
export const actionSchema = z.object({
  action: z.enum(ACTIONS), expectedVersion: z.number().int().min(0), note: note.trim().optional(), providerId: provider.trim().optional(),
}).refine(body => (body.action !== "RESOLVE" && body.action !== "DISMISS") || Boolean(body.note), "Write what was done.")
  .refine(body => body.action !== "REQUEST_REASSIGNMENT" || Boolean(body.providerId), "Choose the provider to move to.");

export type ExceptionCase = z.infer<typeof caseSchema>;
export type CaseEvent = z.infer<typeof eventSchema>;

export const DELIVERY_EXCEPTION_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "", response: pageSchema, query: {
    status: z.enum(STATUSES), orderId: z.string().regex(UUID), limit: z.string().regex(/^(100|[1-9][0-9]?)$/), offset: z.string().regex(/^\d{1,4}$/),
  } },
  { method: "POST", path: "", body: openSchema, response: detailSchema },
  { method: "GET", path: ":id", response: detailSchema },
  { method: "POST", path: ":id/actions", body: actionSchema, response: detailSchema },
];

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Check the details and try again.",
  401: "Your session has ended. Sign in again.",
  403: "Platform and operations admins change cases; support and audit admins can only read them.",
  404: "Not found. It may have changed; refresh the page.",
  409: "This case changed since you loaded it. Refresh and check before trying again.",
};

/** The service's own {code, message}, or a plain default for the status. */
export function exceptionError(status: number, body: unknown): { code: string; message: string } {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof raw.code === "string" && /^[A-Z0-9_]{1,80}$/.test(raw.code) ? raw.code : "DELIVERY_EXCEPTION_REQUEST_FAILED";
  if (code === "DELIVERY_EXCEPTIONS_DISABLED") {
    return { code, message: "Delivery exceptions are switched off. A platform admin turns them on with CRAVES_DELIVERY_EXCEPTIONS_ENABLED on the integration app." };
  }
  const message = status === 403 || typeof raw.message !== "string" ? "" : raw.message.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 500);
  return { code, message: message || (DEFAULT_MESSAGES[status] ?? "The delivery service is unavailable. Try again shortly.") };
}
