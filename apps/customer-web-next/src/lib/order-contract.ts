export type CustomerOrderItem = {
  id: string;
  menuItemId: string;
  itemName: string;
  category: string;
  foodType: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type CustomerOrder = {
  id: string;
  checkoutId: string;
  kitchenId: string;
  kitchenName: string;
  status: string;
  currency: string;
  foodSubtotal: number;
  platformFee: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  chefResponseNote: string | null;
  prepTimeMinutes: number | null;
  deliveryAddress: {
    recipientName: string;
    addressLine1: string;
    addressLine2: string | null;
    landmark: string | null;
    areaName: string | null;
    city: string;
    state: string;
    postalCode: string;
  } | null;
  items: CustomerOrderItem[];
  createdAt: string;
  updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_STATUSES = new Set([
  "PAYMENT_PENDING", "PAID", "CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING",
  "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CHEF_REJECTED", "CANCELLED",
  "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"
]);

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function money(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 10_000_000 ? number : null;
}

function instant(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function parseItem(value: unknown): CustomerOrderItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = text(item.id, 64);
  const menuItemId = text(item.menuItemId, 64);
  const itemName = text(item.itemName, 180);
  const category = text(item.category, 80) ?? "Food";
  const foodType = text(item.foodType, 40) ?? "UNSPECIFIED";
  const unitPrice = money(item.unitPrice);
  const lineTotal = money(item.lineTotal);
  const quantity = typeof item.quantity === "number" && Number.isInteger(item.quantity) ? item.quantity : 0;
  if (!id || !UUID.test(id) || !menuItemId || !UUID.test(menuItemId) || !itemName || unitPrice === null || lineTotal === null || quantity < 1 || quantity > 100) return null;
  return { id, menuItemId, itemName, category, foodType, unitPrice, quantity, lineTotal };
}

function parseAddress(value: unknown): CustomerOrder["deliveryAddress"] {
  if (!value || typeof value !== "object") return null;
  const address = value as Record<string, unknown>;
  const recipientName = text(address.recipientName, 160);
  const addressLine1 = text(address.addressLine1, 250);
  const city = text(address.city, 120);
  const state = text(address.state, 120);
  const postalCode = text(address.postalCode, 20);
  if (!recipientName || !addressLine1 || !city || !state || !postalCode) return null;
  return {
    recipientName,
    addressLine1,
    addressLine2: text(address.addressLine2, 250),
    landmark: text(address.landmark, 160),
    areaName: text(address.areaName, 120),
    city,
    state,
    postalCode
  };
}

export function parseCustomerOrder(value: unknown): CustomerOrder | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Record<string, unknown>;
  const id = text(order.id, 64);
  const checkoutId = text(order.checkoutId, 64);
  const kitchenId = text(order.kitchenId, 64);
  const kitchenName = text(order.kitchenName, 180);
  const status = text(order.status, 40);
  const currency = text(order.currency, 3);
  const createdAt = instant(order.createdAt);
  const updatedAt = instant(order.updatedAt);
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items = rawItems.slice(0, 100).map(parseItem);
  const amounts = [order.foodSubtotal, order.platformFee, order.taxAmount, order.deliveryFee, order.grandTotal].map(money);
  if (!id || !UUID.test(id) || !checkoutId || !UUID.test(checkoutId) || !kitchenId || !UUID.test(kitchenId) || !kitchenName || !status || !ORDER_STATUSES.has(status) || !currency || !createdAt || !updatedAt || items.some(item => item === null) || amounts.some(amount => amount === null)) return null;
  return {
    id,
    checkoutId,
    kitchenId,
    kitchenName,
    status,
    currency,
    foodSubtotal: amounts[0]!,
    platformFee: amounts[1]!,
    taxAmount: amounts[2]!,
    deliveryFee: amounts[3]!,
    grandTotal: amounts[4]!,
    chefResponseNote: text(order.chefResponseNote, 500),
    prepTimeMinutes: typeof order.prepTimeMinutes === "number" && Number.isInteger(order.prepTimeMinutes) ? order.prepTimeMinutes : null,
    deliveryAddress: parseAddress(order.deliveryAddress),
    items: items as CustomerOrderItem[],
    createdAt,
    updatedAt
  };
}

export function parseCustomerOrders(value: unknown): CustomerOrder[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const orders = value.map(parseCustomerOrder);
  return orders.some(order => order === null) ? null : orders as CustomerOrder[];
}

export function formatOrderStatus(status: string): string {
  return status.toLowerCase().split("_").map(part => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
