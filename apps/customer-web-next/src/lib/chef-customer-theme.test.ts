import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(
  new URL("../app/chef/layout.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("every chef route inherits the customer-styled workspace shell", () => {
  assert.match(layout, /className="chef-panel-theme"/);
  assert.match(layout, /workspaceLinks\.map\(\(link\) =>/);
  assert.match(layout, /href=\{link\.href\}/);
  assert.match(layout, /\{ href: "\/chef\/application", label: "Application" \}/);
  assert.match(layout, /\{ href: "\/chef\/kitchen", label: "Kitchen" \}/);
  assert.match(layout, /\{ href: "\/chef\/menu", label: "Menu" \}/);
  assert.match(layout, /\{ href: "\/chef\/orders", label: "Orders" \}/);
  assert.match(layout, /Customer mode/);
});

test("chef theme maps legacy palette classes to customer design tokens", () => {
  assert.match(styles, /\.chef-panel-theme \[class\*="bg-\[#FFF8EC\]"\]/);
  assert.match(styles, /\.chef-panel-theme \[class\*="text-\[#6930CA\]"\]/);
  assert.match(styles, /background: var\(--gradient-primary\) !important/);
  assert.match(styles, /color: var\(--primary\) !important/);
  assert.match(styles, /box-shadow: var\(--shadow-card\)/);
});

test("chef forms always use readable customer-side control colours", () => {
  assert.match(styles, /\.chef-panel-theme :is\(input, textarea, select\)/);
  assert.match(styles, /color: var\(--ink\) !important/);
  assert.match(styles, /background: var\(--card\) !important/);
  assert.match(styles, /:is\(input, textarea, select\):disabled/);
  assert.doesNotMatch(
    styles,
    /\.chef-panel-theme \.text-white\s*\{/,
    "Do not globally recolour white action text; primary buttons must remain readable.",
  );
});
