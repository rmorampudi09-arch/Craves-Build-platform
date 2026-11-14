/** Group orders (M02, /api/v1/advanced/group-orders): what the service sends, read strictly, and the words people see. */

export type GroupStatus = "OPEN" | "LOCKED" | "CHECKED_OUT" | "CANCELLED";
export type GroupItem = { menuItemId: string; itemName: string; quantity: number; unitPricePaise: number; lineTotalPaise: number };
/** participantId is sent only to the host (to remove someone) and to each person for themselves. */
export type GroupPerson = { participantId: string | null; displayName: string; role: "HOST" | "MEMBER"; you: boolean; items: GroupItem[]; subtotalPaise: number };
export type GroupOrder = {
  id: string;
  kitchenId: string;
  title: string;
  status: GroupStatus;
  /** "ABCD-EFGH" and its link, only while people can join. */
  joinCode: string | null;
  shareUrl: string | null;
  joinUntil: string;
  version: number;
  youAreHost: boolean;
  participants: GroupPerson[];
  itemCount: number;
  subtotalPaise: number;
};
export type GroupSummary = { id: string; title: string; status: GroupStatus; joinUntil: string; youAreHost: boolean };
export type SentToCart = { lines: { menuItemId: string; quantity: number }[]; appliedToCart: boolean };

export const GROUP_TITLE_MAX = 60;
export const GROUP_NAME_MAX = 40;
/** The service's limit per person per dish. */
export const MAX_DISH_PER_PERSON = 20;
/** The web cart's limit per dish (cravesCart.ts); the group may send no more of one dish than the cart can hold. */
export const MAX_DISH_PER_ORDER = 50;

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null);
const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() && value.length <= max ? value : null);
const whole = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);
const instant = (value: unknown): string | null => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null);
const STATUSES: readonly GroupStatus[] = ["OPEN", "LOCKED", "CHECKED_OUT", "CANCELLED"];
const status = (value: unknown): GroupStatus | null => (STATUSES.includes(value as GroupStatus) ? (value as GroupStatus) : null);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGroupId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// The service's code alphabet leaves out 0, O, 1, I, L and U.
const CODE = /^([23456789ABCDEFGHJKMNPQRSTVWXYZ]{4})-?([23456789ABCDEFGHJKMNPQRSTVWXYZ]{4})$/;
/** "abcd-efgh" or "ABCDEFGH" as "ABCD-EFGH", or null when it can't be a join code. */
export function joinCodeFrom(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = CODE.exec(raw.trim().toUpperCase());
  return match ? `${match[1]}-${match[2]}` : null;
}

function parseItem(value: unknown): GroupItem | null {
  const raw = record(value);
  const quantity = whole(raw?.quantity);
  const unitPricePaise = whole(raw?.unitPricePaise);
  const lineTotalPaise = whole(raw?.lineTotalPaise);
  const itemName = text(raw?.itemName, 200);
  if (!raw || !isGroupId(raw.menuItemId) || !itemName || !quantity || unitPricePaise === null || lineTotalPaise === null) return null;
  return { menuItemId: raw.menuItemId, itemName, quantity, unitPricePaise, lineTotalPaise };
}

function parsePerson(value: unknown): GroupPerson | null {
  const raw = record(value);
  if (!raw) return null;
  const participantId = raw.participantId == null ? null : isGroupId(raw.participantId) ? raw.participantId : undefined;
  const displayName = text(raw.displayName, 80);
  const items = Array.isArray(raw.items) ? raw.items.map(parseItem) : null;
  const subtotalPaise = whole(raw.subtotalPaise);
  if (participantId === undefined || !displayName || (raw.role !== "HOST" && raw.role !== "MEMBER") || typeof raw.you !== "boolean") return null;
  if (!items || items.some((item) => !item) || subtotalPaise === null) return null;
  return { participantId, displayName, role: raw.role, you: raw.you, items: items as GroupItem[], subtotalPaise };
}

export function parseGroupOrder(value: unknown): GroupOrder | null {
  const raw = record(value);
  if (!raw) return null;
  const title = text(raw.title, 120);
  const groupStatus = status(raw.status);
  const joinUntil = instant(raw.joinUntil);
  const version = whole(raw.version);
  const itemCount = whole(raw.itemCount);
  const subtotalPaise = whole(raw.subtotalPaise);
  const people = Array.isArray(raw.participants) ? raw.participants.map(parsePerson) : null;
  if (!isGroupId(raw.id) || !isGroupId(raw.kitchenId) || !title || !groupStatus || !joinUntil || version === null) return null;
  if (typeof raw.youAreHost !== "boolean" || !people || people.some((person) => !person) || itemCount === null || subtotalPaise === null) return null;
  // Lenient on the invite: without a readable code the page simply shows no invite.
  const joinCode = joinCodeFrom(raw.joinCode);
  const shareUrl = joinCode && typeof raw.shareUrl === "string" && raw.shareUrl.startsWith("https://") ? raw.shareUrl : null;
  return { id: raw.id, kitchenId: raw.kitchenId, title, status: groupStatus, joinCode, shareUrl, joinUntil, version, youAreHost: raw.youAreHost, participants: people as GroupPerson[], itemCount, subtotalPaise };
}

export function parseGroupSummaries(value: unknown): GroupSummary[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const rows = value.map((entry): GroupSummary | null => {
    const raw = record(entry);
    const title = text(raw?.title, 120);
    const groupStatus = status(raw?.status);
    const joinUntil = instant(raw?.joinUntil);
    if (!raw || !isGroupId(raw.id) || !title || !groupStatus || !joinUntil || typeof raw.youAreHost !== "boolean") return null;
    return { id: raw.id, title, status: groupStatus, joinUntil, youAreHost: raw.youAreHost };
  });
  return rows.some((row) => !row) ? null : (rows as GroupSummary[]);
}

export function parseSentToCart(value: unknown): SentToCart | null {
  const raw = record(value);
  const lines = Array.isArray(raw?.lines)
    ? raw.lines.map((line) => {
        const each = record(line);
        const quantity = whole(each?.quantity);
        return each && isGroupId(each.menuItemId) && quantity ? { menuItemId: each.menuItemId, quantity } : null;
      })
    : null;
  if (!raw || !lines || lines.some((line) => !line) || typeof raw.appliedToCart !== "boolean") return null;
  return { lines: lines as SentToCart["lines"], appliedToCart: raw.appliedToCart };
}

/** Dishes the whole group wants more of than one order can hold, with the group's total of each. */
export function overOrderLimit(group: GroupOrder): { itemName: string; quantity: number }[] {
  const totals = new Map<string, { itemName: string; quantity: number }>();
  for (const item of group.participants.flatMap((person) => person.items)) {
    const total = totals.get(item.menuItemId) ?? { itemName: item.itemName, quantity: 0 };
    totals.set(item.menuItemId, { itemName: total.itemName, quantity: total.quantity + item.quantity });
  }
  return [...totals.values()].filter((total) => total.quantity > MAX_DISH_PER_ORDER);
}

/** What a person reads when a group-order call fails: plain words for every code the service sends. */
export function groupErrorText(code: string, httpStatus: number): string {
  const words: Record<string, string> = {
    GROUP_NOT_FOUND: "This group order isn't here. Check the code, or ask the host to send it again.",
    GROUP_CLOSED: "This group order is closed.",
    GROUP_FULL: "This group order is full.",
    REMOVED_FROM_GROUP: "The host removed you from this group order.",
    GROUP_LOCKED: "The host has locked this group order, so dishes can't change now.",
    GROUP_NOT_OPEN: "This group order is no longer open.",
    ITEM_UNAVAILABLE: "This dish can't be ordered right now.",
    ITEM_NOT_FROM_GROUP_KITCHEN: "Add dishes from this group order's kitchen only.",
    TOO_MANY_ITEMS: "You can add up to 20 different dishes.",
    ITEM_NOT_FOUND: "That dish is already gone from your share.",
    HOST_CANNOT_LEAVE: "As the host, cancel the group order instead.",
    PARTICIPANT_NOT_FOUND: "This person has already left.",
    HOST_ONLY: "Only the host can do this.",
    JOIN_WINDOW_REQUIRED: "Choose how long people can join, then try again.",
    GROUP_CHECKED_OUT: "This group order was already sent to the host's cart.",
    TOO_MANY_OPEN_GROUPS: "You have 5 group orders that aren't finished. Send one to your cart or cancel one first.",
    KITCHEN_NOT_FOUND: "This kitchen isn't on Craves any more.",
    LOCK_FIRST: "Lock the group order first.",
    GROUP_EMPTY: "Nobody has added a dish yet.",
    ITEMS_UNAVAILABLE: "Some dishes can't be ordered now. Reopen the group order so people can change them.",
    LINE_TOO_LARGE: "One order can hold at most 50 of a dish. Reopen the group order so people can lower it.",
    HOST_CART_NOT_EMPTY: "Your cart already has dishes.",
    CART_REJECTED: "Your cart didn't take the group's dishes.",
    CART_UNAVAILABLE: "Your cart can't be reached right now.",
    CATALOG_UNAVAILABLE: "Dishes can't be checked right now. Try again in a minute.",
    VERSION_MISMATCH: "The group order just changed. Here it is again.",
    ACCESS_DENIED: "Group orders need a customer account.",
    VALIDATION_FAILED: "Check what you typed, then try again.",
    MALFORMED_REQUEST: "Check what you typed, then try again.",
    IDEMPOTENT_REQUEST_IN_PROGRESS: "Still starting. Wait a moment, then look in your group orders.",
    IDEMPOTENCY_KEY_REUSED: "Something changed while starting. Try again.",
    FEATURE_BUSY: "Group orders are busy right now. Try again in a minute.",
    TOO_MANY_REQUESTS: "Group orders are busy right now. Try again in a minute.",
    FEATURE_DISABLED: "Group orders are switched off for now.",
    FEATURE_UNAVAILABLE: "Group orders are not available right now. Try again later.",
    FEATURE_NOT_AVAILABLE: "Group orders are coming soon.",
    SESSION_EXPIRED: "Sign in again to use group orders.",
  };
  if (words[code]) return words[code];
  if (httpStatus === 429) return "Group orders are busy right now. Try again in a minute.";
  return "Something went wrong. Please try again.";
}

/** "7:30 pm" today, or "Sun 16 Nov, 7:30 pm" on another day, in the reader's own time zone. */
export function joinDeadline(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return at.toDateString() === now.toDateString() ? time : `${at.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
