import assert from "node:assert/strict";
import test from "node:test";
import { chosenOptionsText, nameWithOptions, parseChosenOptions } from "./order-options.ts";

test("a line without options has none, whatever the field holds", () => {
  for (const value of [undefined, null, "Hot", {}, 3])
    assert.deepEqual(parseChosenOptions(value), []);
  assert.equal(chosenOptionsText(), "");
  assert.equal(nameWithOptions("Thali"), "Thali");
});

test("options keep the chef's words, trimmed, and drop a choice without a name", () => {
  const options = parseChosenOptions([
    { group: " Spice ", choice: " Hot ", price: 0 },
    { group: "Extras", choice: "", price: 10 },
    { group: 5, choice: "Raita", price: 20 },
    null,
  ]);
  assert.deepEqual(options, [
    { group: "Spice", choice: "Hot" },
    { group: "", choice: "Raita" },
  ]);
});

test("choices of one group read together, groups in the order the line lists them", () => {
  const options = parseChosenOptions([
    { group: "Extras", choice: "Raita" },
    { group: "Spice", choice: "Hot" },
    { group: "Extras", choice: "Papad" },
    { group: "", choice: "No onion" },
  ]);
  assert.equal(chosenOptionsText(options), "Extras: Raita, Papad · Spice: Hot · No onion");
  assert.equal(
    nameWithOptions("Thali", options),
    "Thali (Extras: Raita, Papad · Spice: Hot · No onion)",
  );
});

test("a line lists at most 50 options of at most 80 characters, above what checkout allows", () => {
  const many = Array.from({ length: 60 }, (_, index) => ({
    group: "Add-ons",
    choice: `Choice ${index}`,
  }));
  assert.equal(parseChosenOptions(many).length, 50);
  assert.equal(
    parseChosenOptions([{ group: "g".repeat(200), choice: "c".repeat(200) }])[0]?.choice.length,
    80,
  );
});
