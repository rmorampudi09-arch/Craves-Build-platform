import type {CustomerBrowsingLocation} from '../../customerShell/state/customerShellSlice';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS_LABELS = new Set<CustomerAddressLabel>(['HOME', 'WORK', 'OTHER']);

export type CustomerAddressLabel = 'HOME' | 'WORK' | 'OTHER';

export interface CustomerAddress {
  id: string;
  identityId: string;
  addressLabel: CustomerAddressLabel | null;
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
}

export interface CustomerAddressUpdateRequest {
  addressLabel: CustomerAddressLabel | null;
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
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized || null : null;
}

function parseUuid(value: unknown): string | null {
  const candidate = boundedString(value, 64);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function parseTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function parseCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function parseAddressLabel(value: unknown): CustomerAddressLabel | null {
  if (value == null) {
    return null;
  }
  return typeof value === 'string' &&
    ADDRESS_LABELS.has(value as CustomerAddressLabel)
    ? (value as CustomerAddressLabel)
    : null;
}

export function parseCustomerAddress(value: unknown): CustomerAddress | null {
  const item = asRecord(value);
  if (!item) {
    return null;
  }

  const id = parseUuid(item.id);
  const identityId = parseUuid(item.identityId);
  const recipientName = boundedString(item.recipientName, 160);
  const contactPhoneNumber = boundedString(item.contactPhoneNumber, 32);
  const addressLine1 = boundedString(item.addressLine1, 240);
  const areaName = boundedString(item.areaName, 160);
  const city = boundedString(item.city, 120);
  const state = boundedString(item.state, 120);
  const postalCode = boundedString(item.postalCode, 32);
  const latitude = parseCoordinate(item.latitude, -90, 90);
  const longitude = parseCoordinate(item.longitude, -180, 180);
  const createdAt = parseTimestamp(item.createdAt);
  const updatedAt = parseTimestamp(item.updatedAt);

  if (
    !id ||
    !identityId ||
    !recipientName ||
    !contactPhoneNumber ||
    !addressLine1 ||
    !areaName ||
    !city ||
    !state ||
    !postalCode ||
    latitude === null ||
    longitude === null ||
    typeof item.isDefault !== 'boolean' ||
    typeof item.active !== 'boolean' ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  if (item.addressLabel != null && parseAddressLabel(item.addressLabel) === null) {
    return null;
  }

  const addressLine2 = optionalString(item.addressLine2, 240);
  const landmark = optionalString(item.landmark, 240);
  if (
    (item.addressLine2 != null && typeof item.addressLine2 !== 'string') ||
    (item.landmark != null && typeof item.landmark !== 'string')
  ) {
    return null;
  }

  return {
    id,
    identityId,
    addressLabel: parseAddressLabel(item.addressLabel),
    recipientName,
    contactPhoneNumber,
    addressLine1,
    addressLine2,
    landmark,
    areaName,
    city,
    state,
    postalCode,
    latitude,
    longitude,
    isDefault: item.isDefault,
    active: item.active,
    createdAt,
    updatedAt,
  };
}

export function customerAddressLabel(address: CustomerAddress): string {
  switch (address.addressLabel) {
    case 'HOME':
      return 'Home';
    case 'WORK':
      return 'Work';
    case 'OTHER':
      return 'Other';
    default:
      return 'Saved address';
  }
}

export function customerAddressDisplayLine(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

export function toCustomerAddressUpdateRequest(
  address: CustomerAddress,
  isDefault = address.isDefault,
): CustomerAddressUpdateRequest {
  return {
    addressLabel: address.addressLabel,
    recipientName: address.recipientName,
    contactPhoneNumber: address.contactPhoneNumber,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    landmark: address.landmark,
    areaName: address.areaName,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    latitude: address.latitude,
    longitude: address.longitude,
    isDefault,
  };
}

export function toCustomerBrowsingLocation(
  address: CustomerAddress,
): CustomerBrowsingLocation {
  return {
    kind: 'SAVED_ADDRESS',
    addressId: address.id,
    label: customerAddressLabel(address),
    displayName: address.areaName || customerAddressDisplayLine(address),
    latitude: address.latitude,
    longitude: address.longitude,
  };
}
