import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("../components/chef-mode-dashboard.tsx", import.meta.url),
  "utf8",
);

test("chef workspace uses the locked customer palette", () => {
  for (const color of ["#FFF8EC", "#F6B545", "#6930CA"]) {
    assert.match(dashboard, new RegExp(color, "i"));
  }
  assert.doesNotMatch(dashboard, /bg-white\/5|text-slate-300/);
});
