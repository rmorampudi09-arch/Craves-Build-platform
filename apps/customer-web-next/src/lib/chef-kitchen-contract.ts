import type {
  ChefKitchen,
  ChefKitchenInput,
  EditableKitchenStatus,
  KitchenStatus,
} from "./chef-kitchen-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set<KitchenStatus>([
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
]);
const EDITABLE = new Set<EditableKitchenStatus>([
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
]);

export const CHEF_KITCHEN_FIELD_LIMITS = {
  kitchenName: 160,
  displayName: 160,
  city: 80,
  state: 80,
  postalCode: 16,
} as const;

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
function validOptionalText(value: unknown, max: number): boolean {
  return value === null || value === undefined ||
    (typeof value === "string" && value.trim().length <= max);
}
function number(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}
function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

export function parseChefKitchen(value: unknown): ChefKitchen | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64);
  const kitchenName = text(raw.kitchenName, CHEF_KITCHEN_FIELD_LIMITS.kitchenName);
  const addressLine1 = text(raw.addressLine1, 250);
  const city = text(raw.city, CHEF_KITCHEN_FIELD_LIMITS.city);
  const state = text(raw.state, CHEF_KITCHEN_FIELD_LIMITS.state);
  const status = text(raw.status, 40) as KitchenStatus | null;
  const createdAt = instant(raw.createdAt);
  const updatedAt = instant(raw.updatedAt);
  if (
    !id ||
    !UUID.test(id) ||
    !kitchenName ||
    !addressLine1 ||
    !city ||
    !state ||
    !status ||
    !STATUSES.has(status) ||
    !createdAt ||
    !updatedAt
  )
    return null;
  return {
    id,
    kitchenName,
    displayName: optional(raw.displayName, CHEF_KITCHEN_FIELD_LIMITS.displayName),
    description: optional(raw.description, 2000),
    phoneNumber: optional(raw.phoneNumber, 24),
    email: optional(raw.email, 320),
    addressLine1,
    addressLine2: optional(raw.addressLine2, 250),
    landmark: optional(raw.landmark, 160),
    areaName: optional(raw.areaName, 120),
    city,
    state,
    postalCode: optional(raw.postalCode, CHEF_KITCHEN_FIELD_LIMITS.postalCode),
    latitude: number(raw.latitude, -90, 90),
    longitude: number(raw.longitude, -180, 180),
    status,
    createdAt,
    updatedAt,
  };
}

export function parseChefKitchenInput(value: unknown): ChefKitchenInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kitchenName = text(raw.kitchenName, CHEF_KITCHEN_FIELD_LIMITS.kitchenName);
  const addressLine1 = text(raw.addressLine1, 250);
  const city = text(raw.city, CHEF_KITCHEN_FIELD_LIMITS.city);
  const state = text(raw.state, CHEF_KITCHEN_FIELD_LIMITS.state);
  const status = text(raw.status, 40) as EditableKitchenStatus | null;
  const latitude = number(raw.latitude, -90, 90);
  const longitude = number(raw.longitude, -180, 180);
  const hasLat =
    raw.latitude !== null && raw.latitude !== undefined && raw.latitude !== "";
  const hasLon =
    raw.longitude !== null &&
    raw.longitude !== undefined &&
    raw.longitude !== "";
  if (
    !kitchenName ||
    !addressLine1 ||
    !city ||
    !state ||
    !status ||
    !EDITABLE.has(status) ||
    !validOptionalText(raw.displayName, CHEF_KITCHEN_FIELD_LIMITS.displayName) ||
    !validOptionalText(raw.postalCode, CHEF_KITCHEN_FIELD_LIMITS.postalCode) ||
    hasLat !== hasLon ||
    (hasLat && (latitude === null || longitude === null)) ||
    (status === "ACTIVE" && (latitude === null || longitude === null))
  )
    return null;
  return {
    kitchenName,
    displayName: optional(raw.displayName, CHEF_KITCHEN_FIELD_LIMITS.displayName),
    description: optional(raw.description, 2000),
    phoneNumber: optional(raw.phoneNumber, 24),
    email: optional(raw.email, 320),
    addressLine1,
    addressLine2: optional(raw.addressLine2, 250),
    landmark: optional(raw.landmark, 160),
    areaName: optional(raw.areaName, 120),
    city,
    state,
    postalCode: optional(raw.postalCode, CHEF_KITCHEN_FIELD_LIMITS.postalCode),
    latitude,
    longitude,
    status,
  };
}
