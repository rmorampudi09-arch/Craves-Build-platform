import { z } from "zod";

export const moneySchema = z.string().regex(/^\d{1,14}\.\d{2}$/);
const rate = z.string().regex(/^\d{1,3}(\.\d{1,6})?$/).refine(value => Number(value) <= 100);
export const financeSettingsSchema = z.object({
  ledgerStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ledgerEnabled: z.boolean(),
  automaticPayoutsEnabled: z.boolean(), manualWithdrawalsEnabled: z.boolean(),
  automaticPayoutDelayHours: z.number().int().min(1).max(720), manualAvailabilityDelayHours: z.number().int().min(0).max(720),
  customerCancellationSeconds: z.number().int().min(1).max(3600), chefFeePercent: rate, restaurantGstPercent: rate,
  deliveryGstPercent: rate, platformGstPercent: rate, chefFeeGstPercent: rate,
  chefFeeTaxTreatment: z.enum(["UNCONFIRMED", "INCLUSIVE", "EXCLUSIVE"]), platformFee: moneySchema,
  subscriptionQuotesEnabled: z.boolean(), taxApprovalReference: z.string().max(240).nullable(),
});
export type FinanceSettings = z.infer<typeof financeSettingsSchema>;
export const financeViewSchema = z.object({
  revision: z.number().int().nonnegative(), policyId: z.string().uuid().nullable(), settings: financeSettingsSchema,
  activationBlockers: z.array(z.string()), releaseStatus: z.string(), maximumManualRequestsPerIstDay: z.literal(1),
});
export type FinanceView = z.infer<typeof financeViewSchema>;
export const draftSchema = z.object({id: z.string().uuid(), contentHash: z.string().regex(/^[0-9a-f]{64}$/), settings: financeSettingsSchema});
export const payoutSchema = z.object({
  id: z.string().uuid(), amount: moneySchema, mode: z.enum(["MANUAL", "AUTOMATIC"]),
  status: z.enum(["RESERVED", "SUBMITTING", "PROCESSING", "UNKNOWN", "PAID", "FAILED", "REVERSED", "REVIEW_REQUIRED", "CANCELLED"]),
  payoutChannel: z.enum(["RAZORPAYX", "CRAVES_MANUAL"]).default("RAZORPAYX"),
  providerStatus: z.string().nullable(), transferReference: z.string().nullable(), createdAt: z.string().datetime(),
});
export const chefBalanceSchema = z.object({
  available: moneySchema, outstanding: moneySchema, reservedOrPaid: moneySchema, onHold: z.boolean(),
  manualRequestUsedToday: z.boolean(), nextManualRequestAt: z.string().datetime(), recentPayouts: z.array(payoutSchema), executionEnabled: z.boolean(), payoutMode: z.enum(["RAZORPAYX", "CRAVES_MANUAL"]).default("RAZORPAYX"),
});
export type ChefBalance = z.infer<typeof chefBalanceSchema>;
export const subscriptionPreviewSchema = z.object({total: moneySchema, simulation: z.literal(true), notice: z.string(),
  taxIncludedInTotal: z.literal(true), breakdownRequiredBeforePayment: z.literal(true), occurrences: z.array(z.unknown())});

export function financeRoute(scope: "admin" | "chef", method: string, segments: string[]): string | null {
  if (segments.some(part => !/^[a-zA-Z0-9-]+$/.test(part))) return null;
  const path = segments.join("/");
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const allowed = scope === "chef"
    ? (method === "GET" && path === "balance") || (method === "POST" && path === "withdrawals")
    : (method === "GET" && ["settings", "payouts"].includes(path)) || (method === "POST" &&
      (["policies", "subscription-preview"].includes(path) || new RegExp(`^policies/${uuid}/activate$`).test(path) || new RegExp(`^chefs/${uuid}/(hold|beneficiary)$`).test(path)));
  return allowed ? `/${scope}/finance/${path}` : null;
}
