import { z } from "zod";

export const reviewStatuses = ["PENDING_MODERATION", "PUBLISHED", "HIDDEN", "REJECTED"] as const;
export const reviewStatusSchema = z.enum(reviewStatuses);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export const moderationActions = ["PUBLISH", "HIDE", "REJECT"] as const;
export type ModerationAction = typeof moderationActions[number];
export const REVIEW_PAGE_SIZE = 25;

const rating = z.number().int().min(1).max(5).nullish();
const instant = z.string().max(64).nullish();
// Order Service's CustomerReviewView; fields the page does not use (media, helpful count) are dropped.
export const adminReviewSchema = z.object({
  reviewId: z.string().uuid(), orderId: z.string().uuid(), kitchenId: z.string().uuid(),
  status: reviewStatusSchema, version: z.number().int(),
  overallRating: rating, foodTasteRating: rating, portionValueRating: rating, packagingRating: rating,
  accuracyRating: rating, chefPreparationRating: rating, deliveryRating: rating,
  reviewText: z.string().max(2000).nullish(), tagCodes: z.array(z.string().max(64)).max(20).nullish(),
  submittedAt: instant, updatedAt: instant, publishedAt: instant,
});
export type AdminReview = z.infer<typeof adminReviewSchema>;
export const backendReviewPageSchema = z.object({
  items: z.array(adminReviewSchema).max(100), nextCursor: z.string().max(500).nullish(), hasMore: z.boolean(),
});
export const reviewPageSchema = backendReviewPageSchema.extend({ kitchenNames: z.record(z.string(), z.string().max(120)) });
export type ReviewPage = z.infer<typeof reviewPageSchema>;
export const kitchenListSchema = z.object({
  kitchens: z.array(z.object({ id: z.string().uuid(), kitchenName: z.string().nullish(), displayName: z.string().nullish() })).max(500),
});

// The reason travels in the X-Admin-Reason header, so it must be printable ASCII; Order Service wants 10 to 500 characters.
export const moderationRequestSchema = z.object({
  action: z.enum(moderationActions),
  reason: z.string().trim().min(10).max(500).regex(/^[\x20-\x7E]+$/),
}).strict();

const CURSOR = /^[A-Za-z0-9_\-=.:+/]{1,500}$/;

/** The only Order Service calls the admin page may make, or null for anything else. */
export function reviewTarget(method: string, path: string[], search: URLSearchParams): string | null {
  if (method === "GET" && path.length === 0) {
    const status = search.get("status"), cursor = search.get("cursor");
    if (status !== null && !reviewStatusSchema.safeParse(status).success) return null;
    if (cursor !== null && !CURSOR.test(cursor)) return null;
    const query = new URLSearchParams({ limit: String(REVIEW_PAGE_SIZE) });
    if (status) query.set("status", status);
    if (cursor) query.set("cursor", cursor);
    return `/admin/reviews?${query}`;
  }
  if (method === "PUT" && path.length === 2 && path[1] === "moderation" && z.string().uuid().safeParse(path[0]).success) {
    return `/admin/reviews/${path[0]}/moderation`;
  }
  return null;
}
