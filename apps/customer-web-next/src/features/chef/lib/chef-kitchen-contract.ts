import { safeChefPhotoUrl } from "../../../shared/lib/chef-photo.ts";
import type {
  ChefKitchen,
  ChefKitchenInput,
  ChefKitchenSocialLinks,
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

// catalog-service CatalogService: up to 10 cuisines or delivery areas of 1-40 characters; https links of up to 200.
export const CHEF_KITCHEN_TAG_LIMITS = { count: 10, length: 40 } as const;
export const SOCIAL_LINK_MAX = 200;
export const SOCIAL_LINK_FIELDS = ["instagram", "facebook", "youtube", "website"] as const satisfies readonly (keyof ChefKitchenSocialLinks)[];

/** Empty, or an https:// link with a host, as Catalog accepts. */
export function isSocialLink(value: string): boolean {
  const link = value.trim();
  if (!link) return true;
  try {
    return link.length <= SOCIAL_LINK_MAX && /^https:\/\//i.test(link) && new URL(link).hostname !== "";
  } catch {
    return false;
  }
}

/** The 18 drawn faces a chef picks from (catalog-service CHEF_AVATAR_IDS); chefs never upload their own face. */
export const CHEF_AVATAR_IDS: readonly string[] = Array.from({ length: 18 }, (_, index) => `chef-avatar-${String(index + 1).padStart(2, "0")}`);
export const chefAvatarUrl = (avatarId: string) => `https://craves.in/media/public/chef-avatars/${avatarId}.jpg`;

/** The face a picture link points to, or null when it is not one of the 18. */
export function chefAvatarIdFromUrl(url: string | null | undefined): string | null {
  const id = url?.match(/\/(chef-avatar-\d{2})\.jpg(?:[?#].*)?$/)?.[1];
  return id && CHEF_AVATAR_IDS.includes(id) ? id : null;
}

/**
 * Whether the chef picks a face before the chef area opens. Only a loaded kitchen that is not
 * suspended and whose server says "no picture" (null) asks; a failed read, no kitchen yet, or an
 * older server that leaves the field out all open the chef area, so no chef is ever stuck.
 */
export function chefAvatarGateStep(read: "failed" | ChefKitchen | null): "ask" | "open" {
  return read !== "failed" && read?.chefPhotoUrl === null && read.status !== "SUSPENDED" ? "ask" : "open";
}

/**
 * The "Overall kitchen" and "Cooking setup" tiles: a photo link, null when empty, or undefined while the server
 * doesn't offer kitchen photos. Catalog fills slot 1 before slot 2, and support can empty either one.
 */
export function kitchenPhotoSlots(kitchen: ChefKitchen): [string | null, string | null] | undefined {
  if (!kitchen.kitchenPhotoUrls) return undefined;
  const overall = kitchen.kitchenPhotoUrl ?? null;
  return [overall, kitchen.kitchenPhotoUrls.find((url) => url !== overall) ?? null];
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

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value.map((entry) => entry.trim()).filter(Boolean) : undefined;
}

function socialLinks(value: unknown): ChefKitchenSocialLinks | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const link = (entry: unknown) => (typeof entry === "string" && entry.trim() ? entry.trim() : null);
  return { instagram: link(raw.instagram), facebook: link(raw.facebook), youtube: link(raw.youtube), website: link(raw.website) };
}

/** Absent (undefined) keeps what Catalog has; false is a list Catalog would refuse. */
function tagsInput(value: unknown): string[] | undefined | false {
  if (value === undefined || value === null) return undefined;
  const list = stringList(value);
  return list && list.length === (value as unknown[]).length && list.length <= CHEF_KITCHEN_TAG_LIMITS.count && list.every((tag) => tag.length <= CHEF_KITCHEN_TAG_LIMITS.length) ? list : false;
}

function linksInput(value: unknown): ChefKitchenSocialLinks | undefined | false {
  if (value === undefined || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const links = socialLinks(value);
  return links && SOCIAL_LINK_FIELDS.every((field) => raw[field] == null || (typeof raw[field] === "string" && isSocialLink(raw[field]))) ? links : false;
}

/** These pickup fields are also required by Order's checkout snapshot. Drafts can remain incomplete. */
export function missingKitchenPickupField(value: {
  phoneNumber?: unknown;
  areaName?: unknown;
  postalCode?: unknown;
}): "phoneNumber" | "areaName" | "postalCode" | null {
  if (!text(value.phoneNumber, 24)) return "phoneNumber";
  if (!text(value.areaName, 120)) return "areaName";
  if (!text(value.postalCode, CHEF_KITCHEN_FIELD_LIMITS.postalCode)) return "postalCode";
  return null;
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
    // Only what the server sent, so a screen can tell "not offered yet" from "empty".
    ...(raw.chefPhotoUrl !== undefined ? { chefPhotoUrl: safeChefPhotoUrl(raw.chefPhotoUrl) } : {}),
    ...(raw.kitchenPhotoUrl !== undefined ? { kitchenPhotoUrl: safeChefPhotoUrl(raw.kitchenPhotoUrl) } : {}),
    ...(Array.isArray(raw.kitchenPhotoUrls)
      ? { kitchenPhotoUrls: raw.kitchenPhotoUrls.map(safeChefPhotoUrl).filter((url): url is string => url !== null).slice(0, 2) }
      : {}),
    ...(stringList(raw.cuisines) ? { cuisines: stringList(raw.cuisines) } : {}),
    ...(stringList(raw.serviceAreas) ? { serviceAreas: stringList(raw.serviceAreas) } : {}),
    ...(socialLinks(raw.socialLinks) ? { socialLinks: socialLinks(raw.socialLinks) } : {}),
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
  const cuisines = tagsInput(raw.cuisines);
  const serviceAreas = tagsInput(raw.serviceAreas);
  const links = linksInput(raw.socialLinks);
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
    (status === "ACTIVE" && (latitude === null || longitude === null || missingKitchenPickupField(raw) !== null)) ||
    cuisines === false ||
    serviceAreas === false ||
    links === false
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
    ...(cuisines ? { cuisines } : {}),
    ...(serviceAreas ? { serviceAreas } : {}),
    ...(links ? { socialLinks: links } : {}),
  };
}
