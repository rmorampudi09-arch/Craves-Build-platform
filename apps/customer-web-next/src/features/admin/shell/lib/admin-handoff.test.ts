import assert from "node:assert/strict";
import test from "node:test";
import { handOff, handedTo } from "./admin-handoff.ts";

test("search text reaches only the page it was handed to, and only for a few seconds", t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  handOff("riders", "  Ravi  ");
  assert.equal(handedTo("riders"), "Ravi");
  assert.equal(handedTo("riders"), "Ravi", "a second render reads it too");
  assert.equal(handedTo("kitchens"), "");
  t.mock.timers.tick(10_001);
  assert.equal(handedTo("riders"), "");
});
