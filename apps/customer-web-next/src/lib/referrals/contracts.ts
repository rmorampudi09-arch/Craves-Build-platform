import { z } from "zod";

// Money crosses the API boundary as decimal strings, never IEEE-754 numbers.
const LONG_MAX = BigInt("9223372036854775807");
export const paiseSchema = z.string().regex(/^-?(0|[1-9]\d{0,18})$/).refine(value => {
  const n = BigInt(value);
  return n >= -LONG_MAX && n <= LONG_MAX;
}, "Amount outside signed 64-bit range");
export const nonnegativePaiseSchema = paiseSchema.refine(value => BigInt(value) >= BigInt(0));
const countSchema = nonnegativePaiseSchema;
const instantSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
export const codeSchema = z.string().regex(/^[2-9A-HJ-NP-Z]{16}$/);
export const approvalKeys = ["legalReviewRef", "termsVersion", "taxReviewRef", "privacyReviewRef", "fundingReviewRef", "multiChefDecisionRef", "payoutReviewRef"] as const;
export const approvalsSchema = z.object(Object.fromEntries(approvalKeys.map(key => [key, z.string().trim().min(1).max(180)])) as Record<typeof approvalKeys[number], z.ZodString>);
export const policySchema = z.object({
  revision: countSchema,
  ratesBps: z.tuple([z.number().int().min(0).max(400), z.number().int().min(0).max(400), z.number().int().min(0).max(400)]),
  capBps: z.number().int().min(1).max(400), holdDays: z.number().int().min(1).max(365),
  minimumPaise: nonnegativePaiseSchema, customerBonusPaise: nonnegativePaiseSchema,
  inviteeDiscountPaise: nonnegativePaiseSchema, unusedShare: z.literal("retain")
});
const codeValueSchema = z.object({ code: codeSchema, link: z.string().url().max(2048), qrPath: z.literal("/api/v1/referrals/me/code/qr") });
export const overviewSchema = z.object({
  asOf: instantSchema, currency: z.literal("INR"), pendingPaise: nonnegativePaiseSchema,
  availablePaise: paiseSchema, reservedPaise: nonnegativePaiseSchema, balanceUpdatedAt: instantSchema,
  onReviewHold: z.boolean(), spendingEnabled: z.boolean(), code: codeValueSchema,
  levels: z.array(z.object({ level: z.number().int().min(1).max(3), netEarnedPaise: paiseSchema })).length(3),
  downline: z.array(z.object({ level: z.number().int().min(1).max(3), members: countSchema })).max(3),
  cashout: z.object({ enabled: z.boolean(), eligible: z.boolean(), reason: z.string().max(100), minimumPaise: nonnegativePaiseSchema }),
  policy: policySchema.nullable()
});
export const rewardSchema = z.object({
  id: uuidSchema, track: z.enum(["UPLINE", "CUSTOMER"]), level: z.number().int().min(0).max(3),
  amountPaise: nonnegativePaiseSchema, reversedPaise: nonnegativePaiseSchema, netPaise: paiseSchema,
  status: z.enum(["PENDING", "CREDITED", "REVERSED", "CANCELLED"]), createdAt: instantSchema, holdUntil: instantSchema
});
export const cashoutSchema = z.object({
  id: uuidSchema, amountPaise: nonnegativePaiseSchema,
  status: z.enum(["RESERVED", "APPROVED", "SUBMITTED", "UNKNOWN", "PAID", "RELEASED"]), requestedAt: instantSchema
});
export const rewardPageSchema = z.object({ items: z.array(rewardSchema).max(100), nextCursor: z.string().max(512).nullable() });
export const cashoutPageSchema = z.object({ items: z.array(cashoutSchema).max(100), nextCursor: z.string().max(512).nullable() });
export const adminOverviewSchema = z.object({
  viewerId: uuidSchema, asOf: instantSchema,
  flags: z.object({ awards: z.boolean(), settlement: z.boolean(), cashout: z.boolean(), spending: z.boolean() }),
  members: countSchema, pendingPaise: nonnegativePaiseSchema, availablePaise: paiseSchema,
  reservedPaise: nonnegativePaiseSchema, fraudOpen: countSchema, inboxDead: countSchema,
  outboxDead: countSchema, unknownCashouts: countSchema, walletDriftCount: countSchema,
  budgets: z.array(z.object({ track: z.string().max(40), availablePaise: nonnegativePaiseSchema })).max(10)
});
export const policyPageSchema = z.object({
  items: z.array(policySchema.extend({
    createdBy: uuidSchema.nullable(), createdAt: instantSchema, effectiveAt: instantSchema.nullable(),
    approvedBy: uuidSchema.nullable(), approvals: z.record(z.string(), z.unknown()),
    state: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "RETIRED"])
  })).max(50), activeRevision: countSchema, latestRevision: countSchema, latestActivatedRevision: countSchema
});
export const queuePageSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())).max(100), nextCursor: z.string().max(512).nullable()
});
export const inboxPageSchema = z.object({ items: z.array(z.record(z.string(), z.unknown())).max(100), nextId: uuidSchema.nullable() });
export const policyDraftSchema = z.object({
  expectedLatestRevision: countSchema, l1Bps: z.number().int().min(0).max(400), l2Bps: z.number().int().min(0).max(400), l3Bps: z.number().int().min(0).max(400),
  capBps: z.number().int().min(1).max(400), holdDays: z.number().int().min(1).max(365),
  minimumPaise: nonnegativePaiseSchema, customerBonusPaise: nonnegativePaiseSchema, inviteeDiscountPaise: nonnegativePaiseSchema,
  approvals: approvalsSchema
}).refine(value => value.l1Bps + value.l2Bps + value.l3Bps <= value.capBps, "The three rates must not exceed the cap");

export type ReferralOverview = z.infer<typeof overviewSchema>;
export type RewardPage = z.infer<typeof rewardPageSchema>;
export type CashoutPage = z.infer<typeof cashoutPageSchema>;
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type PolicyPage = z.infer<typeof policyPageSchema>;
export type PolicyDraft = z.infer<typeof policyDraftSchema>;
export type QueuePage = z.infer<typeof queuePageSchema>;

export function formatPaise(value: string): string {
  paiseSchema.parse(value);
  const signed = BigInt(value), negative = signed < BigInt(0), n = negative ? -signed : signed;
  return `${negative ? "-" : ""}₹${new Intl.NumberFormat("en-IN").format(n / BigInt(100))}.${(n % BigInt(100)).toString().padStart(2, "0")}`;
}
export function rupeesToPaise(value: string): string {
  if (!/^(0|[1-9]\d{0,16})(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter rupees with at most two decimal places and no commas.");
  const [whole, fraction = ""] = value.trim().split(".");
  return nonnegativePaiseSchema.parse((BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))).toString());
}
export function formatReferralTime(value: string): string {
  instantSchema.parse(value);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " IST";
}
export function safeReferralLink(value: string, expectedOrigin: string, code: string): string {
  codeSchema.parse(code);
  const url = new URL(value), origin = new URL(expectedOrigin);
  if (url.origin !== origin.origin || url.protocol !== "https:" || url.username || url.password || url.hash || url.searchParams.get("ref") !== code) throw new Error("Referral link could not be verified.");
  return url.href;
}
