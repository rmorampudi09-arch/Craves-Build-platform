import { parseCustomerOrder, type CustomerOrder } from "./order-contract";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["PAYMENT_PENDING", "PAID", "CANCELLED"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function optionalText(value: unknown, max: number): string | null {
  return value === null || value === undefined || value === "" ? null : text(value, max);
}

function money(value: unknown): number | null {
  const result = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(result) && result >= 0 && result <= 10_000_000 ? result : null;
}

function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
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
  if (!sourceAddressId || !UUID.test(sourceAddressId) || !recipientName || !contactPhoneNumber || !addressLine1 || !areaName || !city || !state || !postalCode) return null;
  return { sourceAddressId, recipientName, contactPhoneNumber, addressLine1, addressLine2: optionalText(raw.addressLine2, 250), landmark: optionalText(raw.landmark, 160), areaName, city, state, postalCode };
}

export function parseCheckout(value: unknown): CustomerCheckout | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.orders) || raw.orders.length > 100) return null;
  const id = text(raw.id, 64);
  const status = text(raw.status, 30);
  const currency = text(raw.currency, 3);
  const chargePolicyId = text(raw.chargePolicyId, 64);
  const deliveryAddressId = optionalText(raw.deliveryAddressId, 64);
  const createdAt = instant(raw.createdAt);
  const amounts = [raw.foodSubtotal, raw.platformFee, raw.taxAmount, raw.deliveryFee, raw.grandTotal].map(money);
  const orders = raw.orders.map(parseCustomerOrder);
  const deliveryAddress = raw.deliveryAddress == null ? null : parseAddress(raw.deliveryAddress);
  if (!id || !UUID.test(id) || !status || !STATUSES.has(status) || !currency || !chargePolicyId || !UUID.test(chargePolicyId) || (deliveryAddressId !== null && !UUID.test(deliveryAddressId)) || !createdAt || amounts.some(amount => amount === null) || orders.some(order => order === null) || (raw.deliveryAddress != null && !deliveryAddress)) return null;
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
    createdAt
  };
}

export function parseCheckoutInput(value: unknown): { deliveryAddressId: string; note: string | null } | null {
  const raw = record(value);
  if (!raw) return null;

  const deliveryAddressId = text(raw.deliveryAddressId, 64);
  if (!deliveryAddressId || !UUID.test(deliveryAddressId)) return null;

  let note: string | null = null;
  if (raw.note !== null && raw.note !== undefined) {
    if (typeof raw.note !== "string") return null;
    const normalizedNote = raw.note.trim();
    if (normalizedNote.length > 0) {
      if (normalizedNote.length > 500) return null;
      note = normalizedNote;
    }
  }

  return { deliveryAddressId, note };
}
