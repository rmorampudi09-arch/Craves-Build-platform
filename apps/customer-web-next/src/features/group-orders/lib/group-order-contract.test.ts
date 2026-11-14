// Synthetic group orders; no backend is contacted.
import assert from "node:assert/strict";
import test from "node:test";
import { groupErrorText, joinCodeFrom, joinDeadline, overOrderLimit, parseGroupOrder, parseGroupSummaries, parseSentToCart } from "./group-order-contract.ts";

const GROUP = "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d";
const KITCHEN = "4b1c0000-0000-4000-8000-000000000001";
const DISH = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ME = "11111111-1111-4111-8111-111111111111";
const item = (quantity: number) => ({ menuItemId: DISH, itemName: "Roti", quantity, unitPricePaise: 2000, lineTotalPaise: 2000 * quantity, note: null });
const person = (extra: object) => ({ participantId: null, displayName: "Guest 2", role: "MEMBER", you: false, items: [item(2)], subtotalPaise: 4000, ...extra });
const view = {
  id: GROUP, kitchenId: KITCHEN, title: "Friday lunch", status: "OPEN", joinCode: "ABCD-EFGH", shareUrl: "https://craves.in/g/ABCD-EFGH",
  joinUntil: "2026-11-15T14:00:00Z", maxParticipants: 10, participantCount: 2, version: 3, youAreHost: true,
  participants: [person({ participantId: ME, displayName: "Gopi", role: "HOST", you: true }), person({})], itemCount: 4, subtotalPaise: 8000, createdAt: "2026-11-15T13:00:00Z",
};

test("reads a group order, with the fields the service leaves out for some readers", () => {
  const group = parseGroupOrder(view)!;
  assert.equal(group.title, "Friday lunch");
  assert.equal(group.joinCode, "ABCD-EFGH");
  assert.equal(group.participants[0].participantId, ME);
  assert.equal(group.participants[1].participantId, null);
  const locked = parseGroupOrder({ ...view, status: "LOCKED", joinCode: null, shareUrl: null })!;
  assert.deepEqual([locked.status, locked.joinCode, locked.shareUrl], ["LOCKED", null, null]);
  assert.equal(parseGroupOrder({ ...view, shareUrl: "http://evil.example/g/ABCD-EFGH" })!.shareUrl, null);
});

test("refuses broken shapes", () => {
  assert.equal(parseGroupOrder({ ...view, status: "DONE" }), null);
  assert.equal(parseGroupOrder({ ...view, id: "x" }), null);
  assert.equal(parseGroupOrder({ ...view, participants: [person({ participantId: "not-an-id" })] }), null);
  assert.equal(parseGroupOrder({ ...view, participants: [person({ items: [item(0)] })] }), null);
  assert.equal(parseGroupOrder(null), null);
  assert.equal(parseGroupSummaries([{ id: GROUP, title: "Friday lunch", status: "LOCKED", joinUntil: view.joinUntil, youAreHost: false }])!.length, 1);
  assert.equal(parseGroupSummaries([{ id: GROUP }]), null);
  assert.deepEqual(parseSentToCart({ groupOrderId: GROUP, lines: [{ menuItemId: DISH, itemName: "Roti", quantity: 3 }], subtotalPaise: 6000, appliedToCart: true }), { lines: [{ menuItemId: DISH, quantity: 3 }], appliedToCart: true });
  assert.equal(parseSentToCart({ lines: "x", appliedToCart: true }), null);
});

test("join codes use the service's alphabet, any case, with or without the dash", () => {
  assert.equal(joinCodeFrom("abcd-efgh"), "ABCD-EFGH");
  assert.equal(joinCodeFrom(" 2345WXYZ "), "2345-WXYZ");
  assert.equal(joinCodeFrom("ABCD-EFGI"), null); // I is never in a code
  assert.equal(joinCodeFrom("ABC-DEFGH"), null);
  assert.equal(joinCodeFrom("ABCD-EFGH/../x"), null);
  assert.equal(joinCodeFrom(42), null);
});

test("finds dishes the whole group wants more of than one order holds", () => {
  const group = parseGroupOrder({ ...view, participants: [person({ items: [item(20)] }), person({ items: [item(20)] }), person({ items: [item(11)] })] })!;
  assert.deepEqual(overOrderLimit(group), [{ itemName: "Roti", quantity: 51 }]);
  assert.deepEqual(overOrderLimit(parseGroupOrder(view)!), []);
});

test("words for failures and the joining deadline", () => {
  assert.match(groupErrorText("GROUP_FULL", 409), /full/);
  assert.match(groupErrorText("TOO_MANY_OPEN_GROUPS", 409), /cancel one/);
  assert.match(groupErrorText("ANYTHING", 429), /busy/);
  assert.match(groupErrorText("ANYTHING", 500), /Something went wrong/);
  const now = new Date("2026-11-15T10:00:00Z");
  assert.doesNotMatch(joinDeadline("2026-11-15T10:30:00Z", now), /Nov/);
  assert.match(joinDeadline("2026-11-17T10:30:00Z", now), /17 Nov/);
});
