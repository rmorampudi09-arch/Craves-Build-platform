import { advancedCall as call, noBody } from "@/shared/lib/advanced-client";
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

const json = (value: unknown) => JSON.stringify(value);
const id = encodeURIComponent;

export const myLists = () => call<ListSummary[]>("food-lists", parseListSummaries);
export const getList = (listId: string) => call<ListDetail>(`food-lists/${id(listId)}`, parseListDetail);
/** One key per attempt the person makes, reused on a retry, so a retry never makes a second list. */
export const createList = (name: string, description: string, idempotencyKey: string) =>
  call<ListDetail>("food-lists", parseListDetail, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: json({ name, ...(description ? { description } : {}) }),
  });
export const updateList = (listId: string, name: string, description: string) =>
  call<ListDetail>(`food-lists/${id(listId)}`, parseListDetail, { method: "PATCH", body: json({ name, description }) });
export const deleteList = (listId: string) => call(`food-lists/${id(listId)}`, noBody, { method: "DELETE" });
/** Adds the dish, or keeps it once if it is already there. */
export const saveDish = (listId: string, menuItemId: string) =>
  call<ListDetail>(`food-lists/${id(listId)}/items/${id(menuItemId)}`, parseListDetail, { method: "PUT" });
export const removeDish = (listId: string, menuItemId: string) =>
  call<ListDetail>(`food-lists/${id(listId)}/items/${id(menuItemId)}`, parseListDetail, { method: "DELETE" });
/** Makes a new link; an older link of this list stops working. */
export const shareList = (listId: string) => call<ShareLink>(`food-lists/${id(listId)}/share`, parseShareLink, { method: "POST" });
export const stopSharing = (listId: string) => call(`food-lists/${id(listId)}/share`, noBody, { method: "DELETE" });
export const sharedList = (token: string) => call<SharedList>(`shared-food-lists/${id(token)}`, parseSharedList);
export const copySharedList = (token: string) => call<ListDetail>(`shared-food-lists/${id(token)}/copy`, parseListDetail, { method: "POST" });
