const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Offer = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: "FLAT" | "PERCENT";
  discountValue: number;
  maxDiscountAmount: number | null;
  minimumFoodSubtotal: number | null;
  currency: string;
  discountAmount: number;
  foodSubtotal: number;
  foodSubtotalAfterDiscount: number;
  startsAt: string | null;
  endsAt: string | null;
};

function finiteMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseOffer(value: unknown): Offer | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" || !UUID.test(raw.id) ||
    typeof raw.code !== "string" || raw.code.length < 2 || raw.code.length > 40 ||
    typeof raw.title !== "string" ||
    (raw.description !== null && typeof raw.description !== "string") ||
    (raw.discountType !== "FLAT" && raw.discountType !== "PERCENT") ||
    !finiteMoney(raw.discountValue) ||
    (raw.maxDiscountAmount !== null && !finiteMoney(raw.maxDiscountAmount)) ||
    (raw.minimumFoodSubtotal !== null && !finiteMoney(raw.minimumFoodSubtotal)) ||
    typeof raw.currency !== "string" || raw.currency.length !== 3 ||
    !finiteMoney(raw.discountAmount) || !finiteMoney(raw.foodSubtotal) || !finiteMoney(raw.foodSubtotalAfterDiscount) ||
    (raw.startsAt !== null && (typeof raw.startsAt !== "string" || !Number.isFinite(Date.parse(raw.startsAt)))) ||
    (raw.endsAt !== null && (typeof raw.endsAt !== "string" || !Number.isFinite(Date.parse(raw.endsAt))))
  ) return null;
  return raw as Offer;
}

export function parseOfferResponse(value: unknown): Offer | null {
  return parseOffer(value);
}

export function parseOfferList(value: unknown): Offer[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const offers = value.map(parseOffer);
  return offers.every((offer): offer is Offer => offer !== null) ? offers : null;
}
