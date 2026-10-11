"use client";

import type { CustomerCart, ServerCartItem } from "@/lib/cart-contract";
import { requestCartKitchenReplacement } from "@/lib/cart-kitchen-replacement";
import type { CustomerOrder } from "@/lib/order-contract";
import { sessionFetch } from "@/services/auth/sessionFetch";
import { getDish, loadDish, loadKitchenMenu } from "./dishes";

export type CartItem = {
  id: string;
  menuItemId: string;
  kitchenId: string;
  name: string;
  chef: string;
  price: number;
  img: string;
  imageIsPlaceholder: boolean;
  qty: number;
  currency: string;
  lineTotal: number;
};

type CheckoutCartItem = {
  menuItemId: string;
  quantity: number;
};

type AddCartItem = {
  id: string;
  name: string;
  chef: string;
  price: number;
  img: string;
  kitchenId?: string;
};

type KitchenReference = {
  id: string | null;
  name: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The customer chose "Keep current cart": a neutral outcome, not a failure. */
export class CartKeptError extends Error {}
/** A cart request Craves refused, with its HTTP status (0 when the request never completed). */
class CartRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
/** A stalled request must not hold every later cart write in the queue. */
const CART_REQUEST_TIMEOUT_MS = 20_000;
const PLACEHOLDER_IMAGE = "/brand/craves-logo.svg";
const MAX_QUANTITY = 50;
/** Quick +/- taps on one dish are coalesced into a single write. */
const QUANTITY_WRITE_DELAY_MS = 250;

/** The last cart Craves confirmed; it is the source of truth. */
let cart: CustomerCart | null = null;
let visualItems: CartItem[] = [];
const listeners = new Set<() => void>();

/**
 * A quantity the customer asked for that Craves has not confirmed yet, keyed by
 * menu item. It renders at once over the confirmed cart; once written it is
 * dropped (the server reply now shows it) and if the write fails it is dropped
 * too, so the confirmed cart shows again and the caller gets the error.
 */
type Intent = {
  qty: number;
  seq: number;
  /** Present while the line exists only on this device (first add in flight). */
  draft: AddCartItem | null;
  timer: ReturnType<typeof setTimeout> | null;
  done: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};
const intents = new Map<string, Intent>();
let intentSeq = 0;
/** Cart requests run one at a time, so replies apply in the order they were sent. */
let queue: Promise<unknown> = Promise.resolve();

function mapItem(item: ServerCartItem): CartItem {
  const dish = getDish(item.menuItemId) ?? cartPhotos.get(item.menuItemId);
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    kitchenId: item.kitchenId,
    name: item.itemName,
    chef: item.kitchenName,
    price: item.unitPrice,
    img: dish?.img ?? PLACEHOLDER_IMAGE,
    imageIsPlaceholder: !dish || dish.imageIsPlaceholder === true,
    qty: item.quantity,
    currency: item.currency,
    lineTotal: item.lineTotal,
  };
}

/** Photos for cart lines whose dish isn't in the browse cache (this page load), by menu item. */
const cartPhotos = new Map<string, { img: string; imageIsPlaceholder?: boolean }>();
/** Kitchens whose menu is being, or was, read for cart photos: when a read may next be tried. */
const photoKitchens = new Map<string, number>();
const PHOTO_RETRY_MS = 60_000;

/**
 * A cart opened straight from a link (new tab, reload) has no dish photos cached: read each
 * kitchen's menu once and redraw. The menu stays out of the browse cache (Home must not list a
 * far kitchen's dishes). Photos are an enhancement: a failed read keeps the neutral placeholder,
 * never touches the cart and is tried again on a cart load a minute later.
 */
function loadMissingPhotos(items: ServerCartItem[]) {
  for (const { menuItemId, kitchenId } of items) {
    if (!kitchenId || (photoKitchens.get(kitchenId) ?? 0) > Date.now()) continue;
    if (getDish(menuItemId) || cartPhotos.has(menuItemId)) continue;
    photoKitchens.set(kitchenId, Number.POSITIVE_INFINITY);
    loadKitchenMenu(kitchenId, { remember: false }).then(
      (menu) => {
        for (const dish of menu) cartPhotos.set(dish.id, { img: dish.img, imageIsPlaceholder: dish.imageIsPlaceholder });
        // Not while the cart holds none of this kitchen's lines (a kitchen swap in flight).
        if (cart?.items.some((line) => line.kitchenId === kitchenId)) render();
      },
      () => photoKitchens.set(kitchenId, Date.now() + PHOTO_RETRY_MS),
    );
  }
}

function withQty(line: CartItem, qty: number): CartItem {
  return { ...line, qty, lineTotal: Math.round(line.price * qty * 100) / 100 };
}

function notify() {
  for (const listener of listeners) listener();
}

function render() {
  const confirmed = (cart?.items ?? []).map(mapItem);
  const next: CartItem[] = [];
  for (const line of confirmed) {
    const intent = intents.get(line.menuItemId);
    if (!intent) next.push(line);
    else if (intent.qty > 0) next.push(withQty(line, intent.qty));
  }
  for (const [menuItemId, intent] of intents) {
    if (!intent.draft || intent.qty < 1) continue;
    if (confirmed.some((line) => line.menuItemId === menuItemId)) continue;
    next.push(
      withQty(
        mapItem({
          id: `pending:${menuItemId}`,
          menuItemId,
          kitchenId: intent.draft.kitchenId ?? "",
          itemName: intent.draft.name,
          kitchenName: intent.draft.chef,
          unitPrice: intent.draft.price,
          currency: cart?.currency ?? "INR",
          quantity: intent.qty,
          lineTotal: 0,
          createdAt: "",
          updatedAt: "",
        }),
        intent.qty,
      ),
    );
  }
  visualItems = next;
  notify();
}

function reset() {
  cart = null;
  render();
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function settle(menuItemId: string, error?: unknown) {
  const intent = intents.get(menuItemId);
  if (!intent) return;
  if (intent.timer) clearTimeout(intent.timer);
  intents.delete(menuItemId);
  render();
  if (error === undefined) intent.resolve();
  else intent.reject(error);
}

function confirmedQty(menuItemId: string): number {
  return cart?.items.find((item) => item.menuItemId === menuItemId)?.quantity ?? 0;
}

/** One write that makes the confirmed line for a dish hold `qty` (runs inside the queue). */
async function writeLine(menuItemId: string, intent: Intent): Promise<void> {
  const line = cart?.items.find((item) => item.menuItemId === menuItemId);
  if (intent.qty === 0) {
    if (line) {
      await send(`/api/cart/items/${encodeURIComponent(line.id)}`, { method: "DELETE" });
    }
  } else if (!line) {
    // A first add, or a line removed meanwhile (an earlier minus, or another device): add it.
    await send("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ menuItemId, quantity: intent.qty }),
    });
    intent.draft = null;
  } else if (line.quantity !== intent.qty) {
    await send(`/api/cart/items/${encodeURIComponent(line.id)}`, {
      method: "PUT",
      body: JSON.stringify({ quantity: intent.qty }),
    });
  }
}

/** Makes the server line for one dish match the newest intent (runs inside the queue). */
async function writeIntent(menuItemId: string): Promise<void> {
  const intent = intents.get(menuItemId);
  if (!intent) return;
  const seq = intent.seq;
  try {
    await writeLine(menuItemId, intent);
  } catch (error) {
    if (intents.get(menuItemId)?.seq !== seq) return; // superseded: the newer intent decides
    // 404/409: the confirmed cart this write was based on is out of date (an order consumed it,
    // or another tab or device changed it). Reload it and apply the same change to it once.
    if (!(error instanceof CartRequestError) || (error.status !== 404 && error.status !== 409)) {
      settle(menuItemId, error);
      return;
    }
    const change = intent.qty - confirmedQty(menuItemId);
    try {
      await send("/api/cart", { cache: "no-store" }, true);
      if (intents.get(menuItemId)?.seq !== seq) return;
      // A remove stays a remove; other changes are re-applied to what the server now has.
      intent.qty = intent.qty === 0 ? 0 : Math.min(MAX_QUANTITY, Math.max(0, confirmedQty(menuItemId) + change));
      await writeLine(menuItemId, intent);
    } catch {
      if (intents.get(menuItemId)?.seq === seq) settle(menuItemId, error);
      return;
    }
  }
  if (intents.get(menuItemId)?.seq === seq) settle(menuItemId);
}

/** Shows a quantity at once and writes it after `delay` ms (later taps restart the wait). */
function intend(
  menuItemId: string,
  qty: number,
  delay: number,
  draft: AddCartItem | null = null,
): Promise<void> {
  let intent = intents.get(menuItemId);
  if (!intent) {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const done = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    // Callers that care await `done`; nobody else should see an unhandled rejection.
    done.catch(() => undefined);
    intent = { qty, seq: 0, draft, timer: null, done, resolve, reject };
    intents.set(menuItemId, intent);
  }
  intent.qty = qty;
  intent.seq = ++intentSeq;
  if (draft) intent.draft = draft;
  if (intent.timer) clearTimeout(intent.timer);
  const pending = intent;
  intent.timer = setTimeout(() => {
    pending.timer = null;
    void serialized(() => writeIntent(menuItemId));
  }, delay);
  render();
  return intent.done;
}

/** Sends any waiting quantity writes now and resolves once Craves confirmed them all. */
async function settleIntents(): Promise<void> {
  for (const [menuItemId, intent] of intents) {
    if (!intent.timer) continue;
    clearTimeout(intent.timer);
    intent.timer = null;
    void serialized(() => writeIntent(menuItemId));
  }
  await Promise.all(Array.from(intents.values(), (intent) => intent.done));
}

/** Forgets unconfirmed quantities when the whole cart is replaced or cleared. */
function dropIntents() {
  if (!intents.size) return;
  for (const intent of intents.values()) {
    if (intent.timer) clearTimeout(intent.timer);
    intent.resolve();
  }
  intents.clear();
  // Show the confirmed cart again, in case the request that follows fails.
  render();
}

function checkoutCartItems(orders: CustomerOrder[]): CheckoutCartItem[] {
  const quantities = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      const quantity = (quantities.get(item.menuItemId) ?? 0) + item.quantity;
      if (!UUID.test(item.menuItemId) || quantity < 1 || quantity > 50) {
        throw new Error("Checkout items could not be restored to the active cart.");
      }
      quantities.set(item.menuItemId, quantity);
    }
  }
  return Array.from(quantities, ([menuItemId, quantity]) => ({
    menuItemId,
    quantity,
  }));
}

function cartMatchesCheckout(items: CheckoutCartItem[]): boolean {
  if (visualItems.length !== items.length) return false;
  const current = new Map(
    visualItems.map((item) => [item.menuItemId, item.qty] as const),
  );
  return items.every(
    (item) => current.get(item.menuItemId) === item.quantity,
  );
}

async function send(
  path: string,
  init?: RequestInit,
  quiet = false,
): Promise<CustomerCart> {
  let response: Response;
  try {
    response = await sessionFetch(path, {
      ...init,
      signal:
        init?.signal ??
        (typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS) : undefined),
      credentials: "same-origin",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new CartRequestError("Craves didn’t respond. Check your connection and try again.", 0);
  }
  const body = (await response.json().catch(() => null)) as
    | CustomerCart
    | { message?: string }
    | null;
  if (!response.ok || !body || !("items" in body)) {
    throw new CartRequestError(
      body && "message" in body && typeof body.message === "string"
        ? body.message
        : "Your cart didn’t load. Check your connection and try again.",
      response.status,
    );
  }
  cart = body;
  if (!quiet) {
    render();
    loadMissingPhotos(body.items);
  }
  return body;
}

function cartRequest(
  path: string,
  init?: RequestInit,
  quiet = false,
): Promise<CustomerCart> {
  return serialized(() => send(path, init, quiet));
}

function normalizeKitchenName(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN");
}

async function resolveKitchen(item: AddCartItem): Promise<KitchenReference> {
  if (item.kitchenId && UUID.test(item.kitchenId)) {
    return { id: item.kitchenId, name: item.chef };
  }

  const cached = getDish(item.id);
  if (cached?.kitchenId && UUID.test(cached.kitchenId)) {
    return { id: cached.kitchenId, name: cached.chef };
  }

  try {
    const resolved = await loadDish(item.id);
    if (resolved.kitchenId && UUID.test(resolved.kitchenId)) {
      return { id: resolved.kitchenId, name: resolved.chef };
    }
  } catch {
    // The add request remains the source of truth if catalog lookup is unavailable.
  }

  return { id: null, name: item.chef };
}

function differentKitchen(target: KitchenReference): boolean {
  if (!visualItems.length) return false;

  if (target.id) {
    return visualItems.some((item) => item.kitchenId !== target.id);
  }

  const targetName = normalizeKitchenName(target.name);
  return visualItems.some(
    (item) => normalizeKitchenName(item.chef) !== targetName,
  );
}

export async function loadCart(): Promise<CartItem[]> {
  try {
    await cartRequest("/api/cart", { cache: "no-store" });
    return [...visualItems];
  } catch (error) {
    reset();
    throw error;
  }
}

export function getCart(): CartItem[] {
  return [...visualItems];
}

export function cartCount(): number {
  return visualItems.reduce((total, item) => total + item.qty, 0);
}

export function cartTotal(): number {
  if (cart && intents.size === 0) return cart.foodSubtotal;
  return (
    Math.round(
      visualItems.reduce((total, item) => total + item.lineTotal, 0) * 100,
    ) / 100
  );
}

export function cartCurrency(): string {
  return cart?.currency ?? visualItems[0]?.currency ?? "INR";
}

export async function addToCart(
  item: AddCartItem,
  quantity = 1,
): Promise<void> {
  if (!UUID.test(item.id)) {
    throw new Error("This menu item is not valid for the Craves cart.");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new Error("Choose a quantity between 1 and 50.");
  }

  if (cart === null) {
    await cartRequest("/api/cart", { cache: "no-store" });
  }

  const targetKitchen = await resolveKitchen(item);
  if (differentKitchen(targetKitchen)) {
    const currentKitchen = visualItems[0]?.chef ?? "your current kitchen";
    const replaceCart = await requestCartKitchenReplacement(
      currentKitchen,
      targetKitchen.name,
    );
    if (!replaceCart) {
      throw new CartKeptError(`No change: your cart from ${currentKitchen} is still saved.`);
    }
    dropIntents();
    // The emptied cart is never shown: one update when the new item lands
    // (no badge vanishing or tab bar flash in between).
    await cartRequest("/api/cart", { method: "DELETE" }, true);
    try {
      await cartRequest("/api/cart/items", {
        method: "POST",
        body: JSON.stringify({ menuItemId: item.id, quantity }),
      });
    } finally {
      render();
    }
    return;
  }

  const current =
    visualItems.find((line) => line.menuItemId === item.id)?.qty ?? 0;
  if (current + quantity > MAX_QUANTITY) {
    throw new Error("Choose a quantity between 1 and 50.");
  }
  // Shows in the cart at once; sent right away and reconciled with the reply.
  return intend(item.id, current + quantity, 0, {
    ...item,
    kitchenId: targetKitchen.id ?? item.kitchenId,
  });
}

export async function setQty(id: string, quantity: number): Promise<void> {
  const line = visualItems.find((item) => item.id === id);
  if (!line) throw new Error("This cart item is invalid.");
  if (quantity <= 0) return removeFromCart(id);
  if (!Number.isInteger(quantity) || quantity > MAX_QUANTITY) {
    throw new Error("Choose a quantity between 1 and 50.");
  }
  return intend(line.menuItemId, quantity, QUANTITY_WRITE_DELAY_MS);
}

export async function removeFromCart(id: string): Promise<void> {
  const line = visualItems.find((item) => item.id === id);
  if (!line) throw new Error("This cart item is invalid.");
  return intend(line.menuItemId, 0, 0);
}

export async function clearCart(): Promise<void> {
  dropIntents();
  await cartRequest("/api/cart", { method: "DELETE" });
}

export async function ensureCheckoutCart(
  orders: CustomerOrder[],
): Promise<boolean> {
  const expected = checkoutCartItems(orders);
  // The checkout snapshot is the authority here.
  dropIntents();
  await cartRequest("/api/cart", { cache: "no-store" });

  if (cartMatchesCheckout(expected)) return true;

  // Checkout creation may consume or mutate the server cart. Rebuild the cart
  // from the checkout snapshot instead of blocking navigation when any stale
  // cart rows remain.
  await cartRequest("/api/cart", { method: "DELETE" });

  for (const item of expected) {
    await cartRequest("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }),
    });
  }

  await cartRequest("/api/cart", { cache: "no-store" });
  return cartMatchesCheckout(expected);
}

export async function validateCart(): Promise<CustomerCart> {
  // Validate exactly what the customer sees: waiting quantity writes go first.
  await settleIntents();
  return cartRequest("/api/cart/validate", { method: "POST" });
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
