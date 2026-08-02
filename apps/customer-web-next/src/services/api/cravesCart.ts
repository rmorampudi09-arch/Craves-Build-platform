"use client";

import type { CustomerCart, ServerCartItem } from "@/lib/cart-contract";
import { getDish } from "./dishes";
import fallbackFood from "@/assets/images/food-thali.jpg";
import { assetUrl } from "@/lib/asset-url";

export type CartItem = {
  id: string;
  menuItemId: string;
  name: string;
  chef: string;
  price: number;
  img: string;
  qty: number;
  currency: string;
  lineTotal: number;
};

let cart: CustomerCart | null = null;
let visualItems: CartItem[] = [];
const listeners = new Set<() => void>();

function mapItem(item: ServerCartItem): CartItem {
  const dish = getDish(item.menuItemId);
  return { id: item.id, menuItemId: item.menuItemId, name: item.itemName, chef: item.kitchenName, price: item.unitPrice, img: dish?.img ?? assetUrl(fallbackFood), qty: item.quantity, currency: item.currency, lineTotal: item.lineTotal };
}

function update(next: CustomerCart) {
  cart = next;
  visualItems = next.items.map(mapItem);
  for (const listener of listeners) listener();
}

async function cartRequest(path: string, init?: RequestInit): Promise<CustomerCart> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = await response.json().catch(() => null) as CustomerCart | { message?: string } | null;
  if (!response.ok || !body || !("items" in body)) throw new Error(body && "message" in body ? body.message : "Cart request failed.");
  update(body);
  return body;
}

export async function loadCart(): Promise<CartItem[]> {
  try { await cartRequest("/api/cart"); } catch { cart = null; visualItems = []; for (const listener of listeners) listener(); }
  return visualItems;
}

export function getCart(): CartItem[] { return visualItems; }
export function cartCount(): number { return visualItems.reduce((total, item) => total + item.qty, 0); }
export function cartTotal(): number { return cart?.foodSubtotal ?? visualItems.reduce((total, item) => total + item.lineTotal, 0); }

export async function addToCart(item: { id: string; name: string; chef: string; price: number; img: string }, quantity = 1): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(item.id)) {
    if (process.env.NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK === "true") {
      const existing = visualItems.find((entry) => entry.menuItemId === item.id);
      if (existing) { existing.qty += quantity; existing.lineTotal = existing.qty * existing.price; }
      else visualItems.push({ id: `demo-${item.id}`, menuItemId: item.id, name: item.name, chef: item.chef, price: item.price, img: item.img, qty: quantity, currency: "INR", lineTotal: item.price * quantity });
      for (const listener of listeners) listener();
      return;
    }
    throw new Error("This development catalogue item is not available in the backend.");
  }
  await cartRequest("/api/cart/items", { method: "POST", body: JSON.stringify({ menuItemId: item.id, quantity }) });
}

export async function setQty(id: string, quantity: number): Promise<void> {
  if (id.startsWith("demo-")) {
    if (quantity <= 0) visualItems = visualItems.filter((item) => item.id !== id);
    else { const item = visualItems.find((entry) => entry.id === id); if (item) { item.qty = quantity; item.lineTotal = item.price * quantity; } }
    for (const listener of listeners) listener();
    return;
  }
  if (quantity <= 0) return removeFromCart(id);
  await cartRequest(`/api/cart/items/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ quantity }) });
}

export async function removeFromCart(id: string): Promise<void> {
  if (id.startsWith("demo-")) { visualItems = visualItems.filter((item) => item.id !== id); for (const listener of listeners) listener(); return; }
  await cartRequest(`/api/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function clearCart(): Promise<void> {
  if (visualItems.every((item) => item.id.startsWith("demo-"))) { visualItems = []; cart = null; for (const listener of listeners) listener(); return; }
  await cartRequest("/api/cart", { method: "DELETE" });
}

export async function validateCart(): Promise<CustomerCart> { return cartRequest("/api/cart/validate", { method: "POST" }); }
export function subscribeCart(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
