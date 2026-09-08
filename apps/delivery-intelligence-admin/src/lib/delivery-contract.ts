export type DeliveryMetrics = {
  commandCount: number;
  completedCommandCount: number;
  deliveryJobCount: number;
  deliveredCount: number;
  activeDeliveryCount: number;
  recoveryCommandCount: number;
  attentionCount: number;
};

export type HourlyActivity = {
  bucketStart: string;
  commandCount: number;
  deliveryEventCount: number;
  deliveredCount: number;
};

export type ProviderShare = {
  providerId: string;
  displayName: string;
  selectionCount: number;
  percentage: number;
};

export type RecoveryHealth = {
  retriedCommandCount: number;
  reconciliationCount: number;
  providerWaitCount: number;
  webhookDeadLetterCount: number;
  trackingDeadLetterCount: number;
};

export type ActivityItem = {
  activityId: string;
  orderId: string | null;
  chefSubOrderId: string | null;
  providerId: string | null;
  activityType: string;
  status: string | null;
  detail: string;
  occurredAt: string;
  attention: boolean;
};

export type AttentionItem = {
  referenceId: string;
  orderId: string | null;
  providerId: string | null;
  kind: string;
  status: string;
  occurredAt: string;
  errorRecorded: boolean;
};

export type DeliveryOverview = {
  generatedAt: string;
  windowHours: number;
  metrics: DeliveryMetrics;
  hourlyActivity: HourlyActivity[];
  providerShare: ProviderShare[];
  recoveryHealth: RecoveryHealth;
  recentActivity: ActivityItem[];
  attentionQueue: AttentionItem[];
};

export type DeliveryCommandEvidence = {
  commandId: string;
  orderId: string;
  chefSubOrderId: string;
  commandType: string;
  status: string;
  readyAt: string | null;
  dispatchAt: string;
  attemptCount: number;
  providerWaitAttemptCount: number;
  reconciliationAttemptCount: number;
  idempotencyKey: string;
  providerWaitStartedAt: string | null;
  nextProviderRetryAt: string | null;
  reconciliationProviderId: string | null;
  reconciliationClientReference: string | null;
  reconciliationStartedAt: string | null;
  nextReconciliationAt: string | null;
  errorRecorded: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryJobEvidence = {
  deliveryJobId: string;
  orderId: string;
  chefSubOrderId: string;
  assignmentId: string | null;
  providerId: string;
  providerDeliveryId: string | null;
  providerQuoteId: string | null;
  assignedAgentId: string | null;
  status: string;
  providerStatus: string | null;
  bookedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  lastStatusObservedAt: string | null;
  lastStatusSource: string | null;
  trackingAttemptCount: number;
  trackingDeadLetteredAt: string | null;
  trackingErrorRecorded: boolean;
  courierLatitude: number | null;
  courierLongitude: number | null;
  courierLocationObservedAt: string | null;
  estimatedPickupStartAt: string | null;
  estimatedPickupEndAt: string | null;
  estimatedDropoffStartAt: string | null;
  estimatedDropoffEndAt: string | null;
  telemetryObservedAt: string | null;
  telemetrySource: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssignmentEvidence = {
  assignmentId: string;
  strategy: string;
  status: string;
  scoringVersion: string;
  selectedCandidateId: string | null;
  selectedProviderId: string | null;
  selectedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateEvidence = {
  candidateId: string;
  providerId: string;
  providerQuoteId: string | null;
  agentId: string | null;
  candidateRank: number;
  pickupDistanceKm: number | null;
  pickupEtaMinutes: number | null;
  quotedCost: number | null;
  currency: string | null;
  predictedSuccessProbability: number;
  combinedScore: number;
  liveAvg: number | null;
  storedAvg: number;
  momentum: string;
  providerQualityScore: number;
  proximityScore: number;
  finalScore: number;
  status: string;
  createdAt: string;
};

export type DeliveryEventEvidence = {
  eventId: string;
  providerId: string;
  providerEventId: string | null;
  eventType: string;
  normalizedStatus: string | null;
  providerStatus: string | null;
  source: string;
  applied: boolean;
  ignoredReason: string | null;
  occurredAt: string;
  createdAt: string;
};

export type WebhookEvidence = {
  webhookId: string;
  providerId: string;
  providerEventId: string | null;
  processingStatus: string;
  normalizedStatus: string | null;
  processingResult: string | null;
  attemptCount: number;
  errorRecorded: boolean;
  receivedAt: string;
  processedAt: string | null;
};

export type DeliveryUnitEvidence = {
  chefSubOrderId: string;
  command: DeliveryCommandEvidence | null;
  job: DeliveryJobEvidence | null;
  assignment: AssignmentEvidence | null;
  candidates: CandidateEvidence[];
  events: DeliveryEventEvidence[];
  webhooks: WebhookEvidence[];
};

export type OrderInvestigation = {
  requestCorrelationId: string;
  resolvedReference: string;
  orderId: string;
  units: DeliveryUnitEvidence[];
};
