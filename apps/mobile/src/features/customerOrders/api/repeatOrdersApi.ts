import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const REPEAT_ORDER_PAGE_SIZE = 20;
export const REPEAT_ORDER_MAX_PAGE_SIZE = 50;

const instantSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)));
const decimalSchema = z
  .union([z.number().finite().nonnegative(), z.string().regex(/^\d+(?:\.\d+)?$/)])
  .transform(value => String(value));

const repeatOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  itemName: z.string().trim().min(1).max(240),
  quantity: z.number().int().min(1).max(100),
});

export const repeatOrderCandidateSchema = z.object({
  orderId: z.string().uuid(),
  kitchenId: z.string().uuid(),
  kitchenName: z.string().trim().min(1).max(240),
  lastOrderedAt: instantSchema,
  completedOrdersFromKitchen: z.number().int().min(1),
  items: z.array(repeatOrderItemSchema).min(1).max(100),
  previousOrderTotal: decimalSchema,
  previousOrderCurrency: z.string().regex(/^[A-Z]{3}$/),
  orderLikeLastTimeAvailable: z.literal(true),
  preferenceRecallSupported: z.boolean(),
  rememberedPreferenceCount: z.number().int().nonnegative(),
  currentValidationNotice: z.string().trim().min(1).max(500),
});

const repeatOrderPageSchema = z.object({
  items: z.array(repeatOrderCandidateSchema).max(REPEAT_ORDER_MAX_PAGE_SIZE),
  nextCursor: z.string().min(1).nullable(),
  hasMore: z.boolean(),
});

export type RepeatOrderCandidate = z.infer<typeof repeatOrderCandidateSchema>;
export type RepeatOrderPage = z.infer<typeof repeatOrderPageSchema>;

function cursorSuffix(cursor?: string | null): string {
  return cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
}

export const repeatOrdersApi = {
  async list(cursor?: string | null, signal?: AbortSignal): Promise<RepeatOrderPage> {
    const response = await httpClient.get<unknown>(
      `/api/v1/orders/repeat-candidates?limit=${REPEAT_ORDER_PAGE_SIZE}${cursorSuffix(cursor)}`,
      {signal, dedupeKey: `repeat-orders:${cursor ?? 'first'}`},
    );
    const parsed = repeatOrderPageSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error('Order Like Last Time returned an unsupported response.');
    }
    if (parsed.data.hasMore !== Boolean(parsed.data.nextCursor)) {
      throw new Error('Order Like Last Time pagination could not be verified.');
    }
    return parsed.data;
  },
};
