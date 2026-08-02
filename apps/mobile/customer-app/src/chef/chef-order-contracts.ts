export type MobileChefOrderStatus = 'PAYMENT_PENDING' | 'PAID' | 'CHEF_ACCEPTANCE_PENDING' | 'CHEF_ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CHEF_REJECTED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED' | 'REFUND_FAILED';

export type MobileChefOrderItem = { id: string; menuItemId: string; itemName: string; quantity: number; lineTotal: number };
export type MobileChefOrderAddress = { recipientName: string; contactPhoneNumber: string; addressLine1: string; addressLine2: string | null; landmark: string | null; areaName: string | null; city: string; state: string; postalCode: string };
export type MobileChefOrder = {
  id: string;
  kitchenName: string;
  status: MobileChefOrderStatus;
  currency: string;
  foodSubtotal: number;
  grandTotal: number;
  chefResponseNote: string | null;
  prepTimeMinutes: number | null;
  deliveryAddress: MobileChefOrderAddress | null;
  items: MobileChefOrderItem[];
  createdAt: string;
  updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set<MobileChefOrderStatus>(['PAYMENT_PENDING','PAID','CHEF_ACCEPTANCE_PENDING','CHEF_ACCEPTED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED','CHEF_REJECTED','CANCELLED','REFUND_PENDING','REFUNDED','REFUND_FAILED']);
function text(value: unknown, max: number): string | null { if (typeof value !== 'string') return null; const result = value.trim(); return result && result.length <= max ? result : null; }
function optional(value: unknown, max: number): string | null { return value === null || value === undefined || value === '' ? null : text(value, max); }
function money(value: unknown): number | null { const number = typeof value === 'number' ? value : Number(value); return Number.isFinite(number) && number >= 0 && number <= 10_000_000 ? number : null; }
function instant(value: unknown): string | null { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null; }
function parseItem(value: unknown): MobileChefOrderItem | null { if (!value || typeof value !== 'object') return null; const raw = value as Record<string, unknown>; const id = text(raw.id,64); const menuItemId = text(raw.menuItemId,64); const itemName = text(raw.itemName,180); const lineTotal = money(raw.lineTotal); const quantity = typeof raw.quantity === 'number' && Number.isInteger(raw.quantity) ? raw.quantity : 0; if (!id || !UUID.test(id) || !menuItemId || !UUID.test(menuItemId) || !itemName || lineTotal === null || quantity < 1 || quantity > 100) return null; return { id, menuItemId, itemName, quantity, lineTotal }; }
function parseAddress(value: unknown): MobileChefOrderAddress | null { if (!value || typeof value !== 'object') return null; const raw = value as Record<string, unknown>; const recipientName = text(raw.recipientName,160); const contactPhoneNumber = text(raw.contactPhoneNumber,24); const addressLine1 = text(raw.addressLine1,250); const city = text(raw.city,120); const state = text(raw.state,120); const postalCode = text(raw.postalCode,20); if (!recipientName || !contactPhoneNumber || !addressLine1 || !city || !state || !postalCode) return null; return { recipientName, contactPhoneNumber, addressLine1, addressLine2: optional(raw.addressLine2,250), landmark: optional(raw.landmark,160), areaName: optional(raw.areaName,120), city, state, postalCode }; }

export function parseMobileChefOrder(value: unknown): MobileChefOrder | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>; const id = text(raw.id,64); const kitchenName = text(raw.kitchenName,180); const status = text(raw.status,40) as MobileChefOrderStatus | null; const currency = text(raw.currency,3); const foodSubtotal = money(raw.foodSubtotal); const grandTotal = money(raw.grandTotal); const createdAt = instant(raw.createdAt); const updatedAt = instant(raw.updatedAt); const items = (Array.isArray(raw.items) ? raw.items.slice(0,100) : []).map(parseItem);
  if (!id || !UUID.test(id) || !kitchenName || !status || !STATUSES.has(status) || !currency || foodSubtotal === null || grandTotal === null || !createdAt || !updatedAt || items.some(item => item === null)) return null;
  return { id, kitchenName, status, currency, foodSubtotal, grandTotal, chefResponseNote: optional(raw.chefResponseNote,500), prepTimeMinutes: typeof raw.prepTimeMinutes === 'number' && Number.isInteger(raw.prepTimeMinutes) ? raw.prepTimeMinutes : null, deliveryAddress: parseAddress(raw.deliveryAddress), items: items as MobileChefOrderItem[], createdAt, updatedAt };
}
export function parseMobileChefOrders(value: unknown): MobileChefOrder[] | null { if (!Array.isArray(value) || value.length > 500) return null; const orders = value.map(parseMobileChefOrder); return orders.some(order => order === null) ? null : orders as MobileChefOrder[]; }
export function chefOrderAction(status: MobileChefOrderStatus): 'DECIDE' | 'READY' | 'NONE' { if (status === 'CHEF_ACCEPTANCE_PENDING') return 'DECIDE'; if (status === 'CHEF_ACCEPTED' || status === 'PREPARING') return 'READY'; return 'NONE'; }
