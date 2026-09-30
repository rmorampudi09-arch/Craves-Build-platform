export type KitchenReviewSummary = {
  kitchenId: string;
  reviewCount: number;
  overallAverage: number | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseKitchenReviewSummary(
  value: unknown,
): KitchenReviewSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  if (
    typeof raw.kitchenId !== "string" ||
    !UUID.test(raw.kitchenId) ||
    typeof raw.reviewCount !== "number" ||
    !Number.isSafeInteger(raw.reviewCount) ||
    raw.reviewCount < 0
  ) {
    return null;
  }

  let overallAverage: number | null = null;
  if (raw.overallAverage !== null && raw.overallAverage !== undefined) {
    if (
      typeof raw.overallAverage !== "number" ||
      !Number.isFinite(raw.overallAverage) ||
      raw.overallAverage < 1 ||
      raw.overallAverage > 5
    ) {
      return null;
    }
    overallAverage = raw.overallAverage;
  }

  if (raw.reviewCount === 0 && overallAverage !== null) return null;
  if (raw.reviewCount > 0 && overallAverage === null) return null;

  return {
    kitchenId: raw.kitchenId,
    reviewCount: raw.reviewCount,
    overallAverage,
  };
}
