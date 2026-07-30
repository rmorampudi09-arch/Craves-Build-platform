export type CartItem = {
  id: string;
  menuItemId: string;
  kitchenId: string;
  itemName: string;
  kitchenName: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  lineTotal: number;
};

export type CustomerCart = {
  id: string;
  currency: string;
  items: CartItem[];
  foodSubtotal: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown, max: number): string | null { if (typeof value !== 'string') return null; const result = value.trim(); return result && result.length <= max ? result : null; }
function money(value: unknown): number | null { const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN; return Number.isFinite(result) && result >= 0 && result <= 10_000_000 ? result : null; }
function parseItem(value: unknown): CartItem | null {
  const raw = record(value); if (!raw) return null;
  const id = text(raw.id, 64); const menuItemId = text(raw.menuItemId, 64); const kitchenId = text(raw.kitchenId, 64); const itemName = text(raw.itemName, 180); const kitchenName = text(raw.kitchenName, 180); const currency = text(raw.currency, 3); const unitPrice = money(raw.unitPrice); const lineTotal = money(raw.lineTotal); const quantity = typeof raw.quantity === 'number' && Number.isInteger(raw.quantity) && raw.quantity >= 1 && raw.quantity <= 100 ? raw.quantity : null;
  if (!id || !UUID.test(id) || !menuItemId || !UUID.test(menuItemId) || !kitchenId || !UUID.test(kitchenId) || !itemName || !kitchenName || !currency || unitPrice === null || lineTotal === null || quantity === null) return null;
  return { id, menuItemId, kitchenId, itemName, kitchenName, unitPrice, currency: currency.toUpperCase(), quantity, lineTotal };
}
export function parseCart(value: unknown): CustomerCart | null {
  const raw = record(value); if (!raw || !Array.isArray(raw.items) || raw.items.length > 200) return null;
  const id = text(raw.id, 64); const currency = text(raw.currency, 3); const totals = record(raw.totals); const totalCurrency = totals ? text(totals.currency, 3) : null; const foodSubtotal = totals ? money(totals.foodSubtotal) : null; const items = raw.items.map(parseItem);
  if (!id || !UUID.test(id) || !currency || !totalCurrency || currency.toUpperCase() !== totalCurrency.toUpperCase() || foodSubtotal === null || items.some(item => item === null)) return null;
  return { id, currency: currency.toUpperCase(), items: items as CartItem[], foodSubtotal };
}
export function validateMenuItemInput(menuItemId: string, quantity: number): boolean { return UUID.test(menuItemId) && Number.isInteger(quantity) && quantity >= 1 && quantity <= 100; }
export function validateQuantity(quantity: number): boolean { return Number.isInteger(quantity) && quantity >= 1 && quantity <= 100; }
