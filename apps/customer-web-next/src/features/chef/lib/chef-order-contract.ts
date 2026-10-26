import { safeChefPhotoUrl } from "../../../shared/lib/chef-photo.ts";

export type ChefOrderStatus =
  | "PAYMENT_PENDING"
  | "PAID"
  | "CHEF_ACCEPTANCE_PENDING"
  | "CHEF_ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CHEF_REJECTED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "REFUND_FAILED";

export type ChefOrderItem = {
  id: string;
  menuItemId: string;
  itemName: string;
  category: string | null;
  foodType: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type ChefDeliveryAddress = {
  recipientName: string;
  contactPhoneNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string;
  /** Where the customer pinned the address; absent or null when the order has no pin. */
  latitude?: number | null;
  longitude?: number | null;
};

/** One step in the order's life, oldest first. Only the order's own page (GET /chef/orders/{id}) sends it. */
export type ChefOrderStatusStep = { status: ChefOrderStatus; at: string };

/** The courier the delivery provider assigned. photoUrl is https only. */
export type ChefDeliveryPartner = {
  name: string | null;
  phone: string | null;
  photoUrl: string | null;
  pickupEtaAt: string | null;
};

export type ChefOrder = {
  id: string;
  kitchenName: string | null;
  status: ChefOrderStatus;
  currency: string;
  foodSubtotal: number;
  platformFee: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  chefResponseNote: string | null;
  prepTimeMinutes: number | null;
  deliveryAddress: ChefDeliveryAddress | null;
  items: ChefOrderItem[];
  createdAt: string;
  updatedAt: string;
  /** The checkout the customer paid in; null for a meal-plan order, which has none. */
  checkoutId?: string | null;
  /** The server's deadline to accept or decline a new order. */
  chefAcceptanceExpiresAt?: string | null;
  /** What the customer wrote at checkout. */
  customerNote?: string | null;
  deliveryPartner?: ChefDeliveryPartner | null;
  /** Null until the chef hands the order over; absent when the server has no hand-over yet, so the button stays hidden. */
  chefHandedOverAt?: string | null;
  statusHistory?: ChefOrderStatusStep[];
};

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set<ChefOrderStatus>([
  "PAYMENT_PENDING",
  "PAID",
  "CHEF_ACCEPTANCE_PENDING",
  "CHEF_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CHEF_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_FAILED",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function optional(value: unknown, max: number): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : text(value, max);
}

function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function money(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10_000_000
    ? number
    : null;
}

function integer(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : null;
}

function parseItem(value: unknown): ChefOrderItem | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id, 64);
  const menuItemId = text(raw.menuItemId, 64);
  const itemName = text(raw.itemName, 180);
  const unitPrice = money(raw.unitPrice);
  const lineTotal = money(raw.lineTotal);
  const quantity = integer(raw.quantity, 1, 100);
  if (
    !isCanonicalUuid(id) ||
    !isCanonicalUuid(menuItemId) ||
    !itemName ||
    unitPrice === null ||
    lineTotal === null ||
    quantity === null
  ) {
    return null;
  }
  return {
    id,
    menuItemId,
    itemName,
    category: optional(raw.category, 80),
    foodType: optional(raw.foodType, 40),
    unitPrice,
    quantity,
    lineTotal,
  };
}

function parseAddress(value: unknown): ChefDeliveryAddress | null {
  const raw = record(value);
  if (!raw) return null;
  const recipientName = text(raw.recipientName, 160);
  const contactPhoneNumber = text(raw.contactPhoneNumber, 24);
  const addressLine1 = text(raw.addressLine1, 250);
  const city = text(raw.city, 120);
  const state = text(raw.state, 120);
  const postalCode = text(raw.postalCode, 20);
  if (
    !recipientName ||
    !contactPhoneNumber ||
    !addressLine1 ||
    !city ||
    !state ||
    !postalCode
  ) {
    return null;
  }
  // A pin is kept only as a whole and in range; anything else counts as no pin.
  const latitude = coordinate(raw.latitude, 90);
  const longitude = coordinate(raw.longitude, 180);
  const pinned = latitude !== null && longitude !== null;
  return {
    recipientName,
    contactPhoneNumber,
    addressLine1,
    addressLine2: optional(raw.addressLine2, 250),
    landmark: optional(raw.landmark, 160),
    areaName: optional(raw.areaName, 120),
    city,
    state,
    postalCode,
    ...(pinned ? { latitude, longitude } : {}),
  };
}

function coordinate(value: unknown, limit: number): number | null {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return value !== "" && Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function parseStatusHistory(value: unknown): ChefOrderStatusStep[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry) => {
    const raw = record(entry);
    const status = raw?.status;
    const at = instant(raw?.at);
    return isChefOrderStatus(status) && at ? [{ status, at }] : [];
  });
}

function parsePartner(value: unknown): ChefDeliveryPartner | null {
  const raw = record(value);
  return raw
    ? {
        name: optional(raw.name, 120),
        phone: optional(raw.phone, 40),
        photoUrl: safeChefPhotoUrl(raw.photoUrl),
        pickupEtaAt: instant(raw.pickupEtaAt),
      }
    : null;
}

export function parseChefOrder(value: unknown): ChefOrder | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id, 64);
  const status = text(raw.status, 40) as ChefOrderStatus | null;
  const currency = text(raw.currency, 3);
  const createdAt = instant(raw.createdAt);
  // Older Order Service rows can pre-date the updated_at backfill. Using the
  // creation timestamp preserves ordering without inventing a workflow event.
  const updatedAt = instant(raw.updatedAt) ?? createdAt;
  const amounts = [
    raw.foodSubtotal,
    raw.platformFee,
    raw.taxAmount,
    raw.deliveryFee,
    raw.grandTotal,
  ].map(money);
  const rawItems = Array.isArray(raw.items) ? raw.items.slice(0, 100) : [];
  const items = rawItems.map(parseItem);
  if (
    !isCanonicalUuid(id) ||
    !status ||
    !STATUSES.has(status) ||
    !currency ||
    !createdAt ||
    !updatedAt ||
    amounts.some((amount) => amount === null) ||
    items.some((item) => item === null)
  ) {
    return null;
  }
  const prepTimeMinutes = integer(raw.prepTimeMinutes, 1, 1_440);
  const statusHistory = parseStatusHistory(raw.statusHistory);
  return {
    id,
    kitchenName: optional(raw.kitchenName, 180),
    status,
    currency: currency.toUpperCase(),
    foodSubtotal: amounts[0]!,
    platformFee: amounts[1]!,
    taxAmount: amounts[2]!,
    deliveryFee: amounts[3]!,
    grandTotal: amounts[4]!,
    chefResponseNote: optional(raw.chefResponseNote, 500),
    prepTimeMinutes,
    deliveryAddress: parseAddress(raw.deliveryAddress),
    items: items as ChefOrderItem[],
    createdAt,
    updatedAt,
    checkoutId: isCanonicalUuid(raw.checkoutId) ? raw.checkoutId : null,
    chefAcceptanceExpiresAt: instant(raw.chefAcceptanceExpiresAt),
    customerNote: optional(raw.customerNote, 500),
    deliveryPartner: parsePartner(raw.deliveryPartner),
    ...(raw.chefHandedOverAt === null || instant(raw.chefHandedOverAt) ? { chefHandedOverAt: instant(raw.chefHandedOverAt) } : {}),
    ...(statusHistory.length ? { statusHistory } : {}),
  };
}

export function parseChefOrders(value: unknown): ChefOrder[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const orders = value.map(parseChefOrder);
  return orders.some((order) => order === null)
    ? null
    : (orders as ChefOrder[]);
}

/**
 * APIM and older deployed BFF revisions have returned either a direct JSON
 * array, Spring Page `{ content: [...] }`, or named `{ orders: [...] }` /
 * `{ data: [...] }` envelopes. All variants still pass the same strict order
 * allow-list; unknown fields such as identity and pickup snapshots are
 * discarded.
 */
export function parseChefOrdersResponse(value: unknown): ChefOrder[] | null {
  if (Array.isArray(value)) return parseChefOrders(value);
  const wrapper = record(value);
  if (!wrapper) return null;
  for (const key of ["orders", "content", "data"] as const) {
    const candidate = wrapper[key];
    if (Array.isArray(candidate)) return parseChefOrders(candidate);
  }
  const data = record(wrapper.data);
  if (data) {
    for (const key of ["orders", "content"] as const) {
      if (Array.isArray(data[key])) return parseChefOrders(data[key]);
    }
  }
  return null;
}

export function parseChefOrderResponse(value: unknown): ChefOrder | null {
  const direct = parseChefOrder(value);
  if (direct) return direct;
  const wrapper = record(value);
  if (!wrapper) return null;
  const order = parseChefOrder(wrapper.order);
  if (order) return order;
  const data = record(wrapper.data);
  return parseChefOrder(data?.order ?? wrapper.data);
}

export function formatChefOrderStatus(status: ChefOrderStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export type ChefOrderHistoryPage = { orders: ChefOrder[]; nextCursor: string | null; hasMore: boolean };

export function isChefOrderStatus(value: unknown): value is ChefOrderStatus {
  return typeof value === "string" && STATUSES.has(value as ChefOrderStatus);
}

const PAGE_KEYS = new Set(["orders", "nextCursor", "hasMore"]);

/** order-service OrderPageResponse from GET /api/v1/chef/orders/page: only these keys, unique orders, and hasMore needs a cursor. */
export function parseChefOrderHistoryPage(value: unknown): ChefOrderHistoryPage | null {
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !PAGE_KEYS.has(key)) || typeof raw.hasMore !== "boolean") return null;
  const orders = parseChefOrders(raw.orders);
  const nextCursor = raw.nextCursor == null ? null : typeof raw.nextCursor === "string" && raw.nextCursor.length >= 1 && raw.nextCursor.length <= 512 ? raw.nextCursor : undefined;
  if (!orders || orders.length > 100 || new Set(orders.map((order) => order.id)).size !== orders.length || nextCursor === undefined || (raw.hasMore && !nextCursor)) return null;
  return { orders, nextCursor, hasMore: raw.hasMore };
}
