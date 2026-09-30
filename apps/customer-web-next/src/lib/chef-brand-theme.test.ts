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

test("chef workspace keeps branded actions, the shared header and readable neutrals", () => {
  for (const color of ["#f62e18", "#c92716", "#000000", "#ffffff"]) {
    assert.match(theme, new RegExp(color, "i"));
  }
  assert.doesNotMatch(theme, /#261a15/i);
  assert.match(pageHeader, /bg-white/);
  assert.match(pageHeader, /text-\[#1A1A1A\]/i);
  assert.match(pageHeader, /text-\[#178F56\]/i);
  assert.match(dashboard, /bg-\[#F62E18\][^"]*text-white/i);
  assert.match(dashboard, /text-\[#F62E18\]/i);
  assert.match(dashboard, /#F1F3F5/i);
  assert.match(dashboard, /#1A1A1A/i);
  assert.match(dashboard, /#6B6B6B/i);
  assert.doesNotMatch(
    `${pageHeader}\n${dashboard}`,
    /#6930CA|#F6B545|bg-white\/5|text-slate-300/i,
  );
});
