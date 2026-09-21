import {
  parseKitchenReviewSummary,
  type KitchenReviewSummary,
} from "@/lib/review-summary-contract";

export async function loadKitchenReviewSummary(
  kitchenId: string,
): Promise<KitchenReviewSummary | null> {
  const response = await fetch(
    "/api/reviews/kitchens/" + encodeURIComponent(kitchenId) + "/summary",
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );

  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error("Kitchen reviews are temporarily unavailable.");
  }

  const parsed = parseKitchenReviewSummary(
    await response.json().catch(() => null),
  );
  if (!parsed || parsed.kitchenId !== kitchenId) {
    throw new Error("Craves returned an invalid kitchen review summary.");
  }
  return parsed;
}
