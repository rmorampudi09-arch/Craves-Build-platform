import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const layout = readFileSync(
  new URL("../../../app/chef/layout.tsx", import.meta.url),
  "utf8",
);
const navigation = readFileSync(
  new URL("../components/chef-workspace-navigation.tsx", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/chef-mode-dashboard.tsx", import.meta.url),
  "utf8",
);
const applicationPage = readFileSync(
  new URL("../../../app/chef/application/page.tsx", import.meta.url),
  "utf8",
);
const kitchenPage = readFileSync(
  new URL("../../../app/chef/kitchen/page.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../../../shared/styles/styles.css", import.meta.url), "utf8");
const chefTheme = postcss.parse(readFileSync(new URL("../styles/chef-mode.css", import.meta.url), "utf8"));

const workspaceRoutes = [
  "/chef/application",
  "/chef/kitchen",
  "/chef/menu",
  "/chef/meal-plans",
  "/chef/capacity",
  "/chef/orders",
  "/chef/earnings",
  "/chef/operations",
] as const;

const dailyDashboardRoutes = [
  "/chef/application",
  "/chef/kitchen",
  "/chef/menu",
  "/chef/orders",
  "/chef/earnings",
] as const;

const deferredDashboardRoutes = [
  "/chef/meal-plans",
  "/chef/capacity",
  "/chef/operations",
] as const;

test("every chef route inherits the responsive Craves workspace shell", () => {
  assert.match(layout, /className="chef-panel-theme[^"]*min-h-screen/);
  assert.match(layout, /chef-panel-header[^"]*bg-white/);
  assert.match(layout, /ChefWorkspaceNavigation/);
  assert.match(layout, /href="\/home"/);
  assert.match(layout, /Back to Craves/);
  assert.match(layout, /max-w-7xl/);
  for (const route of workspaceRoutes) {
    assert.match(navigation, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
});

function navigationStyles(selector: string, width: number) {
  const declarations = new Map<string, string>();
  chefTheme.walkRules(rule => {
    if (rule.selector !== selector) return;
    let parent: postcss.Rule["parent"] | postcss.Root["parent"] = rule.parent;
    while (parent) {
      if (parent.type === "atrule" && parent.name === "media") {
        const maximum = /max-width:\s*(\d+)px/.exec(parent.params);
        if (!maximum || width > Number(maximum[1])) return;
      }
      parent = parent.parent;
    }
    rule.walkDecls(declaration => { declarations.set(declaration.prop, declaration.value); });
  });
  return declarations;
}

for (const width of [390, 768, 1440]) {
  test(`Chef navigation has a non-overlapping layout at ${width}px`, () => {
    const desktop = navigationStyles(".chef-desktop-nav", width);
    const bottom = navigationStyles(".chef-mobile-nav", width);
    if (width < 1024) {
      assert.equal(desktop.get("display"), "none");
      assert.equal(bottom.get("display"), "grid");
      assert.equal(bottom.get("position"), "fixed");
      assert.equal(bottom.get("top"), "auto");
      assert.equal(bottom.get("bottom"), "0");
      assert.equal(bottom.get("max-width"), "32rem");
      assert.match(bottom.get("padding") ?? "", /safe-area-inset-bottom/);
      assert.match(navigationStyles(".chef-panel-theme", width).get("padding-bottom") ?? "", /safe-area-inset-bottom/);
      assert.equal(navigationStyles(".chef-mobile-nav-link", width).get("min-height"), "3.45rem");
    } else {
      assert.equal(desktop.get("display"), "flex");
      assert.equal(bottom.get("display"), "none");
    }
  });
}

test("chef dashboard keeps daily actions visible and defers advanced areas", () => {
  for (const route of dailyDashboardRoutes) {
    assert.match(dashboard, new RegExp(route.replaceAll("/", "\\/")));
  }
  for (const route of deferredDashboardRoutes) {
    assert.doesNotMatch(
      dashboard,
      new RegExp(route.replaceAll("/", "\\/")),
      `${route} should stay out of the simplified daily dashboard`,
    );
  }
});

test("chef workspace shell is wide while focused setup flows stay readable", () => {
  assert.match(layout, /max-w-7xl/);
  assert.match(applicationPage, /max-w-3xl/);
  assert.match(kitchenPage, /max-w-3xl/);
  assert.doesNotMatch(applicationPage, /max-w-7xl/);
  assert.doesNotMatch(kitchenPage, /max-w-7xl/);
});

test("chef theme still maps legacy form classes to canonical customer tokens", () => {
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
