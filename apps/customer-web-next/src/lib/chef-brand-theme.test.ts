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
const chefTheme = readFileSync(
  new URL("../app/chef/chef-mode.css", import.meta.url),
  "utf8",
);

test("chef workspace uses the Customer Flame Red, white and neutral palette", () => {
  for (const color of ["#f62e18", "#c92716", "#000000", "#ffffff"]) {
    assert.match(theme, new RegExp(color, "i"));
  }
  assert.doesNotMatch(theme, /#261a15/i);
  assert.match(pageHeader, /bg-white/);
  assert.match(pageHeader, /text-\[#1A1A1A\]/i);
  assert.match(pageHeader, /text-\[var\(--color-flame-red\)\]/i);
  assert.match(chefTheme, /--chef-action:\s*var\(--color-flame-red\)/i);
  assert.match(chefTheme, /--chef-action-hover:\s*var\(--color-contrast-red\)/i);
  assert.match(dashboard, /#F1F3F5/i);
  assert.match(dashboard, /#1A1A1A/i);
  assert.match(dashboard, /#6B6B6B/i);
  assert.doesNotMatch(
    `${pageHeader}\n${dashboard}`,
    /#6930CA|#F6B545|bg-white\/5|text-slate-300/i,
  );
});
