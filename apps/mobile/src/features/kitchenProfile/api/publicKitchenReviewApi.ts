import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

const kitchenIdSchema = z.string().uuid();

const publicKitchenReviewSummarySchema = z.object({
  kitchenId: z.string().uuid(),
  reviewCount: z.number().int().min(0),
  overallAverage: z.number().min(0).max(5).nullable(),
});

export type PublicKitchenReviewSummary = z.infer<
  typeof publicKitchenReviewSummarySchema
>;

function normalizeKitchenId(value: string): string {
  const parsed = kitchenIdSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error('kitchenId must be a valid UUID.');
  }
  return parsed.data;
}

export const publicKitchenReviewApi = {
  async getSummary(
    kitchenId: string,
    signal?: AbortSignal,
  ): Promise<PublicKitchenReviewSummary> {
    const normalizedId = normalizeKitchenId(kitchenId);
    const response = await httpClient.get<unknown>(
      `/api/v1/public/kitchens/${encodeURIComponent(
        normalizedId,
      )}/reviews/summary`,
      {
        signal,
        dedupeKey: `public-kitchen-review-summary:${normalizedId}`,
      },
    );
    const parsed = publicKitchenReviewSummarySchema.parse(response);
    if (parsed.kitchenId !== normalizedId) {
      throw new Error('Kitchen review summary identity does not match the request.');
    }
    return parsed;
  },
};
