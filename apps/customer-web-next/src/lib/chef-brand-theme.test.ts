import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("../components/chef-mode-dashboard.tsx", import.meta.url),
  "utf8",
);
const pageHeader = readFileSync(
  new URL("../components/chef-page-header.tsx", import.meta.url),
  "utf8",
);
const theme = readFileSync(new URL("../craves-theme.css", import.meta.url), "utf8");

test("chef workspace uses the canonical Craves brand tokens", () => {
  for (const color of ["#f62e18", "#261a15", "#fff4e8", "#f5b400"]) {
    assert.match(theme, new RegExp(color, "i"));
  }
  assert.match(pageHeader, /bg-ink/);
  assert.match(pageHeader, /text-\[#F5B400\]/);
  assert.match(dashboard, /text-primary/);
  assert.match(dashboard, /bg-secondary/);
  assert.doesNotMatch(
    `${pageHeader}\n${dashboard}`,
    /#6930CA|#F6B545|bg-white\/5|text-slate-300/i,
  );
});
