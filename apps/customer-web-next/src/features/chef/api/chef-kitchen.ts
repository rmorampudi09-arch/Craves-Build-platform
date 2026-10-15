import { sessionFetch } from "@/shared/lib/session-fetch";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/features/chef/lib/chef-kitchen-types";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), KITCHEN_PHOTOS_LOCKED, SESSION_EXPIRED, or another code. */
export class ChefKitchenError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body;
  const code = response.status === 401 ? "SESSION_EXPIRED" : (body as { code?: unknown } | undefined)?.code;
  throw new ChefKitchenError(typeof code === "string" ? code : "KITCHEN_REQUEST_FAILED", response.status);
}

function kitchenOf(body: unknown): ChefKitchen {
  const kitchen = parseChefKitchen(body);
  if (!kitchen) throw new ChefKitchenError("INVALID_KITCHEN_RESPONSE", 502);
  return kitchen;
}

/** The chef's kitchen, or null before it is set up. */
export async function readChefKitchen(): Promise<ChefKitchen | null> {
  const body = await call("/api/chef/kitchen");
  return body === null ? null : kitchenOf(body);
}

/** One of the 18 drawn faces becomes the chef's picture; answers with the saved kitchen. */
export async function saveChefAvatar(avatarId: string): Promise<ChefKitchen> {
  return kitchenOf(await call("/api/chef/kitchen/chef-avatar", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatarId }) }));
}

/** Fills the next empty kitchen photo slot; answers with the saved kitchen. */
export async function uploadKitchenPhoto(file: File): Promise<ChefKitchen> {
  const body = new FormData();
  body.set("file", file);
  return kitchenOf(await call("/api/chef/kitchen/photos", { method: "POST", body }));
}
