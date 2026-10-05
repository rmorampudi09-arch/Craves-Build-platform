"use client";

import type { CustomerCart, ServerCartItem } from "@/lib/cart-contract";
import { requestCartKitchenReplacement } from "@/lib/cart-kitchen-replacement";
import type { CustomerOrder } from "@/lib/order-contract";
import { sessionFetch } from "@/services/auth/sessionFetch";
import {
  captureSessionContext,
  isSessionContextCurrent,
  isSessionReady,
  subscribeSession,
  type SessionContext,
} from "@/services/auth/cravesAuth";
import { getDish, loadDish } from "./dishes";

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
const PLACEHOLDER_IMAGE = "/brand/craves-logo.svg";
let cart: CustomerCart | null = null;
let visualItems: CartItem[] = [];
let cartScope = captureSessionContext();
let cartRevision = 0;
let cartLoad: { context: SessionContext; revision: number; pending: Promise<CartItem[]> } | null = null;
let cartMutationTail: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function mapItem(item: ServerCartItem): CartItem {
  const dish = getDish(item.menuItemId);
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

function notify() {
  for (const listener of listeners) listener();
}

function update(next: CustomerCart) {
  cart = next;
  visualItems = next.items.map(mapItem);
  notify();
}

function reset() {
  cart = null;
  visualItems = [];
  notify();
}

subscribeSession(() => {
  const next = captureSessionContext();
  if (next.generation === cartScope.generation && next.identityId === cartScope.identityId) return;
  cartScope = next;
  cartRevision += 1;
  cartLoad = null;
  cartMutationTail = Promise.resolve();
  reset();
});

class CartRequestSupersededError extends Error {
  constructor() {
    super("Your cart changed while this request was running. Please try again.");
  }
}

function requireCartSession(context: SessionContext): void {
  if (!isSessionContextCurrent(context) || !isSessionReady()) throw new CartRequestSupersededError();
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

async function performCartRequest(
  path: string,
  init: RequestInit | undefined,
  context: SessionContext,
  mutation: boolean,
): Promise<CustomerCart> {
  requireCartSession(context);
  const revision = mutation ? ++cartRevision : cartRevision;
  if (mutation) cartLoad = null;
  const response = await sessionFetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | CustomerCart
    | { message?: string }
    | null;
  requireCartSession(context);
  if (revision !== cartRevision) throw new CartRequestSupersededError();
  if (!response.ok || !body || !("items" in body)) {
    throw new Error(
      body && "message" in body && typeof body.message === "string"
        ? body.message
        : "Your cart could not be loaded from Craves.",
    );
  }
  if (mutation) {
    // A read started while the write was pending must not replace its receipt.
    cartRevision += 1;
    cartLoad = null;
  }
  update(body);
  return body;
}

function cartRequest(path: string, init?: RequestInit): Promise<CustomerCart> {
  const context = captureSessionContext();
  const mutation = (init?.method ?? "GET").toUpperCase() !== "GET";
  if (!mutation) return performCartRequest(path, init, context, false);

  // A queued write keeps its original owner. Starting the next write only
  // after the prior receipt avoids treating accepted writes as stale failures.
  const pending = cartMutationTail.then(() => performCartRequest(path, init, context, true));
  cartMutationTail = pending.then(() => undefined, () => undefined);
  return pending;
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
  if (!cart?.items.length) return false;

  if (target.id) {
    return cart.items.some((item) => item.kitchenId !== target.id);
  }

  const targetName = normalizeKitchenName(target.name);
  return cart.items.some(
    (item) => normalizeKitchenName(item.kitchenName) !== targetName,
  );
}

export async function loadCart(): Promise<CartItem[]> {
  const context = captureSessionContext();
  const revision = cartRevision;
  if (cartLoad && isSessionContextCurrent(cartLoad.context) && cartLoad.revision === revision) {
    return [...await cartLoad.pending];
  }
  const pending = (async () => {
    try {
      await cartRequest("/api/cart", { cache: "no-store" });
      return [...visualItems];
    } catch (error) {
      if (!isSessionContextCurrent(context)) return [];
      if (revision !== cartRevision) return [...visualItems];
      reset();
      throw error;
    }
  })().finally(() => {
    if (cartLoad?.pending === pending) cartLoad = null;
  });
  cartLoad = { context, revision, pending };
  return [...await pending];
}

export function getCart(): CartItem[] {
  return [...visualItems];
}

export function cartCount(): number {
  return visualItems.reduce((total, item) => total + item.qty, 0);
}

export function cartTotal(): number {
  return (
    cart?.foodSubtotal ??
    visualItems.reduce((total, item) => total + item.lineTotal, 0)
  );
}

export function cartCurrency(): string {
  return cart?.currency ?? visualItems[0]?.currency ?? "INR";
}

export async function addToCart(
  item: AddCartItem,
  quantity = 1,
): Promise<void> {
  const context = captureSessionContext();
  requireCartSession(context);
  if (!UUID.test(item.id)) {
    throw new Error("This menu item is not valid for the Craves cart.");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error("Choose a quantity between 1 and 50.");
  }

  if (cart === null) {
    await loadCart();
    requireCartSession(context);
  }

  const targetKitchen = await resolveKitchen(item);
  requireCartSession(context);
  if (differentKitchen(targetKitchen)) {
    const currentKitchen = cart?.items[0]?.kitchenName ?? "your current kitchen";
    const replaceCart = await requestCartKitchenReplacement(
      currentKitchen,
      targetKitchen.name,
    );
    requireCartSession(context);
    if (!replaceCart) {
      throw new Error("Your current cart is unchanged.");
    }
    await cartRequest("/api/cart", { method: "DELETE" });
    requireCartSession(context);
  }

  await cartRequest("/api/cart/items", {
    method: "POST",
    body: JSON.stringify({ menuItemId: item.id, quantity }),
  });
}

export async function setQty(id: string, quantity: number): Promise<void> {
  if (!UUID.test(id)) throw new Error("This cart item is invalid.");
  if (quantity <= 0) return removeFromCart(id);
  if (!Number.isInteger(quantity) || quantity > 50) {
    throw new Error("Choose a quantity between 1 and 50.");
  }
  await cartRequest(`/api/cart/items/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ quantity }),
  });
}

export async function removeFromCart(id: string): Promise<void> {
  if (!UUID.test(id)) throw new Error("This cart item is invalid.");
  await cartRequest(`/api/cart/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function clearCart(): Promise<void> {
  await cartRequest("/api/cart", { method: "DELETE" });
}

export async function ensureCheckoutCart(
  orders: CustomerOrder[],
): Promise<boolean> {
  const context = captureSessionContext();
  requireCartSession(context);
  const expected = checkoutCartItems(orders);
  await cartRequest("/api/cart", { cache: "no-store" });
  requireCartSession(context);

  if (cartMatchesCheckout(expected)) return true;

  // Checkout creation may consume or mutate the server cart. Rebuild the cart
  // from the checkout snapshot instead of blocking navigation when any stale
  // cart rows remain.
  await cartRequest("/api/cart", { method: "DELETE" });
  requireCartSession(context);

  for (const item of expected) {
    await cartRequest("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }),
    });
    requireCartSession(context);
  }

  await cartRequest("/api/cart", { cache: "no-store" });
  requireCartSession(context);
  return cartMatchesCheckout(expected);
}

export async function validateCart(): Promise<CustomerCart> {
  return cartRequest("/api/cart/validate", { method: "POST" });
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
