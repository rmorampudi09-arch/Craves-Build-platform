import assert from "node:assert/strict";
import test from "node:test";
import { firstTouchUtm, utmFromSearch } from "./chef-application-utm.ts";

const DM = "?utm_source=instagram&utm_medium=dm&utm_campaign=chef_acq&utm_content=reel_42";

test("utm values are read from the landing query, lowercased, and invalid ones dropped", () => {
  assert.deepEqual(utmFromSearch(DM), { source: "instagram", medium: "dm", campaign: "chef_acq", content: "reel_42" });
  assert.deepEqual(utmFromSearch(`?utm_source=%20Instagram%20&utm_campaign=chef%20acq&utm_content=${"x".repeat(65)}`),
    { source: "instagram", medium: null, campaign: null, content: null });
  assert.equal(utmFromSearch("?utm_source=%3Cscript%3E&step=kitchen"), null);
  assert.equal(utmFromSearch(""), null);
});

test("the first link seen in the tab wins and survives URLs without a query", () => {
  const map = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) });
  assert.deepEqual(firstTouchUtm(DM, storage)?.source, "instagram");
  assert.deepEqual(firstTouchUtm("?step=kitchen", storage)?.content, "reel_42");
  assert.deepEqual(firstTouchUtm("?utm_source=facebook", storage)?.source, "instagram");
  assert.equal(firstTouchUtm("", () => ({ getItem: () => null, setItem: () => {} })), null);
});

test("blocked storage still counts the current link", () => {
  const blocked = () => { throw new DOMException("blocked", "SecurityError"); };
  assert.equal(firstTouchUtm(DM, blocked)?.campaign, "chef_acq");
  assert.equal(firstTouchUtm("", blocked), null);
});
