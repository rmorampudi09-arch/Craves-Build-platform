import {z} from 'zod';
import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';

const uuid = z.string().uuid();
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().refine(value => !Number.isNaN(Date.parse(value)));
const moneyValue = z.union([z.string(), z.number()]).transform(value => String(value));

export const publicSubscriptionPlanSchema = z.object({
  id: uuid,
  planCode: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional().transform(value => value ?? null),
  billingPeriod: z.string().min(1).max(80),
  amount: moneyValue,
  currency: z.string().length(3),
});

export type PublicSubscriptionPlan = z.infer<typeof publicSubscriptionPlanSchema>;

const publicScheduleItemSchema = z.object({
  menuItemId: uuid,
  menuItemName: z.string().min(1).max(200),
  menuItemCategory: z.string().max(120).nullable().optional().transform(value => value ?? null),
  menuItemFoodType: z.string().max(40).nullable().optional().transform(value => value ?? null),
  menuItemPrice: moneyValue,
  menuItemCurrency: z.string().length(3),
  quantity: z.number().int().positive(),
  isoDayOfWeek: z.number().int().min(1).max(7).nullable().optional().transform(value => value ?? null),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional().transform(value => value ?? null),
  mealSlotCode: z.string().min(1).max(40),
  serviceTime: z.string().min(1).max(20),
  sequenceNumber: z.number().int().positive(),
});

export const publicPlanScheduleSchema = z.object({
  planId: uuid,
  recurrenceType: z.string().min(1).max(80),
  timezone: z.string().min(1).max(80),
  items: z.array(publicScheduleItemSchema).max(100),
});

export type PublicPlanSchedule = z.infer<typeof publicPlanScheduleSchema>;

export const customerSubscriptionSchema = z.object({
  id: uuid,
  planId: uuid,
  status: z.string().min(1).max(60),
  startDate: localDate,
  endDate: localDate.nullable().optional().transform(value => value ?? null),
  nextServiceDate: localDate.nullable().optional().transform(value => value ?? null),
  deliveryAddressId: uuid,
  notes: z.string().max(2000).nullable().optional().transform(value => value ?? null),
  createdAt: instant,
  updatedAt: instant,
});

export type CustomerSubscription = z.infer<typeof customerSubscriptionSchema>;

const occurrenceItemSchema = z.object({
  menuItemId: uuid,
  quantity: z.number().int().positive(),
  sequenceNumber: z.number().int().positive(),
});

export const customerSubscriptionOccurrenceSchema = z.object({
  id: uuid,
  serviceDate: localDate,
  mealSlotCode: z.string().min(1).max(40),
  serviceAt: instant,
  status: z.string().min(1).max(60),
  items: z.array(occurrenceItemSchema).max(100),
});

export type CustomerSubscriptionOccurrence = z.infer<
  typeof customerSubscriptionOccurrenceSchema
>;

export interface CreateCustomerSubscriptionRequest {
  planId: string;
  startDate: string;
  deliveryAddressId: string;
  notes?: string | null;
}

function contractError(scope: string): AppApiError {
  return new AppApiError(
    'CUSTOMER_SUBSCRIPTION_INVALID_RESPONSE',
    `${scope} returned information that could not be verified. Please refresh and try again.`,
  );
}

function parseOne<T>(schema: z.ZodType<T>, value: unknown, scope: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw contractError(scope);
  return parsed.data;
}

function parseMany<T>(schema: z.ZodType<T>, value: unknown, scope: string): T[] {
  const parsed = z.array(schema).max(500).safeParse(value);
  if (!parsed.success) throw contractError(scope);
  return parsed.data;
}

function requireUuid(value: string, label: string): void {
  if (!uuid.safeParse(value).success) {
    throw new AppApiError('CUSTOMER_SUBSCRIPTION_INVALID_ID', `${label} is not valid.`);
  }
}

function requireDate(value: string, label: string): void {
  if (!localDate.safeParse(value).success) {
    throw new AppApiError('CUSTOMER_SUBSCRIPTION_INVALID_DATE', `${label} is not valid.`);
  }
}

export const customerSubscriptionApi = {
  async listPlans(signal?: AbortSignal): Promise<PublicSubscriptionPlan[]> {
    const response = await httpClient.get<unknown>('/api/v1/subscriptions/plans', {
      signal,
      dedupeKey: 'customer-subscription:plans',
    });
    return parseMany(publicSubscriptionPlanSchema, response, 'Meal plans');
  },

  async getPlan(planId: string, signal?: AbortSignal): Promise<PublicSubscriptionPlan> {
    requireUuid(planId, 'Meal plan');
    const response = await httpClient.get<unknown>(
      `/api/v1/subscriptions/plans/${encodeURIComponent(planId)}`,
      {signal, dedupeKey: `customer-subscription:plan:${planId}`},
    );
    return parseOne(publicSubscriptionPlanSchema, response, 'Meal plan');
  },

  async getPlanSchedule(planId: string, signal?: AbortSignal): Promise<PublicPlanSchedule> {
    requireUuid(planId, 'Meal plan');
    const response = await httpClient.get<unknown>(
      `/api/v1/subscriptions/plans/${encodeURIComponent(planId)}/schedule`,
      {signal, dedupeKey: `customer-subscription:schedule:${planId}`},
    );
    return parseOne(publicPlanScheduleSchema, response, 'Meal-plan schedule');
  },

  async listMine(signal?: AbortSignal): Promise<CustomerSubscription[]> {
    const response = await httpClient.get<unknown>('/api/v1/subscriptions', {
      signal,
      dedupeKey: 'customer-subscription:mine',
    });
    return parseMany(customerSubscriptionSchema, response, 'Subscriptions');
  },

  async getMine(subscriptionId: string, signal?: AbortSignal): Promise<CustomerSubscription> {
    requireUuid(subscriptionId, 'Subscription');
    const response = await httpClient.get<unknown>(
      `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {signal, dedupeKey: `customer-subscription:${subscriptionId}`},
    );
    return parseOne(customerSubscriptionSchema, response, 'Subscription');
  },

  async create(
    request: CreateCustomerSubscriptionRequest,
    idempotencyKey: string,
  ): Promise<CustomerSubscription> {
    requireUuid(request.planId, 'Meal plan');
    requireUuid(request.deliveryAddressId, 'Delivery address');
    requireDate(request.startDate, 'Start date');
    if (!idempotencyKey.trim()) {
      throw new AppApiError('CUSTOMER_SUBSCRIPTION_IDEMPOTENCY_REQUIRED', 'Please retry the subscription request.');
    }
    const response = await httpClient.post<unknown>(
      '/api/v1/subscriptions',
      request.notes?.trim()
        ? {...request, notes: request.notes.trim()}
        : {planId: request.planId, startDate: request.startDate, deliveryAddressId: request.deliveryAddressId},
      {headers: {'Idempotency-Key': idempotencyKey}},
    );
    return parseOne(customerSubscriptionSchema, response, 'Created subscription');
  },

  async listOccurrences(
    subscriptionId: string,
    signal?: AbortSignal,
  ): Promise<CustomerSubscriptionOccurrence[]> {
    requireUuid(subscriptionId, 'Subscription');
    const response = await httpClient.get<unknown>(
      `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/occurrences`,
      {params: {limit: 100}, signal, dedupeKey: `customer-subscription:occurrences:${subscriptionId}`},
    );
    return parseMany(customerSubscriptionOccurrenceSchema, response, 'Subscription occurrences');
  },

  async pause(subscriptionId: string, reason?: string): Promise<CustomerSubscription> {
    requireUuid(subscriptionId, 'Subscription');
    const response = await httpClient.patch<unknown>(
      `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/pause`,
      reason?.trim() ? {reason: reason.trim()} : undefined,
    );
    return parseOne(customerSubscriptionSchema, response, 'Paused subscription');
  },

  async resume(
    subscriptionId: string,
    resumeDate: string,
    reason?: string,
  ): Promise<CustomerSubscription> {
    requireUuid(subscriptionId, 'Subscription');
    requireDate(resumeDate, 'Resume date');
    const response = await httpClient.patch<unknown>(
      `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
      reason?.trim() ? {resumeDate, reason: reason.trim()} : {resumeDate},
    );
    return parseOne(customerSubscriptionSchema, response, 'Resumed subscription');
  },

  async cancel(subscriptionId: string, reason?: string): Promise<CustomerSubscription> {
    requireUuid(subscriptionId, 'Subscription');
    const response = await httpClient.patch<unknown>(
      `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      reason?.trim() ? {reason: reason.trim()} : undefined,
    );
    return parseOne(customerSubscriptionSchema, response, 'Cancelled subscription');
  },

  async skip(
    subscriptionId: string,
    serviceDate: string,
    reason?: string,
  ): Promise<void> {
    requireUuid(subscriptionId, 'Subscription');
    requireDate(serviceDate, 'Service date');
    await httpClient.post<unknown>(
      `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/skips`,
      reason?.trim() ? {serviceDate, reason: reason.trim()} : {serviceDate},
    );
  },
};
