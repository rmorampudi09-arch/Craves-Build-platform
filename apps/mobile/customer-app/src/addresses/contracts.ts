export type AddressLabel = 'HOME' | 'WORK' | 'OTHER';
export type CustomerAddress = {
  id: string;
  addressLabel: AddressLabel;
  recipientName: string;
  contactPhoneNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
export type AddressInput = Omit<CustomerAddress, 'id' | 'active' | 'createdAt' | 'updatedAt'>;
export type LocationRecommendation = { locationType: 'SAVED_ADDRESS' | 'LIVE_GPS'; latitude: number; longitude: number; selectedSavedAddress: CustomerAddress | null; distanceMeters: number | null; matchRadiusMeters: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^\+?[0-9]{10,15}$/;
const LABELS = new Set(['HOME', 'WORK', 'OTHER']);
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown, max: number): string | null { if (typeof value !== 'string') return null; const result = value.trim(); return result && result.length <= max ? result : null; }
function optional(value: unknown, max: number): string | null { return value == null || value === '' ? null : text(value, max); }
function coordinate(value: unknown, min: number, max: number): number | null { const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN; return Number.isFinite(result) && result >= min && result <= max ? result : null; }
function instant(value: unknown): string | null { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null; }

export function parseAddressInput(value: unknown): AddressInput | null {
  const raw = record(value); if (!raw) return null;
  const addressLabel = text(raw.addressLabel, 10); const recipientName = text(raw.recipientName, 160); const contactPhoneNumber = text(raw.contactPhoneNumber, 16); const addressLine1 = text(raw.addressLine1, 250); const areaName = text(raw.areaName, 120); const city = text(raw.city, 120); const state = text(raw.state, 120); const postalCode = text(raw.postalCode, 20); const latitude = coordinate(raw.latitude, -90, 90); const longitude = coordinate(raw.longitude, -180, 180);
  if (!addressLabel || !LABELS.has(addressLabel) || !recipientName || !contactPhoneNumber || !PHONE.test(contactPhoneNumber) || !addressLine1 || !areaName || !city || !state || !postalCode || latitude === null || longitude === null || typeof raw.isDefault !== 'boolean') return null;
  return { addressLabel: addressLabel as AddressLabel, recipientName, contactPhoneNumber, addressLine1, addressLine2: optional(raw.addressLine2, 250), landmark: optional(raw.landmark, 160), areaName, city, state, postalCode, latitude, longitude, isDefault: raw.isDefault };
}
export function parseAddress(value: unknown): CustomerAddress | null {
  const raw = record(value); if (!raw) return null; const input = parseAddressInput(raw); const id = text(raw.id, 64); const createdAt = instant(raw.createdAt); const updatedAt = instant(raw.updatedAt);
  if (!input || !id || !UUID.test(id) || typeof raw.active !== 'boolean' || !createdAt || !updatedAt) return null;
  return { id, ...input, active: raw.active, createdAt, updatedAt };
}
export function parseAddresses(value: unknown): CustomerAddress[] | null { if (!Array.isArray(value) || value.length > 100) return null; const result = value.map(parseAddress); return result.some(item => item === null) ? null : result as CustomerAddress[]; }
export function parseRecommendation(value: unknown): LocationRecommendation | null {
  const raw = record(value); if (!raw) return null; const locationType = text(raw.locationType, 20); const latitude = coordinate(raw.latitude, -90, 90); const longitude = coordinate(raw.longitude, -180, 180); const selected = raw.selectedSavedAddress == null ? null : parseAddress(raw.selectedSavedAddress); const distanceMeters = raw.distanceMeters == null ? null : typeof raw.distanceMeters === 'number' && Number.isInteger(raw.distanceMeters) && raw.distanceMeters >= 0 ? raw.distanceMeters : null; const matchRadiusMeters = typeof raw.matchRadiusMeters === 'number' && Number.isInteger(raw.matchRadiusMeters) && raw.matchRadiusMeters >= 1 && raw.matchRadiusMeters <= 100_000 ? raw.matchRadiusMeters : null;
  if ((locationType !== 'SAVED_ADDRESS' && locationType !== 'LIVE_GPS') || latitude === null || longitude === null || matchRadiusMeters === null || (raw.selectedSavedAddress != null && !selected) || (raw.distanceMeters != null && distanceMeters === null)) return null;
  return { locationType, latitude, longitude, selectedSavedAddress: selected, distanceMeters, matchRadiusMeters };
}
