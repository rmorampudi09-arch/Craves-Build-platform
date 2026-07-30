export type ChefOrderStatus = "PAYMENT_PENDING" | "PAID" | "CHEF_ACCEPTANCE_PENDING" | "CHEF_ACCEPTED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CHEF_REJECTED" | "CANCELLED" | "REFUND_PENDING" | "REFUNDED" | "REFUND_FAILED";

export type ChefOrderItem = {
  id: string;
  menuItemId: string;
  itemName: string;
  category: string;
  foodType: string;
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
};

export type ChefOrder = {
  id: string;
  kitchenName: string;
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
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set<ChefOrderStatus>(["PAYMENT_PENDING","PAID","CHEF_ACCEPTANCE_PENDING","CHEF_ACCEPTED","PREPARING","READY_FOR_PICKUP","OUT_FOR_DELIVERY","DELIVERED","CHEF_REJECTED","CANCELLED","REFUND_PENDING","REFUNDED","REFUND_FAILED"]);
function text(value: unknown, max: number): string | null { if (typeof value !== "string") return null; const result = value.trim(); return result && result.length <= max ? result : null; }
function optional(value: unknown, max: number): string | null { return value === null || value === undefined || value === "" ? null : text(value, max); }
function instant(value: unknown): string | null { return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null; }
function money(value: unknown): number | null { const n = typeof value === "number" ? value : Number(value); return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : null; }

function parseItem(value: unknown): ChefOrderItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64); const menuItemId = text(raw.menuItemId, 64); const itemName = text(raw.itemName, 180); const category = text(raw.category, 80); const foodType = text(raw.foodType, 40); const unitPrice = money(raw.unitPrice); const lineTotal = money(raw.lineTotal); const quantity = typeof raw.quantity === "number" && Number.isInteger(raw.quantity) ? raw.quantity : 0;
  if (!id || !UUID.test(id) || !menuItemId || !UUID.test(menuItemId) || !itemName || !category || !foodType || unitPrice === null || lineTotal === null || quantity < 1 || quantity > 100) return null;
  return { id, menuItemId, itemName, category, foodType, unitPrice, quantity, lineTotal };
}

function parseAddress(value: unknown): ChefDeliveryAddress | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const recipientName = text(raw.recipientName, 160); const contactPhoneNumber = text(raw.contactPhoneNumber, 24); const addressLine1 = text(raw.addressLine1, 250); const city = text(raw.city, 120); const state = text(raw.state, 120); const postalCode = text(raw.postalCode, 20);
  if (!recipientName || !contactPhoneNumber || !addressLine1 || !city || !state || !postalCode) return null;
  return { recipientName, contactPhoneNumber, addressLine1, addressLine2: optional(raw.addressLine2, 250), landmark: optional(raw.landmark, 160), areaName: optional(raw.areaName, 120), city, state, postalCode };
}

export function parseChefOrder(value: unknown): ChefOrder | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64); const kitchenName = text(raw.kitchenName, 180); const status = text(raw.status, 40) as ChefOrderStatus | null; const currency = text(raw.currency, 3); const createdAt = instant(raw.createdAt); const updatedAt = instant(raw.updatedAt);
  const amounts = [raw.foodSubtotal, raw.platformFee, raw.taxAmount, raw.deliveryFee, raw.grandTotal].map(money);
  const items = (Array.isArray(raw.items) ? raw.items.slice(0, 100) : []).map(parseItem);
  if (!id || !UUID.test(id) || !kitchenName || !status || !STATUSES.has(status) || !currency || !createdAt || !updatedAt || amounts.some(amount => amount === null) || items.some(item => item === null)) return null;
  return { id, kitchenName, status, currency, foodSubtotal: amounts[0]!, platformFee: amounts[1]!, taxAmount: amounts[2]!, deliveryFee: amounts[3]!, grandTotal: amounts[4]!, chefResponseNote: optional(raw.chefResponseNote, 500), prepTimeMinutes: typeof raw.prepTimeMinutes === "number" && Number.isInteger(raw.prepTimeMinutes) ? raw.prepTimeMinutes : null, deliveryAddress: parseAddress(raw.deliveryAddress), items: items as ChefOrderItem[], createdAt, updatedAt };
}

export function parseChefOrders(value: unknown): ChefOrder[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const orders = value.map(parseChefOrder);
  return orders.some(order => order === null) ? null : orders as ChefOrder[];
}

export function formatChefOrderStatus(status: ChefOrderStatus): string { return status.toLowerCase().split("_").map(part => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
