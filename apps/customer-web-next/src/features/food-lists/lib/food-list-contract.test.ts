import assert from "node:assert/strict";
import test from "node:test";
import { isListId, isShareToken, listErrorText, parseListDetail, parseListSummaries, parseShareLink, parseSharedList } from "./food-list-contract.ts";

const LIST = "8f0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const DISH = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const KITCHEN = "4a000000-0000-4000-8000-000000000001";
const NOW = "2026-11-14T10:00:00Z";
const item = { menuItemId: DISH, itemName: "Thali", kitchenId: KITCHEN, note: null, position: 0, addedAt: NOW, availability: "AVAILABLE", pricePaise: 18000 };
const detail = { id: LIST, name: "Sunday lunch", description: null, itemCount: 1, visibility: "PRIVATE", version: 2, createdAt: NOW, updatedAt: NOW, share: null, items: [item] };

test("share tokens and list ids are checked before any call", () => {
  assert.equal(isShareToken("AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCde"), true);
  for (const bad of ["short", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbC/", 42]) assert.equal(isShareToken(bad), false);
  assert.equal(isListId(LIST), true);
  assert.equal(isListId("abc"), false);
});

test("a list without a note, share or prices still reads; nulls stay null", () => {
  const parsed = parseListDetail({ ...detail, items: [{ ...item, pricePaise: null, availability: "SOMETHING_NEW" }] });
  assert.deepEqual(parsed?.items[0], { menuItemId: DISH, itemName: "Thali", note: null, availability: "UNKNOWN", pricePaise: null });
  assert.equal(parsed?.shared, false);
  assert.equal(parsed?.description, null);
});

test("a shared list says when its link was made; a broken dish breaks the answer", () => {
  assert.deepEqual(parseListDetail({ ...detail, visibility: "SHARED", share: { createdAt: NOW, expiresAt: null, viewCount: 3 } })?.share, { createdAt: NOW, expiresAt: null });
  assert.equal(parseListDetail({ ...detail, items: [{ ...item, menuItemId: "nope" }] }), null);
  assert.equal(parseListDetail({ ...detail, items: [{ ...item, pricePaise: -1 }] }), null);
  assert.equal(parseListDetail({ ...detail, share: { createdAt: "later" } }), null);
});

test("summaries, share links and shared lists", () => {
  assert.deepEqual(parseListSummaries([{ id: LIST, name: "Sunday lunch", description: "For Amma", itemCount: 3, visibility: "SHARED", version: 1, createdAt: NOW, updatedAt: NOW }]), [
    { id: LIST, name: "Sunday lunch", description: "For Amma", itemCount: 3, shared: true, updatedAt: NOW },
  ]);
  assert.equal(parseListSummaries([{ id: LIST, name: "", itemCount: 0, updatedAt: NOW }]), null);
  assert.deepEqual(parseShareLink({ url: "https://craves.in/l/abc", token: "abc", createdAt: NOW, expiresAt: null }), { url: "https://craves.in/l/abc", expiresAt: null });
  assert.equal(parseShareLink({ url: "javascript:alert(1)", expiresAt: null }), null);
  assert.deepEqual(parseSharedList({ name: "Sunday lunch", description: null, itemCount: 1, items: [item] })?.items.length, 1);
  assert.equal(parseSharedList({ name: "Sunday lunch", itemCount: 1, items: "x" }), null);
});

test("every failure reads as plain words, with a fallback", () => {
  assert.match(listErrorText("LIST_NAME_TAKEN", 409), /already have a list/);
  assert.match(listErrorText("ANYTHING", 429), /Try again in a minute/);
  assert.equal(listErrorText("ANYTHING", 500), "Something went wrong. Please try again.");
});
