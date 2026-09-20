import { z } from "zod";
import { chefAccountingSchema, moneySchema } from "@/lib/finance-contract";
const id = z.string().uuid();
const reason = z.string().trim().min(1).max(1000);
const ref = z.string().trim().min(1).max(240).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
export const manualReservationSchema = z.object({requestKey: id, expectedAvailableAmount: moneySchema, reason}).strict();
export const manualActionSchema = z.object({
  actionKey: id, expectedVersion: z.number().int().nonnegative(),
  action: z.enum(["AUTHORIZE_TRANSFER", "CONFIRM_PAID", "MARK_UNKNOWN", "CANCEL_RESERVATION", "CONFIRM_NOT_SENT", "CONFIRM_REVERSED"]),
  reason, destinationReference: ref.nullable(), evidenceReference: ref.nullable(),
  bankReference: ref.refine(value => value.length <= 160).nullable(), amount: moneySchema.nullable(), paidAt: z.string().datetime({offset: true}).nullable(),
}).strict().superRefine((value, context) => {
  const money = value.action === "CONFIRM_PAID" || value.action === "CONFIRM_REVERSED";
  if ((value.action === "AUTHORIZE_TRANSFER") !== (value.destinationReference !== null)
    || (money || value.action === "CONFIRM_NOT_SENT") !== (value.evidenceReference !== null)
    || (money ? value.amount === null || value.paidAt === null : value.amount !== null || value.paidAt !== null || value.bankReference !== null))
    context.addIssue({code: z.ZodIssueCode.custom, message: "Action evidence does not match the selected operation"});
});
export const manualInstructionSchema = z.object({
  id, chefIdentityId: id, amount: moneySchema, status: z.enum(["RESERVED", "SUBMITTING", "UNKNOWN", "PAID", "FAILED", "REVERSED", "REVIEW_REQUIRED", "CANCELLED"]),
  version: z.number().int().nonnegative(), destinationReference: ref.nullable(), bankReference: z.string().max(160).nullable(),
  authorizedAt: z.string().datetime({offset: true}).nullable(), paidAt: z.string().datetime({offset: true}).nullable(), createdAt: z.string().datetime({offset: true}),
});
export const manualBalanceSchema = z.object({chefIdentityId: id, available: moneySchema, onHold: z.boolean(), enabled: z.boolean(), manualRequestUsedToday: z.boolean(), recent: z.array(manualInstructionSchema).max(100), accounting: chefAccountingSchema.optional()});
export type ManualInstruction = z.infer<typeof manualInstructionSchema>;
export type ManualAction = z.infer<typeof manualActionSchema>;
export type ManualBalance = z.infer<typeof manualBalanceSchema>;

export function manualSettlementRoute(method: string, segments: string[]) {
  if (method === "GET" && segments.length === 1 && segments[0] === "manual-settlements") return "/admin/finance/manual-settlements";
  if (segments.length === 3 && segments[0] === "chefs" && id.safeParse(segments[1]).success
    && ((method === "GET" && segments[2] === "manual-settlement") || (method === "POST" && segments[2] === "manual-settlements"))) return `/admin/finance/${segments.join("/")}`;
  if (method === "POST" && segments.length === 3 && segments[0] === "manual-settlements" && id.safeParse(segments[1]).success && segments[2] === "actions") return `/admin/finance/${segments.join("/")}`;
  return null;
}
