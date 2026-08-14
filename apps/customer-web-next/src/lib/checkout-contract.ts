import { parseCustomerOrder, type CustomerOrder } from "./order-contract.ts";

export type CheckoutAddressSnapshot = {
  sourceAddressId: string;
  recipientName: string;
  contactPhoneNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string;
  city: string;
  state: string;
  postalCode: string;
};

export type CustomerCheckout = {
  id: string;
  status: "PAYMENT_PENDING" | "PAID" | "CANCELLED";
  currency: string;
  foodSubtotal: number;
  platformFee: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  chargePolicyId: string;
  deliveryAddressId: string | null;
  deliveryAddress: CheckoutAddressSnapshot | null;
  orders: CustomerOrder[];
  createdAt: string;
};

export type CheckoutTaxBreakdown = {
  profileVersion: string;
  restaurantGstPercent: number;
  feeInclusiveGstPercent: number;
  foodTaxAdded: number;
  platformTaxIncluded: number;
  deliveryTaxIncluded: number;
  taxAmountAddedToCheckout: number;
  totalTaxAmount: number;
};

export type KitchenDeliveryQuote = {
  kitchenId: string;
  kitchenName: string;
  roadDistanceKm: number;
  roadDistanceMeters: number;
  estimatedTravelMinutes: number;
  baseDistanceKm: number;
  baseDeliveryFee: number;
  extraDistanceKm: number;
  extraPerKm: number;
  extraDistanceFee: number;
  deliveryFee: number;
  pricingVersion: string;
};

export type CustomerCheckoutQuote = {
  quoteId: string;
  deliveryAddressId: string;
  currency: string;
  foodSubtotal: number;
  platformFee: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  chargePolicyId: string;
  taxes: CheckoutTaxBreakdown;
  deliveries: KitchenDeliveryQuote[];
  expiresAt: string;
  createdAt: string;
};

const RESOURCE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSTGRES_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["PAYMENT_PENDING", "PAID", "CANCELLED"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function money(value: unknown): number | null {
  const result =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(result) && result >= 0 && result <= 10_000_000
    ? result
    : null;
}

function nonNegativeNumber(value: unknown, max = 10_000_000): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

function dateTime(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function parseAddress(value: unknown): CheckoutAddressSnapshot | null {
  const raw = record(value);
  if (!raw) return null;
  const sourceAddressId = text(raw.sourceAddressId, 64);
  const recipientName = text(raw.recipientName, 160);
  const contactPhoneNumber = text(raw.contactPhoneNumber, 16);
  const addressLine1 = text(raw.addressLine1, 250);
  const areaName = text(raw.areaName, 120);
  const city = text(raw.city, 120);
  const state = text(raw.state, 120);
  const postalCode = text(raw.postalCode, 20);
  return sourceAddressId &&
    RESOURCE_UUID.test(sourceAddressId) &&
    recipientName &&
    contactPhoneNumber &&
    addressLine1 &&
    areaName &&
    city &&
    state &&
    postalCode
    ? {
        sourceAddressId,
        recipientName,
        contactPhoneNumber,
        addressLine1,
        addressLine2: text(raw.addressLine2, 250),
        landmark: text(raw.landmark, 160),
        areaName,
        city,
        state,
        postalCode,
      }
    : null;
}

export function parseCheckout(value: unknown): CustomerCheckout | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.orders) || raw.orders.length > 100) return null;
  const id = text(raw.id, 64);
  const status = text(raw.status, 30);
  const currency = text(raw.currency, 3);
  const chargePolicyId = text(raw.chargePolicyId, 64);
  const deliveryAddressId =
    raw.deliveryAddressId == null ? null : text(raw.deliveryAddressId, 64);
  const createdAt = dateTime(raw.createdAt);
  const amounts = [
    raw.foodSubtotal,
    raw.platformFee,
    raw.taxAmount,
    raw.deliveryFee,
    raw.grandTotal,
  ].map(money);
  const orders = raw.orders.map(parseCustomerOrder);
  const deliveryAddress =
    raw.deliveryAddress == null ? null : parseAddress(raw.deliveryAddress);
  if (
    !id ||
    !RESOURCE_UUID.test(id) ||
    !status ||
    !STATUSES.has(status) ||
    !currency ||
    !chargePolicyId ||
    !POSTGRES_UUID.test(chargePolicyId) ||
    (deliveryAddressId && !RESOURCE_UUID.test(deliveryAddressId)) ||
    !createdAt ||
    amounts.some((amount) => amount === null) ||
    orders.some((order) => order === null) ||
    (raw.deliveryAddress != null && !deliveryAddress)
  )
    return null;
  return {
    id,
    status: status as CustomerCheckout["status"],
    currency: currency.toUpperCase(),
    foodSubtotal: amounts[0]!,
    platformFee: amounts[1]!,
    taxAmount: amounts[2]!,
    deliveryFee: amounts[3]!,
    grandTotal: amounts[4]!,
    chargePolicyId,
    deliveryAddressId,
    deliveryAddress,
    orders: orders as CustomerOrder[],
    createdAt,
  };
}

function parseTaxes(value: unknown): CheckoutTaxBreakdown | null {
  const raw = record(value);
  if (!raw) return null;
  const profileVersion = text(raw.profileVersion, 80);
  const values = [
    raw.restaurantGstPercent,
    raw.feeInclusiveGstPercent,
    raw.foodTaxAdded,
    raw.platformTaxIncluded,
    raw.deliveryTaxIncluded,
    raw.taxAmountAddedToCheckout,
    raw.totalTaxAmount,
  ].map(nonNegativeNumber);
  if (!profileVersion || values.some((entry) => entry === null)) return null;
  return {
    profileVersion,
    restaurantGstPercent: values[0]!,
    feeInclusiveGstPercent: values[1]!,
    foodTaxAdded: values[2]!,
    platformTaxIncluded: values[3]!,
    deliveryTaxIncluded: values[4]!,
    taxAmountAddedToCheckout: values[5]!,
    totalTaxAmount: values[6]!,
  };
}

function parseDelivery(value: unknown): KitchenDeliveryQuote | null {
  const raw = record(value);
  if (!raw) return null;
  const kitchenId = text(raw.kitchenId, 64);
  const kitchenName = text(raw.kitchenName, 160);
  const pricingVersion = text(raw.pricingVersion, 80);
  const values = [
    raw.roadDistanceKm,
    raw.roadDistanceMeters,
    raw.estimatedTravelMinutes,
    raw.baseDistanceKm,
    raw.baseDeliveryFee,
    raw.extraDistanceKm,
    raw.extraPerKm,
    raw.extraDistanceFee,
    raw.deliveryFee,
  ].map(nonNegativeNumber);
  if (
    !kitchenId ||
    !RESOURCE_UUID.test(kitchenId) ||
    !kitchenName ||
    !pricingVersion ||
    values.some((entry) => entry === null)
  )
    return null;
  return {
    kitchenId,
    kitchenName,
    roadDistanceKm: values[0]!,
    roadDistanceMeters: values[1]!,
    estimatedTravelMinutes: values[2]!,
    baseDistanceKm: values[3]!,
    baseDeliveryFee: values[4]!,
    extraDistanceKm: values[5]!,
    extraPerKm: values[6]!,
    extraDistanceFee: values[7]!,
    deliveryFee: values[8]!,
    pricingVersion,
  };
}

export function parseCheckoutQuote(value: unknown): CustomerCheckoutQuote | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.deliveries) || raw.deliveries.length > 100) return null;
  const quoteId = text(raw.quoteId, 64);
  const deliveryAddressId = text(raw.deliveryAddressId, 64);
  const currency = text(raw.currency, 3);
  const chargePolicyId = text(raw.chargePolicyId, 64);
  const expiresAt = dateTime(raw.expiresAt);
  const createdAt = dateTime(raw.createdAt);
  const amounts = [
    raw.foodSubtotal,
    raw.platformFee,
    raw.taxAmount,
    raw.deliveryFee,
    raw.grandTotal,
  ].map(money);
  const taxes = parseTaxes(raw.taxes);
  const deliveries = raw.deliveries.map(parseDelivery);
  if (
    !quoteId ||
    !RESOURCE_UUID.test(quoteId) ||
    !deliveryAddressId ||
    !RESOURCE_UUID.test(deliveryAddressId) ||
    !currency ||
    !chargePolicyId ||
    !POSTGRES_UUID.test(chargePolicyId) ||
    !expiresAt ||
    !createdAt ||
    amounts.some((entry) => entry === null) ||
    !taxes ||
    deliveries.some((entry) => entry === null)
  )
    return null;
  return {
    quoteId,
    deliveryAddressId,
    currency: currency.toUpperCase(),
    foodSubtotal: amounts[0]!,
    platformFee: amounts[1]!,
    taxAmount: amounts[2]!,
    deliveryFee: amounts[3]!,
    grandTotal: amounts[4]!,
    chargePolicyId,
    taxes,
    deliveries: deliveries as KitchenDeliveryQuote[],
    expiresAt,
    createdAt,
  };
}

export function parseCheckoutQuoteInput(value: unknown): { deliveryAddressId: string } | null {
  const raw = record(value);
  const deliveryAddressId = raw ? text(raw.deliveryAddressId, 64) : null;
  return deliveryAddressId && RESOURCE_UUID.test(deliveryAddressId)
    ? { deliveryAddressId }
    : null;
}

export function parseCheckoutInput(
  value: unknown,
): { deliveryAddressId: string; pricingQuoteId: string | null; note: string | null } | null {
  const raw = record(value);
  if (!raw) return null;
  const deliveryAddressId = text(raw.deliveryAddressId, 64);
  const pricingQuoteId = raw.pricingQuoteId == null ? null : text(raw.pricingQuoteId, 64);
  if (!deliveryAddressId || !RESOURCE_UUID.test(deliveryAddressId)) return null;
  if (pricingQuoteId && !RESOURCE_UUID.test(pricingQuoteId)) return null;
  if (raw.note != null && typeof raw.note !== "string") return null;
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null;
  return note && note.length > 500
    ? null
    : { deliveryAddressId, pricingQuoteId, note };
}
