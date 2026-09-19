import {httpClient} from '../../../core/http/httpClient';
import type {CartSnapshot} from '../domain/cartTypes';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export const CART_PREFLIGHT_AVAILABLE = false;

export const CART_PREFLIGHT_ISSUE_CODES = [
  'MENU_ITEM_UNAVAILABLE',
  'DELIVERY_METADATA_MISSING',
  'PRICE_CHANGED',
  'KITCHEN_CHANGED',
  'ITEM_NAME_CHANGED',
] as const;

export type CartPreflightIssueCode =
  (typeof CART_PREFLIGHT_ISSUE_CODES)[number];

export interface CartItemPreflight {
  cartItemId: string;
  menuItemId: string;
  quantity: number;
  activeAndAvailable: boolean;
  blockingIssue: boolean;
  cartUnitPrice: string | null;
  currentUnitPrice: string | null;
  cartKitchenId: string | null;
  currentKitchenId: string | null;
  cartItemName: string | null;
  currentItemName: string | null;
  issues: CartPreflightIssueCode[];
}

export interface CartPreflight {
  cartId: string;
  readyForCurrentCheckoutValidation: boolean;
  hasReviewChanges: boolean;
  itemCount: number;
  blockingIssueCount: number;
  reviewChangeCount: number;
  checkedAt: string;
  items: CartItemPreflight[];
}

const ISSUE_SET = new Set<string>(CART_PREFLIGHT_ISSUE_CODES);
const ITEM_KEYS = new Set([
  'cartItemId',
  'menuItemId',
  'quantity',
  'activeAndAvailable',
  'blockingIssue',
  'cartUnitPrice',
  'currentUnitPrice',
  'cartKitchenId',
  'currentKitchenId',
  'cartItemName',
  'currentItemName',
  'issues',
]);
const PREFLIGHT_KEYS = new Set([
  'cartId',
  'readyForCurrentCheckoutValidation',
  'hasReviewChanges',
  'itemCount',
  'blockingIssueCount',
  'reviewChangeCount',
  'checkedAt',
  'items',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  raw: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function nullableUuid(value: unknown): string | null | undefined {
  if (value == null) return null;
  return uuid(value) ?? undefined;
}

function decimal(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return undefined;
    const normalized = String(value);
    return DECIMAL_PATTERN.test(normalized) ? normalized : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return DECIMAL_PATTERN.test(normalized) ? normalized : undefined;
}

function nullableText(
  value: unknown,
  maximum: number,
): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function parseIssues(value: unknown): CartPreflightIssueCode[] | null {
  if (!Array.isArray(value) || value.length > CART_PREFLIGHT_ISSUE_CODES.length) {
    return null;
  }
  const seen = new Set<string>();
  const issues: CartPreflightIssueCode[] = [];
  for (const issue of value) {
    if (typeof issue !== 'string' || !ISSUE_SET.has(issue) || seen.has(issue)) {
      return null;
    }
    seen.add(issue);
    issues.push(issue as CartPreflightIssueCode);
  }
  return issues;
}

export function parseCartItemPreflight(
  value: unknown,
): CartItemPreflight | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, ITEM_KEYS)) return null;

  const cartItemId = uuid(raw.cartItemId);
  const menuItemId = uuid(raw.menuItemId);
  const cartUnitPrice = decimal(raw.cartUnitPrice);
  const currentUnitPrice = decimal(raw.currentUnitPrice);
  const cartKitchenId = nullableUuid(raw.cartKitchenId);
  const currentKitchenId = nullableUuid(raw.currentKitchenId);
  const cartItemName = nullableText(raw.cartItemName, 240);
  const currentItemName = nullableText(raw.currentItemName, 240);
  const issues = parseIssues(raw.issues);

  if (
    !cartItemId ||
    !menuItemId ||
    typeof raw.quantity !== 'number' ||
    !Number.isSafeInteger(raw.quantity) ||
    raw.quantity < 1 ||
    raw.quantity > 100 ||
    typeof raw.activeAndAvailable !== 'boolean' ||
    typeof raw.blockingIssue !== 'boolean' ||
    cartUnitPrice === undefined ||
    currentUnitPrice === undefined ||
    cartKitchenId === undefined ||
    currentKitchenId === undefined ||
    cartItemName === undefined ||
    currentItemName === undefined ||
    !issues
  ) {
    return null;
  }

  const unavailable = issues.includes('MENU_ITEM_UNAVAILABLE');
  const deliveryMissing = issues.includes('DELIVERY_METADATA_MISSING');
  const expectedBlocking = unavailable || deliveryMissing;
  const reviewChange =
    issues.includes('PRICE_CHANGED') ||
    issues.includes('KITCHEN_CHANGED') ||
    issues.includes('ITEM_NAME_CHANGED');

  if (
    raw.activeAndAvailable === unavailable ||
    raw.blockingIssue !== expectedBlocking ||
    (unavailable &&
      (currentUnitPrice !== null ||
        currentKitchenId !== null ||
        currentItemName !== null)) ||
    (!raw.activeAndAvailable && !unavailable) ||
    (reviewChange && unavailable)
  ) {
    return null;
  }

  return {
    cartItemId,
    menuItemId,
    quantity: raw.quantity,
    activeAndAvailable: raw.activeAndAvailable,
    blockingIssue: raw.blockingIssue,
    cartUnitPrice,
    currentUnitPrice,
    cartKitchenId,
    currentKitchenId,
    cartItemName,
    currentItemName,
    issues,
  };
}

export function parseCartPreflight(value: unknown): CartPreflight | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PREFLIGHT_KEYS) || !Array.isArray(raw.items)) {
    return null;
  }

  const cartId = uuid(raw.cartId);
  const checkedAt = timestamp(raw.checkedAt);
  const items = raw.items.map(parseCartItemPreflight);

  if (
    !cartId ||
    !checkedAt ||
    items.some(item => item === null) ||
    typeof raw.readyForCurrentCheckoutValidation !== 'boolean' ||
    typeof raw.hasReviewChanges !== 'boolean' ||
    typeof raw.itemCount !== 'number' ||
    !Number.isSafeInteger(raw.itemCount) ||
    raw.itemCount < 0 ||
    typeof raw.blockingIssueCount !== 'number' ||
    !Number.isSafeInteger(raw.blockingIssueCount) ||
    raw.blockingIssueCount < 0 ||
    typeof raw.reviewChangeCount !== 'number' ||
    !Number.isSafeInteger(raw.reviewChangeCount) ||
    raw.reviewChangeCount < 0
  ) {
    return null;
  }

  const parsedItems = items as CartItemPreflight[];
  const blockingIssueCount = parsedItems.filter(item => item.blockingIssue).length;
  const reviewChangeCount = parsedItems.filter(item =>
    item.issues.some(issue =>
      issue === 'PRICE_CHANGED' ||
      issue === 'KITCHEN_CHANGED' ||
      issue === 'ITEM_NAME_CHANGED',
    ),
  ).length;

  if (
    raw.itemCount !== parsedItems.length ||
    raw.blockingIssueCount !== blockingIssueCount ||
    raw.reviewChangeCount !== reviewChangeCount ||
    raw.readyForCurrentCheckoutValidation !== (blockingIssueCount === 0) ||
    raw.hasReviewChanges !== (reviewChangeCount > 0)
  ) {
    return null;
  }

  return {
    cartId,
    readyForCurrentCheckoutValidation:
      raw.readyForCurrentCheckoutValidation,
    hasReviewChanges: raw.hasReviewChanges,
    itemCount: raw.itemCount,
    blockingIssueCount: raw.blockingIssueCount,
    reviewChangeCount: raw.reviewChangeCount,
    checkedAt,
    items: parsedItems,
  };
}

export function cartPreflightMatchesSnapshot(
  preflight: CartPreflight,
  snapshot: CartSnapshot,
): boolean {
  if (
    preflight.cartId !== snapshot.cartId ||
    preflight.itemCount !== snapshot.lines.length
  ) {
    return false;
  }

  const byLineId = new Map(snapshot.lines.map(line => [line.lineId, line]));
  return preflight.items.every(item => {
    const line = byLineId.get(item.cartItemId);
    return Boolean(
      line &&
        line.menuItemId === item.menuItemId &&
        line.quantity === item.quantity,
    );
  });
}

export const cartPreflightApi = {
  async inspect(signal?: AbortSignal): Promise<CartPreflight> {
    const response = await httpClient.get<unknown>('/api/v1/cart/preflight', {
      signal,
      dedupeKey: 'customer-cart:preflight',
    });
    const parsed = parseCartPreflight(response);
    if (!parsed) {
      throw new Error('CART_PREFLIGHT_INVALID_RESPONSE');
    }
    return parsed;
  },
};
