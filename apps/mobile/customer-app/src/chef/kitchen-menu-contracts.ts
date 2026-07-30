export type MobileKitchenStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type MobileMenuStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';
export type MobileFoodType = 'VEG' | 'NON_VEG' | 'EGG';
export type MobileSpiceLevel = 'MILD' | 'MEDIUM' | 'SPICY';

export type MobileChefKitchen = {
  id: string;
  kitchenName: string;
  displayName: string | null;
  description: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: MobileKitchenStatus;
};

export type MobileChefMenuItem = {
  id: string;
  itemName: string;
  description: string | null;
  category: string;
  foodType: MobileFoodType;
  price: number;
  currency: string;
  preparationTimeMinutes: number | null;
  unitPackageWeightGrams: number;
  thermoboxRequired: boolean;
  available: boolean;
  status: MobileMenuStatus;
  spiceLevel: MobileSpiceLevel | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KITCHEN = new Set<MobileKitchenStatus>(['DRAFT','ACTIVE','INACTIVE','SUSPENDED']);
const MENU = new Set<MobileMenuStatus>(['DRAFT','ACTIVE','INACTIVE']);
const FOOD = new Set<MobileFoodType>(['VEG','NON_VEG','EGG']);
const SPICE = new Set<MobileSpiceLevel>(['MILD','MEDIUM','SPICY']);
function text(value: unknown, max: number): string | null { if (typeof value !== 'string') return null; const result = value.trim(); return result && result.length <= max ? result : null; }
function optional(value: unknown, max: number): string | null { return value === null || value === undefined || value === '' ? null : text(value, max); }
function number(value: unknown, min: number, max: number): number | null { if (value === null || value === undefined || value === '') return null; const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null; }

export function parseMobileChefKitchen(value: unknown): MobileChefKitchen | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64); const kitchenName = text(raw.kitchenName, 180); const addressLine1 = text(raw.addressLine1, 250); const city = text(raw.city, 120); const state = text(raw.state, 120); const status = text(raw.status, 40) as MobileKitchenStatus | null;
  if (!id || !UUID.test(id) || !kitchenName || !addressLine1 || !city || !state || !status || !KITCHEN.has(status)) return null;
  return { id, kitchenName, displayName: optional(raw.displayName,180), description: optional(raw.description,2000), phoneNumber: optional(raw.phoneNumber,24), email: optional(raw.email,320), addressLine1, addressLine2: optional(raw.addressLine2,250), landmark: optional(raw.landmark,160), areaName: optional(raw.areaName,120), city, state, postalCode: optional(raw.postalCode,20), latitude: number(raw.latitude,-90,90), longitude: number(raw.longitude,-180,180), status };
}

export function parseMobileChefMenuItem(value: unknown): MobileChefMenuItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id,64); const itemName = text(raw.itemName,180); const category = text(raw.category,80); const foodType = text(raw.foodType,40) as MobileFoodType | null; const status = text(raw.status,40) as MobileMenuStatus | null; const price = number(raw.price,0.01,10_000_000); const currency = text(raw.currency,3); const weight = number(raw.unitPackageWeightGrams,1,100000); const spice = optional(raw.spiceLevel,40) as MobileSpiceLevel | null;
  if (!id || !UUID.test(id) || !itemName || !category || !foodType || !FOOD.has(foodType) || !status || !MENU.has(status) || price === null || !currency || weight === null || (spice && !SPICE.has(spice))) return null;
  return { id, itemName, description: optional(raw.description,2000), category, foodType, price, currency: currency.toUpperCase(), preparationTimeMinutes: number(raw.preparationTimeMinutes,1,1440), unitPackageWeightGrams: weight, thermoboxRequired: raw.thermoboxRequired === true, available: raw.available === true, status, spiceLevel: spice };
}

export function parseMobileChefMenuItems(value: unknown): MobileChefMenuItem[] | null { if (!Array.isArray(value) || value.length > 500) return null; const items = value.map(parseMobileChefMenuItem); return items.some(item => item === null) ? null : items as MobileChefMenuItem[]; }
