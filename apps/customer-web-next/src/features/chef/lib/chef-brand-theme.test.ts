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
const theme = readFileSync(new URL("../../../shared/styles/craves-theme.css", import.meta.url), "utf8");
const chefTheme = readFileSync(
  new URL("../styles/chef-mode.css", import.meta.url),
  "utf8",
);

test("chef workspace uses the Customer Flame Red, white and neutral palette", () => {
  for (const color of ["#f62e18", "#c92716", "#000000", "#ffffff"]) {
    assert.match(theme, new RegExp(color, "i"));
  }
  assert.doesNotMatch(theme, /#261a15/i);
  // Page titles carry no eyebrow; colours come from the chef tokens below.
  assert.match(pageHeader, /ChefPageHead/);
  assert.doesNotMatch(pageHeader, /\{eyebrow\}/);
  assert.match(chefTheme, /--chef-surface:\s*#ffffff/i);
  assert.match(chefTheme, /--chef-text:\s*#1a1a1a/i);
  assert.match(chefTheme, /--chef-page:\s*#f1f3f5/i);
  assert.match(chefTheme, /--chef-action:\s*var\(--color-flame-red\)/i);
  assert.match(chefTheme, /--chef-action-hover:\s*var\(--color-contrast-red\)/i);
  // The neutral surface comes from --chef-page and the shared Sheet (approval prompt).
  assert.match(dashboard, /#6B6B6B/i);
  assert.doesNotMatch(
    `${pageHeader}\n${dashboard}`,
    /#6930CA|#F6B545|bg-white\/5|text-slate-300/i,
  );
});
