export type OrderReview = {
  id: string;
  orderId: string;
  rating: number;
  reviewTitle: string | null;
  reviewBody: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrderReviewRequest = {
  rating: number;
  reviewTitle?: string;
  reviewBody?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseOrderReview(value: unknown): OrderReview | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64);
  const orderId = text(raw.orderId, 64);
  const createdAt = instant(raw.createdAt);
  const updatedAt = instant(raw.updatedAt);
  const rating = typeof raw.rating === "number" ? raw.rating : Number.NaN;
  if (!id || !UUID.test(id) || !orderId || !UUID.test(orderId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !createdAt || !updatedAt) {
    return null;
  }
  return {
    id,
    orderId,
    rating,
    reviewTitle: text(raw.reviewTitle, 120),
    reviewBody: text(raw.reviewBody, 1000),
    createdAt,
    updatedAt,
  };
}
