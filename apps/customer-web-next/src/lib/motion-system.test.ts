import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { duration, ease, listItem, spring } from "./motion.ts";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const theme = source("../craves-theme.css");
const overrides = source("../control-border-overrides.css");
const homeStyles = source("../screens/public/BrowseFoods/HomeReference.module.css");

/** Every `:hover` rule must sit inside `@media (hover: hover)` so taps never leave a stuck hover. */
function unguardedHoverRules(css: string): string[] {
  const offenders: string[] = [];
  let depth = 0;
  let hoverDepth: number | null = null;
  let selector = "";
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (char === "{") {
      const head = selector.trim();
      if (/@media \(hover: hover\)/.test(head)) hoverDepth ??= depth;
      else if (/:hover\b/.test(head) && hoverDepth === null) {
        // A reset group that styles hover identically to rest (e.g. `.x, .x:hover`) is harmless.
        const parts = head.split(",").map((part) => part.trim());
        if (!parts.some((part) => !/:hover\b/.test(part))) offenders.push(head);
      }
      depth += 1;
      selector = "";
    } else if (char === "}") {
      depth -= 1;
      if (hoverDepth !== null && depth === hoverDepth) hoverDepth = null;
      selector = "";
    } else if (char === ";") {
      selector = "";
    } else {
      selector += char;
    }
  }
  return offenders;
}

test("motion tokens exist in CSS and mirror framer-motion values", () => {
  assert.match(theme, /--ease-out:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(theme, /--ease-in:\s*cubic-bezier\(0\.4, 0, 1, 1\)/);
  assert.match(theme, /--ease-standard:\s*cubic-bezier\(0\.2, 0, 0, 1\)/);
  for (const [name, ms] of [
    ["micro", 120],
    ["component", 200],
    ["sheet-in", 320],
    ["sheet-out", 220],
    ["nav", 240],
  ] as const) {
    assert.match(theme, new RegExp(`--dur-${name}:\\s*${ms}ms`));
  }
  assert.deepEqual(ease.out, [0.22, 1, 0.36, 1]);
  assert.equal(duration.micro, 0.12);
  assert.equal(duration.sheetIn, 0.32);
  assert.deepEqual(spring.ui, { type: "spring", stiffness: 500, damping: 42, mass: 0.8 });
  // Damping ratio >= 1: UI chrome never overshoots.
  for (const preset of Object.values(spring)) {
    assert.ok(preset.damping / (2 * Math.sqrt(preset.stiffness * preset.mass)) >= 1);
  }
  assert.match(theme, /--motion-fast:/);
});

test("list entry stagger is capped at the first six items", () => {
  assert.equal(listItem(0).initial && typeof listItem(0).initial, "object");
  assert.equal(listItem(5).animate?.transition.delay, 0.1);
  assert.deepEqual(listItem(6), { initial: false });
});

test("button transitions are layered so Tailwind transition utilities win", () => {
  const layered = theme.match(/@layer base \{[\s\S]*?\n\}/g)?.join("\n") ?? "";
  assert.match(layered, /transition-property:\s*background-color, border-color, box-shadow, color, opacity, scale/);
  // The unlayered control rule keeps the look but no longer owns transitions.
  const unlayered = theme.match(/:where\(button, \[role="tab"\], \.craves-button-link, \.chef-panel-nav-link\) \{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(unlayered, /transition/);
  assert.match(unlayered, /background:\s*var\(--color-white\)/);
});

test("hover styles only apply on hover-capable pointers", () => {
  assert.deepEqual(unguardedHoverRules(theme), []);
  assert.deepEqual(unguardedHoverRules(overrides), []);
  assert.deepEqual(unguardedHoverRules(homeStyles), []);
  assert.match(theme, /-webkit-tap-highlight-color:\s*transparent/);
});

test("reduced motion keeps busy spinners alive as a slow pulse", () => {
  assert.match(theme, /@keyframes craves-busy-pulse/);
  assert.match(
    theme,
    /prefers-reduced-motion: reduce[\s\S]*\.animate-spin \{[\s\S]*animation-name:\s*craves-busy-pulse !important[\s\S]*animation-iteration-count:\s*infinite !important/,
  );
  assert.doesNotMatch(homeStyles, /will-change/);
});

test("counts roll quickly without blur and the Veg switch slides without overshoot", () => {
  const count = source("../components/ui/AnimateCount.tsx");
  const toggle = source("../components/ui/AppleSwitch.tsx");
  const checkoutBar = source("../components/cart/CartCheckoutBar.tsx");

  assert.match(count, /<AnimatePresence mode="popLayout" initial=\{false\}/);
  assert.match(count, /duration: 0\.18/);
  assert.match(count, /y: 6 \* direction/);
  assert.doesNotMatch(count, /blur|ANIMATE_COUNT_DURATION_MS = 450/);
  assert.match(checkoutBar, /<AnimateCount format=\{\(value\) => money\(value, currency\)\}>\{total\}<\/AnimateCount>/);

  assert.match(toggle, /useReducedMotion\(\)/);
  assert.match(toggle, /transition=\{reduceMotion \? \{ duration: 0 \} : spring\.ui\}/);
  assert.match(toggle, /animate=\{\{ x: on \? thumbTravel : 0 \}\}/);
  assert.match(toggle, /"!bg-\[#F62E18\]" : "!bg-\[#D9DDE2\]"/);
  assert.doesNotMatch(toggle, /useSpring|grabSpring|backdropFilter|blur\(|width: thumbWidth/);
});
