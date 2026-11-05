import { z } from "zod";
import type { AdminDeletionBlocker, AdminDeletionDetail, AdminDeletionPage, AdminDeletionSummary, DeletionScope, DeletionView } from "@/features/account-deletion/domain/deletion-types";

export const DELETION_SCOPES = ["CUSTOMER", "CHEF", "ALL"] as const;
export const DELETION_STATUSES = ["PENDING_REVIEW", "SCHEDULED", "WAITING_ON_OPEN_ITEMS", "ERASING", "CANCELLED", "REJECTED", "COMPLETED"] as const;
/** The admin list's status filter: "" is every status. */
export const ADMIN_STATUS_FILTERS = ["", ...DELETION_STATUSES] as const;

const scope = z.enum(DELETION_SCOPES);
const status = z.enum(DELETION_STATUSES);
const id = z.string().min(1).max(64);
const text = z.string().max(2000);
// The backend omits or nulls a field that has no value; the page always sees null.
const optionalText = text.nullish().transform((v) => v ?? null);

const viewSchema = z.object({ requestId: id, scope, status, requestedAt: z.string().max(64), dueAt: optionalText, reviewNote: optionalText });
const summarySchema = z.object({
  requestId: id, identityId: id, scope, status, via: z.enum(["APP", "WEB"]), requestedAt: z.string().max(64),
  dueAt: optionalText, reviewedBy: optionalText, reviewedAt: optionalText, reviewNote: optionalText,
});
const stepSchema = z.object({ phase: text, service: text, status: text, attempts: z.number().int(), lastError: optionalText, completedAt: optionalText });
const blockerSchema = z.object({ service: text, code: text, detail: optionalText });
const pageSchema = z.object({ items: z.array(summarySchema).max(100), nextCursor: optionalText });
const detailSchema = z.object({
  request: summarySchema, phoneLast4: optionalText, roles: z.array(text).max(20),
  steps: z.array(stepSchema).max(200), blockers: z.array(blockerSchema).max(200),
});
// The 409 body of an approval that open items refuse: {code, message, blockers}.
const openItemsSchema = z.object({ blockers: z.array(blockerSchema).max(200) });

const read = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T | null => {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export const isDeletionScope = (value: unknown): value is DeletionScope => scope.safeParse(value).success;
export const parseDeletionView = (raw: unknown): DeletionView | null => read(viewSchema, raw);
export const parseAdminSummary = (raw: unknown): AdminDeletionSummary | null => read(summarySchema, raw);
export const parseAdminPage = (raw: unknown): AdminDeletionPage | null => read(pageSchema, raw);
export const parseOpenItems = (raw: unknown): AdminDeletionBlocker[] | null => read(openItemsSchema, raw)?.blockers ?? null;

export function parseAdminDetail(raw: unknown, canDecide: boolean): AdminDeletionDetail | null {
  const detail = read(detailSchema, raw);
  return detail && { ...detail, canDecide };
}
