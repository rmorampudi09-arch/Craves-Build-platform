import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

const uuid = z.string().uuid();
const decimal = z.union([z.string(), z.number()]).transform(value => String(value));
const instant = z.string().nullable().optional().transform(value => value ?? null);

export const chefMealPlanSchema = z.object({
  id: uuid,
  planCode: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional().transform(value => value ?? null),
  billingPeriod: z.enum(['WEEKLY', 'MONTHLY']),
  amount: decimal,
  currency: z.string().length(3),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'INACTIVE']),
  reviewReason: z.string().nullable().optional().transform(value => value ?? null),
  submittedAt: instant,
  reviewedAt: instant,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChefMealPlan = z.infer<typeof chefMealPlanSchema>;

const scheduleItemSchema = z.object({
  id: uuid,
  menuItemId: uuid,
  menuItemName: z.string(),
  menuItemCategory: z.string().nullable().optional().transform(value => value ?? null),
  menuItemFoodType: z.string().nullable().optional().transform(value => value ?? null),
  menuItemPrice: decimal,
  menuItemCurrency: z.string().length(3),
  quantity: z.number().int().positive(),
  isoDayOfWeek: z.number().int().min(1).max(7).nullable().optional().transform(value => value ?? null),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional().transform(value => value ?? null),
  mealSlotCode: z.string(),
  serviceTime: z.string(),
  sequenceNumber: z.number().int().positive(),
});

export const chefMealScheduleSchema = z.object({
  planId: uuid,
  recurrenceType: z.enum(['WEEKLY', 'MONTHLY']),
  timezone: z.string(),
  serviceTime: z.string().nullable().optional().transform(value => value ?? null),
  generationLeadHours: z.number().int().min(1).max(168),
  status: z.string(),
  version: z.number().int(),
  items: z.array(scheduleItemSchema).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
  activatedAt: z.string().nullable().optional().transform(value => value ?? null),
});
export type ChefMealSchedule = z.infer<typeof chefMealScheduleSchema>;

const slotRuleSchema = z.object({
  id: uuid,
  chefIdentityId: uuid,
  isoDayOfWeek: z.number().int().min(1).max(7),
  mealSlotCode: z.string(),
  totalCapacityUnits: z.number().int().nonnegative(),
  subscriptionCapacityUnits: z.number().int().nonnegative(),
  salesEnabled: z.boolean(),
  recurringReservedUnits: z.number().int().nonnegative(),
  recurringAvailableUnits: z.number().int(),
  recurringDeficitUnits: z.number().int().nonnegative(),
  version: z.number().int(),
  updatedAt: z.string(),
});

export const chefCapacitySummarySchema = z.object({
  chefIdentityId: uuid,
  adminSalesFrozen: z.boolean(),
  freezeReason: z.string().nullable().optional().transform(value => value ?? null),
  slotRules: z.array(slotRuleSchema).max(1000),
  menuItemRules: z.array(z.unknown()).max(1000),
  dateOverrides: z.array(z.unknown()).max(1000),
  menuItemDateOverrides: z.array(z.unknown()).max(1000),
  openIncidentCount: z.number().int().nonnegative(),
});
export type ChefCapacitySummary = z.infer<typeof chefCapacitySummarySchema>;

export interface ChefMealPlanInput {
  name: string;
  description: string | null;
  billingPeriod: 'WEEKLY' | 'MONTHLY';
  amount: number;
  currency: 'INR';
}

export interface ChefScheduleItemInput {
  menuItemId: string;
  quantity: number;
  isoDayOfWeek: number | null;
  dayOfMonth: number | null;
  mealSlotCode: string;
  serviceTime: string;
  sequenceNumber: number;
}

export interface PutChefScheduleRequest {
  recurrenceType: 'WEEKLY' | 'MONTHLY';
  timezone: string;
  generationLeadHours: number;
  items: ChefScheduleItemInput[];
}

function parseOne<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

export const chefSubscriptionApi = {
  async listPlans(signal?: AbortSignal): Promise<ChefMealPlan[]> {
    const response = await httpClient.get<unknown>('/api/v1/chef/subscription-plans', {
      signal,
      dedupeKey: 'chef-subscription:plans',
    });
    const parsed = z.array(chefMealPlanSchema).max(500).safeParse(response);
    if (!parsed.success) throw new Error('Chef meal plans returned an unsupported response.');
    return parsed.data;
  },
  async createPlan(input: ChefMealPlanInput): Promise<ChefMealPlan> {
    return parseOne(
      chefMealPlanSchema,
      await httpClient.post<unknown>('/api/v1/chef/subscription-plans', input),
      'Created meal plan could not be verified.',
    );
  },
  async updatePlan(planId: string, input: ChefMealPlanInput): Promise<ChefMealPlan> {
    return parseOne(
      chefMealPlanSchema,
      await httpClient.put<unknown>(`/api/v1/chef/subscription-plans/${encodeURIComponent(planId)}`, input),
      'Updated meal plan could not be verified.',
    );
  },
  async getSchedule(planId: string, signal?: AbortSignal): Promise<ChefMealSchedule> {
    return parseOne(
      chefMealScheduleSchema,
      await httpClient.get<unknown>(`/api/v1/chef/subscription-plans/${encodeURIComponent(planId)}/schedule`, {signal}),
      'Meal-plan schedule could not be verified.',
    );
  },
  async putSchedule(planId: string, request: PutChefScheduleRequest): Promise<ChefMealSchedule> {
    return parseOne(
      chefMealScheduleSchema,
      await httpClient.put<unknown>(`/api/v1/chef/subscription-plans/${encodeURIComponent(planId)}/schedule`, request),
      'Saved meal-plan schedule could not be verified.',
    );
  },
  async submit(planId: string, note?: string): Promise<ChefMealPlan> {
    return parseOne(
      chefMealPlanSchema,
      await httpClient.post<unknown>(`/api/v1/chef/subscription-plans/${encodeURIComponent(planId)}/submit`, note?.trim() ? {note: note.trim()} : undefined),
      'Submitted meal plan could not be verified.',
    );
  },
  async getCapacity(signal?: AbortSignal): Promise<ChefCapacitySummary> {
    return parseOne(
      chefCapacitySummarySchema,
      await httpClient.get<unknown>('/api/v1/chef/subscription-capacity', {signal, dedupeKey: 'chef-subscription:capacity'}),
      'Chef capacity could not be verified.',
    );
  },
  async putSlotRule(request: {
    isoDayOfWeek: number;
    mealSlotCode: string;
    totalCapacityUnits: number;
    subscriptionCapacityUnits: number;
    salesEnabled: boolean;
    reason: string;
  }): Promise<void> {
    await httpClient.put<unknown>('/api/v1/chef/subscription-capacity/rules/slots', request);
  },
};
