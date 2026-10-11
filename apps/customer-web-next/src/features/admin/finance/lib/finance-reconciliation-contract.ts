import { z } from "zod";
export const payoutReconcileRequestSchema = z.object({
  providerPayoutId: z.string().regex(/^pout_[A-Za-z0-9]{1,74}$/),
  reason: z.string().trim().min(1).max(1000),
}).strict();
export const payoutReconcileResponseSchema = z.object({
  instructionId: z.string().uuid(),
  status: z.enum(["RESERVED", "SUBMITTING", "PROCESSING", "UNKNOWN", "PAID", "FAILED", "REVERSED", "REVIEW_REQUIRED"]),
  providerStatus: z.string().max(40),
  notice: z.string().max(1000),
});
