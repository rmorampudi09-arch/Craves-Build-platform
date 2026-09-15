import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../app/admin/academy/academy.css");
test("Academy uses only the Delivery Intelligence palette", () => {
  const allowed = new Set(["#f62e18", "#df2412", "#111111", "#5f6064", "#fff5f3", "#eadfdd", "#f9f7f5", "#ffffff", "#1d9155", "#ec9524", "#286eca"]);
  for (const color of css.match(/#[a-f\d]{3,8}\b/gi) || []) assert.ok(allowed.has(color.toLowerCase()), color);
  assert.ok(!/purple|ca-tone-/i.test(css));
});
test("small primary-action text uses the accessible dark brand red", () => {
  const lum = (hex: string) => {
    const rgb = hex.match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  assert.ok(1.05 / (lum("df2412") + .05) >= 4.5);
  assert.ok((lum("f9f7f5") + .05) / (lum("5f6064") + .05) >= 4.5);
});
test("motion, skeletons, focus and logo preserve the agreed design contracts", () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /:focus-visible/);
  assert.match(read("../components/academy-workspace.tsx"), /<CravesLogo size="md" priority/);
  const ui = read("../app/admin/academy/academy-ui.tsx");
  assert.match(ui, /aria-busy="true"/);
  assert.match(ui, /node\?\.showModal\(\)/);
  assert.match(ui, /previous\.focus\(\)/);
  assert.ok(!read("../app/admin/academy/AcademyDashboard.tsx").includes("window.confirm"));
});
