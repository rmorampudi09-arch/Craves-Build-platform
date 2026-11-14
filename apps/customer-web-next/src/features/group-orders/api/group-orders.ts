import { advancedCall as call, noBody } from "@/shared/lib/advanced-client";
import { parseGroupOrder, parseGroupSummaries, parseSentToCart, type GroupOrder, type GroupSummary, type SentToCart } from "../lib/group-order-contract";

const json = (value: unknown) => JSON.stringify(value);
const at = (groupId: string, rest = "") => `group-orders/${encodeURIComponent(groupId)}${rest}`;
const view = (path: string, init?: RequestInit) => call<GroupOrder>(path, parseGroupOrder, init);

export const myGroups = () => call<GroupSummary[]>("group-orders", parseGroupSummaries);
export const getGroup = (groupId: string) => view(at(groupId));
/** One key per attempt the host makes, reused on a retry, so a retry never starts a second group. */
export const startGroup = (kitchenId: string, title: string, joinWindowMinutes: number, hostName: string, idempotencyKey: string) =>
  view("group-orders", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: json({ kitchenId, title, joinWindowMinutes, ...(hostName ? { hostDisplayName: hostName } : {}) }),
  });
/** Joining a group you are already in just opens it. */
export const joinGroup = (code: string, name: string) => view("group-orders/join", { method: "POST", body: json({ code, ...(name ? { displayName: name } : {}) }) });
export const setMyDish = (groupId: string, menuItemId: string, quantity: number) =>
  view(at(groupId, `/my-items/${encodeURIComponent(menuItemId)}`), { method: "PUT", body: json({ quantity }) });
export const removeMyDish = (groupId: string, menuItemId: string) => view(at(groupId, `/my-items/${encodeURIComponent(menuItemId)}`), { method: "DELETE" });
export const leaveGroup = (groupId: string) => call(at(groupId, "/leave"), noBody, { method: "POST" });
export const removePerson = (groupId: string, participantId: string) => view(at(groupId, `/participants/${encodeURIComponent(participantId)}`), { method: "DELETE" });
export const lockGroup = (groupId: string) => view(at(groupId, "/lock"), { method: "POST" });
export const reopenGroup = (groupId: string, minutes: number) => view(at(groupId, "/unlock"), { method: "POST", body: json({ joinWindowMinutes: minutes }) });
export const cancelGroup = (groupId: string) => view(at(groupId, "/cancel"), { method: "POST" });
/** Fills the host's cart with the whole group's dishes; replaceCart first empties a cart that already has dishes. */
export const sendToCart = (groupId: string, replaceCart: boolean) =>
  call<SentToCart>(at(groupId, "/checkout"), parseSentToCart, { method: "POST", body: json({ applyToCart: true, replaceCart }) });
