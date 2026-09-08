import { z } from "zod";

const iso = z.string().datetime({ offset: true });
const uuid = z.string().uuid();
const numberOrNull = z.number().nullable();
const moneyOrNull = z.union([z.number(), z.string()]).nullable().transform(value => value === null ? null : Number(value));

export const deliverySummarySchema = z.object({
  generatedAt: iso,
  windowHours: z.number().int().min(1).max(720),
  metrics: z.object({
    assignments: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    fallbacks: z.number().int().nonnegative(),
    deadLetters: z.number().int().nonnegative(),
    webhookFailures: z.number().int().nonnegative()
  }),
  trend: z.array(z.object({
    day: z.string(), assignments: z.number().int().nonnegative(), delivered: z.number().int().nonnegative()
  })).max(32),
  providers: z.array(z.object({
    providerId: z.string().max(80), displayName: z.string().max(160), active: z.boolean(),
    selections: z.number().int().nonnegative(), averageOutcomeScore: numberOrNull,
    outcomes: z.number().int().nonnegative(), storedAverageScore: numberOrNull,
    lifetimeOrderCount: z.number().int().nonnegative()
  })).max(30),
  recentDecisions: z.array(z.object({
    assignmentId: uuid, orderId: uuid, chefSubOrderId: uuid, strategy: z.string().max(30),
    assignmentStatus: z.string().max(30), scoringVersion: z.string().max(200),
    selectedProviderId: z.string().max(80).nullable(), selectedRank: z.number().int().positive().nullable(),
    finalScore: numberOrNull, pickupEtaMinutes: numberOrNull, quotedCost: moneyOrNull,
    currency: z.string().max(3).nullable(), candidateStatus: z.string().max(30).nullable(), createdAt: iso
  })).max(30),
  exceptions: z.array(z.object({
    commandId: uuid, orderId: uuid, chefSubOrderId: uuid, status: z.string().max(30),
    attemptCount: z.number().int().nonnegative(), lastError: z.string().max(500).nullable(), updatedAt: iso
  })).max(20)
});

const assignmentSchema = z.object({
  assignmentId: uuid, chefSubOrderId: uuid, orderId: uuid, strategy: z.string(), status: z.string(),
  scoringVersion: z.string(), selectedCandidateId: uuid.nullable(), selectedProviderId: z.string().nullable(),
  selectedAgentId: z.string().nullable(), createdAt: iso, updatedAt: iso
}).nullable();

const candidateSchema = z.object({
  candidateId: uuid, rank: z.number().int().positive(), providerId: z.string(), providerQuoteId: z.string().nullable(),
  agentId: z.string().nullable(), pickupDistanceKm: numberOrNull, pickupEtaMinutes: numberOrNull,
  quotedCost: moneyOrNull, currency: z.string().nullable(), predictedSuccessProbability: z.number(), combinedScore: z.number(),
  liveAverage: numberOrNull, storedAverage: z.number(), momentum: z.string(), explorationSample: z.number(),
  providerQualityScore: z.number(), proximityScore: z.number(), finalScore: z.number(), status: z.string(),
  createdAt: iso, updatedAt: iso
});

const commandSchema = z.object({
  commandId: uuid, chefSubOrderId: uuid, commandType: z.string(), status: z.string(), readyAt: iso.nullable(),
  dispatchAt: iso, attemptCount: z.number().int().nonnegative(), reconciliationProviderId: z.string().nullable(),
  reconciliationStartedAt: iso.nullable(), reconciliationAttemptCount: z.number().int().nonnegative(),
  nextReconciliationAt: iso.nullable(), lastError: z.string().nullable(), createdAt: iso, updatedAt: iso
});

const jobSchema = z.object({
  deliveryJobId: uuid, chefSubOrderId: uuid, assignmentId: uuid.nullable(), providerId: z.string(),
  providerDeliveryId: z.string().nullable(), providerQuoteId: z.string().nullable(), assignedAgentId: z.string().nullable(),
  status: z.string(), providerStatus: z.string().nullable(), trackingUrl: z.string().url().nullable(), bookedAt: iso.nullable(),
  pickedUpAt: iso.nullable(), deliveredAt: iso.nullable(), lastStatusObservedAt: iso.nullable(), lastStatusSource: z.string().nullable(),
  courierLatitude: moneyOrNull, courierLongitude: moneyOrNull, courierLocationObservedAt: iso.nullable(),
  estimatedPickupStartAt: iso.nullable(), estimatedPickupEndAt: iso.nullable(), estimatedDropoffStartAt: iso.nullable(),
  estimatedDropoffEndAt: iso.nullable(), telemetryObservedAt: iso.nullable(), telemetrySource: z.string().nullable(),
  createdAt: iso, updatedAt: iso
});

const eventSchema = z.object({
  eventId: uuid, deliveryJobId: uuid, providerId: z.string(), providerEventId: z.string().nullable(), eventType: z.string(),
  normalizedStatus: z.string().nullable(), occurredAt: iso, createdAt: iso
});

const outcomeSchema = z.object({
  deliveryId: uuid, chefSubOrderId: uuid, providerId: z.string(), compositeScore: z.number(), status: z.string(),
  distanceKm: z.number(), area: z.string(), occurredAt: iso
});

export const deliveryInvestigationSchema = z.object({
  orderId: uuid,
  exactCourierLocationAllowed: z.boolean(),
  assignment: assignmentSchema,
  candidates: z.array(candidateSchema).max(30),
  commands: z.array(commandSchema).max(30),
  jobs: z.array(jobSchema).max(30),
  events: z.array(eventSchema).max(200),
  outcomes: z.array(outcomeSchema).max(30)
});

export type DeliverySummary = z.infer<typeof deliverySummarySchema>;
export type DeliveryInvestigation = z.infer<typeof deliveryInvestigationSchema>;

export function parseDeliverySummary(value: unknown): DeliverySummary | null {
  const parsed = deliverySummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseDeliveryInvestigation(value: unknown): DeliveryInvestigation | null {
  const parsed = deliveryInvestigationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
