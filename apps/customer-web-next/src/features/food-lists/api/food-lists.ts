import { sessionFetch } from "@/shared/lib/session-fetch";
import {
  parseListDetail,
  parseListSummaries,
  parseShareLink,
  parseSharedList,
  type ListDetail,
  type ListSummary,
  type ShareLink,
  type SharedList,
} from "../lib/food-list-contract";

export type ListResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string };

const done = () => true as const;

async function call<T>(path: string, parse: (body: unknown) => T | null, init: RequestInit = {}): Promise<ListResult<T>> {
  try {
    const response = await sessionFetch(`/api/advanced/${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const code = body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : "REQUEST_FAILED";
      return { ok: false, status: response.status, code };
    }
    const data = parse(body);
    return data === null ? { ok: false, status: 502, code: "INVALID_RESPONSE" } : { ok: true, data };
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }
}

const json = (value: unknown) => JSON.stringify(value);
const id = encodeURIComponent;

export const myLists = () => call<ListSummary[]>("food-lists", parseListSummaries);
export const getList = (listId: string) => call<ListDetail>(`food-lists/${id(listId)}`, parseListDetail);
/** A key for one attempt to make a list. randomUUID needs a secure page and a 2022 browser, so fall back to time and chance. */
export function newAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
/** One key per attempt the person makes, reused on a retry, so a retry never makes a second list. */
export const createList = (name: string, description: string, idempotencyKey: string) =>
  call<ListDetail>("food-lists", parseListDetail, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: json({ name, ...(description ? { description } : {}) }),
  });
export const updateList = (listId: string, name: string, description: string) =>
  call<ListDetail>(`food-lists/${id(listId)}`, parseListDetail, { method: "PATCH", body: json({ name, description }) });
export const deleteList = (listId: string) => call(`food-lists/${id(listId)}`, done, { method: "DELETE" });
/** Adds the dish, or keeps it once if it is already there. */
export const saveDish = (listId: string, menuItemId: string) =>
  call<ListDetail>(`food-lists/${id(listId)}/items/${id(menuItemId)}`, parseListDetail, { method: "PUT" });
export const removeDish = (listId: string, menuItemId: string) =>
  call<ListDetail>(`food-lists/${id(listId)}/items/${id(menuItemId)}`, parseListDetail, { method: "DELETE" });
/** Makes a new link; an older link of this list stops working. */
export const shareList = (listId: string) => call<ShareLink>(`food-lists/${id(listId)}/share`, parseShareLink, { method: "POST" });
export const stopSharing = (listId: string) => call(`food-lists/${id(listId)}/share`, done, { method: "DELETE" });
export const sharedList = (token: string) => call<SharedList>(`shared-food-lists/${id(token)}`, parseSharedList);
export const copySharedList = (token: string) => call<ListDetail>(`shared-food-lists/${id(token)}/copy`, parseListDetail, { method: "POST" });
