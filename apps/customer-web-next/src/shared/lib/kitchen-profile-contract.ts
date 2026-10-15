// Mirrors catalog-service KitchenProfileResponse from public GET /api/v1/catalog/kitchens/{id} (privacy-sanitised: no address, phone or createdAt). Browser-safe.
import { safeChefPhotoUrl } from "./chef-photo.ts";

export type KitchenStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type KitchenProfile = {
  id: string;
  kitchenName: string;
  displayName: string | null;
  description: string | null;
  areaName: string | null;
  city: string | null;
  state: string | null;
  status: KitchenStatus;
  createdAt: string | null;
  chefPhotoUrl: string | null;
  kitchenPhotoUrls: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["DRAFT", "ACTIVE", "INACTIVE", "SUSPENDED"]);
const MAX_PHOTOS = 12;

// null/missing -> null, blank -> null, a non-string or over-long value -> undefined (contract break).
function optional(value: unknown, max: number): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) return undefined;
  return value.trim() || null;
}

export function parseKitchenProfile(value: unknown): KitchenProfile | null {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!raw || typeof raw.id !== "string" || !UUID.test(raw.id) || typeof raw.status !== "string" || !STATUSES.has(raw.status)) return null;
  const kitchenName = optional(raw.kitchenName, 180);
  const text = { displayName: optional(raw.displayName, 180), description: optional(raw.description, 20_000), areaName: optional(raw.areaName, 160), city: optional(raw.city, 160), state: optional(raw.state, 160) };
  const createdAt = raw.createdAt == null ? null : typeof raw.createdAt === "string" && raw.createdAt.length <= 40 && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : undefined;
  if (!kitchenName || createdAt === undefined || Object.values(text).includes(undefined) || (raw.kitchenPhotoUrls != null && !Array.isArray(raw.kitchenPhotoUrls))) return null;
  const photos = ((raw.kitchenPhotoUrls ?? []) as unknown[]).map(safeChefPhotoUrl).filter((url): url is string => url !== null);
  return {
    id: raw.id, kitchenName, ...text as Record<keyof typeof text, string | null>, status: raw.status as KitchenStatus, createdAt,
    chefPhotoUrl: safeChefPhotoUrl(raw.chefPhotoUrl), kitchenPhotoUrls: [...new Set(photos)].slice(0, MAX_PHOTOS),
  };
}
