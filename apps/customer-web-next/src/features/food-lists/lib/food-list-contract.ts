/**
 * Food lists (advanced service M01), as the website reads them. The service may send null for a list's note,
 * its share, a share's expiry, a dish's note and a dish's price (Catalog unreachable).
 */
export type Availability = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
export type ListItem = { menuItemId: string; itemName: string; note: string | null; availability: Availability; pricePaise: number | null };
export type ListSummary = { id: string; name: string; description: string | null; itemCount: number; shared: boolean; updatedAt: string };
export type ListDetail = ListSummary & { share: { createdAt: string; expiresAt: string | null } | null; items: ListItem[] };
export type ShareLink = { url: string; expiresAt: string | null };
export type SharedList = { name: string; description: string | null; itemCount: number; items: ListItem[] };

export const LIST_NAME_MAX = 60;
export const LIST_DESCRIPTION_MAX = 280;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const isListId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isShareToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}
/** null or blank → null; a usable string → it; anything else → undefined (a broken answer). */
function optional(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return text(value, max) ?? undefined;
}
function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 200 ? value : null;
}

function parseItem(value: unknown): ListItem | null {
  const raw = record(value);
  if (!raw || !isListId(raw.menuItemId)) return null;
  const itemName = text(raw.itemName, 200);
  const note = optional(raw.note, 140);
  const price = raw.pricePaise;
  const pricePaise = price === null || price === undefined ? null : Number.isInteger(price) && (price as number) >= 0 ? (price as number) : undefined;
  if (!itemName || note === undefined || pricePaise === undefined) return null;
  const availability: Availability = raw.availability === "AVAILABLE" || raw.availability === "UNAVAILABLE" ? raw.availability : "UNKNOWN";
  return { menuItemId: raw.menuItemId as string, itemName, note, availability, pricePaise };
}

function parseItems(value: unknown): ListItem[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const items = value.map(parseItem);
  return items.every((item): item is ListItem => item !== null) ? items : null;
}

function parseSummary(value: unknown): ListSummary | null {
  const raw = record(value);
  if (!raw || !isListId(raw.id)) return null;
  const name = text(raw.name, 80);
  const description = optional(raw.description, 300);
  const itemCount = count(raw.itemCount);
  const updatedAt = instant(raw.updatedAt);
  if (!name || description === undefined || itemCount === null || !updatedAt) return null;
  return { id: raw.id as string, name, description, itemCount, shared: raw.visibility === "SHARED", updatedAt };
}

export function parseListSummaries(value: unknown): ListSummary[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const lists = value.map(parseSummary);
  return lists.every((list): list is ListSummary => list !== null) ? lists : null;
}

export function parseListDetail(value: unknown): ListDetail | null {
  const summary = parseSummary(value);
  const raw = record(value);
  const items = parseItems(raw?.items);
  if (!summary || !raw || !items) return null;
  let share: ListDetail["share"] = null;
  if (raw.share !== null && raw.share !== undefined) {
    const info = record(raw.share);
    const createdAt = instant(info?.createdAt);
    const expiresAt = info?.expiresAt === null || info?.expiresAt === undefined ? null : instant(info.expiresAt);
    if (!createdAt || (info?.expiresAt != null && !expiresAt)) return null;
    share = { createdAt, expiresAt };
  }
  return { ...summary, shared: share !== null, share, items };
}

export function parseShareLink(value: unknown): ShareLink | null {
  const raw = record(value);
  const url = text(raw?.url, 300);
  if (!raw || !url || !url.startsWith("https://")) return null;
  const expiresAt = raw.expiresAt === null || raw.expiresAt === undefined ? null : instant(raw.expiresAt);
  return raw.expiresAt != null && !expiresAt ? null : { url, expiresAt };
}

export function parseSharedList(value: unknown): SharedList | null {
  const raw = record(value);
  const name = text(raw?.name, 80);
  const description = optional(raw?.description, 300);
  const itemCount = count(raw?.itemCount);
  const items = parseItems(raw?.items);
  if (!name || description === undefined || itemCount === null || !items) return null;
  return { name, description, itemCount, items };
}

/** What a person reads when a list call fails: plain words for every code the service sends. */
export function listErrorText(code: string, status: number): string {
  const words: Record<string, string> = {
    LIST_LIMIT_REACHED: "You can keep up to 50 lists. Delete one to make a new one.",
    LIST_NAME_TAKEN: "You already have a list with this name. Choose another name.",
    NAME_REQUIRED: "Give the list a name.",
    LIST_FULL: "A list can hold 200 dishes. Remove one to add another.",
    MENU_ITEM_NOT_FOUND: "This dish can't be saved. It may have been removed.",
    LIST_NOT_FOUND: "This list isn't here any more.",
    LIST_ITEM_NOT_FOUND: "This dish is already gone from the list.",
    SHARE_NOT_FOUND: "This list isn't shared.",
    SHARED_LIST_NOT_FOUND: "This list link has expired or was turned off.",
    OWN_LIST: "This is already your list.",
    VALIDATION_FAILED: "Check the name and note, then try again.",
    MALFORMED_REQUEST: "This list link isn't right. Check it and try again.",
    CATALOG_UNAVAILABLE: "Dishes can't be checked right now. Try again in a minute.",
    IDEMPOTENT_REQUEST_IN_PROGRESS: "Still saving. Wait a moment, then check your lists.",
    IDEMPOTENCY_KEY_REUSED: "Something changed while saving. Try again.",
    FEATURE_BUSY: "Food lists are busy right now. Try again in a minute.",
    TOO_MANY_REQUESTS: "Many people are opening lists right now. Try again in a minute.",
    FEATURE_DISABLED: "Food lists are switched off for now.",
    FEATURE_UNAVAILABLE: "Food lists are not available right now. Try again later.",
    FEATURE_NOT_AVAILABLE: "Food lists are coming soon.",
    SESSION_EXPIRED: "Sign in again to use your lists.",
  };
  if (words[code]) return words[code];
  if (status === 429) return "Many people are using lists right now. Try again in a minute.";
  return "Something went wrong. Please try again.";
}
