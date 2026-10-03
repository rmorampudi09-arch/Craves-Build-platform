import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("address management explains and repairs incomplete historical rows", () => {
  const screen = source("../screens/Profile/Addresses.tsx");

  assert.match(screen, /UPDATE REQUIRED/);
  assert.match(screen, /\/default/);
  assert.match(screen, /Set as default/);
  assert.match(screen, /Complete this older saved address needs missing delivery details before checkout|This older saved address needs missing delivery details before checkout/);
  assert.doesNotMatch(screen, /beginEdit\(address\)[\s\S]{0,220}default delivery address/);
});
