#!/usr/bin/env node
// Moves web source files into feature folders (src/features/<feature>/…, src/shared/…) using feature-map.json,
// and rewrites every path that points at a moved file: imports, vi.mock paths, readFileSync(new URL(…)),
// CSS @import/@source and config files.
//
//   node scripts/features/move-to-features.mjs               move files (the one-time migration)
//   node scripts/features/move-to-features.mjs --branch       the same move on a branch started before it, done
//                                                              before merging main so only real conflicts remain
//   node scripts/features/move-to-features.mjs --fix-imports  after merging main: rewrite old paths left in your files
//   add --dry-run to print the counts without writing anything.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "../..");
const SRC = path.join(APP, "src");
const MAP = JSON.parse(fs.readFileSync(path.join(here, "feature-map.json"), "utf8"));
const FIX_ONLY = process.argv.includes("--fix-imports");
const DRY = process.argv.includes("--dry-run");
const BRANCH = process.argv.includes("--branch"); // moving a branch that started before the folders existed
const SKIP = new Set(["node_modules", ".next", ".git", "coverage", "dist", "test-results"]);
const TEXT = /\.(tsx?|mjs|cjs|js|css|json)$/;
const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".css", "/index.ts", "/index.tsx"];
// A quoted string that looks like a file path: starts with @/ ./ ../ or src/ and has no template expression.
const LITERAL = /(["'`])((?:@\/|\.{1,2}\/|src\/)[^"'`\s$]*?)\1/g;
const ESCAPED = /@\\\/((?:[A-Za-z0-9_.\-]+\\\/)*[A-Za-z0-9_.\-]+)/g;
const posix = (p) => p.split(path.sep).join("/");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (full === path.join(APP, "public") || full === here) continue; // static files; this tool itself
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const present = walk(APP);
// The "old tree" that paths were written against. In --fix-imports mode the moved files are gone; add them back virtually.
const oldFiles = new Set(present);
if (FIX_ONLY) for (const rel of Object.keys(MAP)) if (!rel.endsWith("/")) oldFiles.add(path.join(SRC, rel));
const oldDirs = new Set();
for (const file of oldFiles) for (let d = path.dirname(file); d.startsWith(APP); d = path.dirname(d)) oldDirs.add(d);

const FOLDERS = Object.keys(MAP).filter((key) => key.endsWith("/")).sort((a, b) => b.length - a.length);
function newPathOf(absOld) {
  if (!absOld.startsWith(SRC + path.sep)) return absOld;
  const rel = posix(path.relative(SRC, absOld));
  if (rel in MAP) return MAP[rel] === null ? null : path.join(SRC, MAP[rel]);
  const folder = FOLDERS.find((key) => rel.startsWith(key)); // a whole folder that moves, e.g. "lib/referrals/"
  return folder ? path.join(SRC, MAP[folder] + rel.slice(folder.length)) : absOld;
}

// A directory moves only when everything inside it moves to the same new directory.
const dirTarget = new Map();
function newDirOf(absOldDir) {
  if (dirTarget.has(absOldDir)) return dirTarget.get(absOldDir);
  const inside = [...oldFiles].filter((f) => f.startsWith(absOldDir + path.sep));
  let result = absOldDir;
  if (inside.length && !inside.some((f) => newPathOf(f) === f)) {
    const live = inside.map((f) => [f, newPathOf(f)]).filter(([, n]) => n !== null);
    const bases = new Set(live.map(([f, n]) => n.slice(0, n.length - path.relative(absOldDir, f).length - 1)));
    result = bases.size === 1 && live.every(([f, n]) => n.endsWith(path.sep + path.relative(absOldDir, f))) ? [...bases][0] : undefined;
  }
  dirTarget.set(absOldDir, result);
  return result;
}

function resolveOld(spec, fromAbsOld) {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2))
    : spec.startsWith("src/") ? path.join(APP, spec)
    : path.resolve(path.dirname(fromAbsOld), spec);
  // Files outside src/ never move, so the disk is the truth there (public/, repo-root pipelines, scripts).
  const known = (p) => oldFiles.has(p) || (!p.startsWith(SRC + path.sep) && fs.existsSync(p) && fs.statSync(p).isFile());
  for (const ext of EXTS) if (known(base + ext)) return { target: base + ext, ext };
  const dir = base.replace(/[\\/]+$/, "");
  if (oldDirs.has(dir) || (!dir.startsWith(SRC + path.sep) && dir !== SRC && fs.existsSync(dir) && fs.statSync(dir).isDirectory())) return { target: dir, dir: true };
  return null;
}

function render(spec, resolved, fromAbsOld, newFromAbs) {
  let target = resolved.dir ? newDirOf(resolved.target) : newPathOf(resolved.target);
  if (target === resolved.target && newFromAbs === fromAbsOld) return spec; // nothing moved: keep the author's spelling
  if (target === null || target === undefined) {
    throw new Error(`${posix(path.relative(APP, fromAbsOld))}: "${spec}" points at ${posix(path.relative(APP, resolved.target))}, which ${target === null ? "is deleted" : "is split across features"}`);
  }
  if (!resolved.dir && resolved.ext) target = resolved.ext.startsWith("/index") ? path.dirname(target) : target.slice(0, -resolved.ext.length);
  const trailing = spec.endsWith("/") ? "/" : "";
  if (spec.startsWith("@/")) return ("@/" + posix(path.relative(SRC, target)) + trailing).replace(/\/\/$/, "/");
  if (spec.startsWith("src/")) return posix(path.relative(APP, target)) + trailing;
  let rel = posix(path.relative(path.dirname(newFromAbs), target)) || ".";
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel + (trailing && !rel.endsWith("/") ? "/" : "");
}

const writes = new Map(); // destination -> content
const removals = [];
let moved = 0, deleted = 0, rewritten = 0;
for (const file of present) {
  if (path.relative(APP, file) === "components.json") continue; // shadcn CLI aliases: updated below
  const destination = newPathOf(file); // in --fix-imports mode only files a branch added under the old folders still map
  if (destination === null) { removals.push(file); deleted++; continue; }
  if (destination !== file) { removals.push(file); moved++; }
  if (!TEXT.test(file)) { if (destination !== file) writes.set(destination, fs.readFileSync(file)); continue; }
  const text = fs.readFileSync(file, "utf8");
  let changed = text;
  for (const hit of [...text.matchAll(LITERAL)].reverse()) {
    const spec = hit[2];
    const resolved = resolveOld(spec, file);
    if (!resolved) continue;
    const next = render(spec, resolved, file, destination);
    if (next === spec) continue;
    const at = hit.index + 1;
    changed = changed.slice(0, at) + next + changed.slice(at + spec.length);
    rewritten++;
  }
  // Regex literals in source-contract tests spell import paths escaped: /from "@\/lib\/x"/.
  changed = changed.replace(ESCAPED, (whole, body) => {
    const resolved = resolveOld("@/" + body.replace(/\\\//g, "/").replace(/\\\./g, "."), file);
    if (!resolved || resolved.dir) return whole;
    const next = render("@/" + body.replace(/\\\//g, "/").replace(/\\\./g, "."), resolved, file, destination);
    const escaped = next.replace(/\//g, "\\/");
    if (escaped !== whole) rewritten++;
    return escaped;
  });
  if (destination !== file || changed !== text) writes.set(destination, changed);
}

console.log(`${moved} files moved, ${deleted} deleted, ${rewritten} path references updated.`);
// Anything still outside app/, features/, shared/ and tests/ needs a person to pick its feature.
const LEGACY = ["lib", "components", "screens", "services", "hooks", "utils", "constants", "landing-auth", "compat", "registry", "types", "styles", "assets", "context", "config", "layouts", "navigation", "store", "theme", "localization"];
const stranded = present.filter((file) => file.startsWith(SRC + path.sep) && newPathOf(file) === file && LEGACY.includes(posix(path.relative(SRC, file)).split("/")[0]));
if (stranded.length) console.log(`Still in old folders (move each into src/features/<feature>/ or src/shared/):\n  ${stranded.map((f) => posix(path.relative(APP, f))).join("\n  ")}`);
if (DRY) process.exit(0);
for (const file of removals) fs.rmSync(file);
for (const [file, content] of writes) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
const prune = (dir) => { // remove folders the move emptied
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) prune(path.join(dir, entry.name));
  if (dir !== SRC && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
};
prune(SRC);
if (!FIX_ONLY) {
  // shadcn CLI settings: new UI kit components are generated into shared/.
  const file = path.join(APP, "components.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.tailwind.css = "src/shared/styles/styles.css";
  config.aliases = { components: "@/shared/components", utils: "@/shared/lib/utils", ui: "@/shared/ui", lib: "@/shared/lib", hooks: "@/shared/hooks" };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  // Places that name files by pattern rather than by import.
  const edit = (relative, from, to) => {
    const target = path.join(APP, relative);
    if (BRANCH && !fs.existsSync(target)) return;
    const text = fs.readFileSync(target, "utf8");
    if (!text.includes(from)) {
      if (text.includes(to)) return;
      // An older branch may spell these differently; the merge with main brings the right version.
      if (BRANCH) { console.log(`skipped ${relative}: ${from} not found`); return; }
      throw new Error(`${relative}: expected to find ${from}`);
    }
    fs.writeFileSync(target, text.split(from).join(to));
  };
  edit("package.json", "node --test --experimental-strip-types src/lib/*.test.ts", 'node --test --experimental-strip-types \\"src/**/*.test.ts\\"');
  edit("package.json", '"lint": "eslint . --max-warnings=0"', '"lint": "eslint . --max-warnings=0 && node scripts/features/check-boundaries.mjs"');
  edit("vitest.config.ts", 'include: ["src/lib/*.vitest.ts"]', 'include: ["src/**/*.vitest.ts"]');
  edit("scripts/build-landing-auth.mjs", "'landing-auth/", "'features/sign-in/landing-modal/");
  // Source-contract tests that quote another file's import lines or build a path at runtime.
  const signIn = "src/features/sign-in/lib/";
  edit(signIn + "landing-auth-entrypoints.test.ts", "`../../public/landing-v20/assets/${filename}`", "`../../../../public/landing-v20/assets/${filename}`");
  edit(signIn + "landing-auth-entrypoints.test.ts", "source, 'landing-auth\\/AuthModal\\.css'", "source, 'features\\/sign-in\\/landing-modal\\/AuthModal\\.css'");
  edit(signIn + "otp-surface-regression.test.ts", 'import "\\.\\.\\/otp-overrides\\.css"', 'import "\\.\\.\\/features\\/sign-in\\/styles\\/otp-overrides\\.css"');
  const borders = "src/shared/styles/control-border-overrides.test.ts";
  edit(borders, `'import "./craves-theme.css";'`, `'import "../shared/styles/craves-theme.css";'`);
  edit(borders, `'import "../../features/sign-in/styles/otp-overrides.css";'`, `'import "../features/sign-in/styles/otp-overrides.css";'`);
  edit(borders, `'import "./control-border-overrides.css";'`, `'import "../shared/styles/control-border-overrides.css";'`);
  rewriteRepoReferences();
}

// CI pipelines and release scripts name web files by path. Docs, evidence records and the pinned academy curriculum are history: left alone.
function rewriteRepoReferences() {
  const REPO = path.resolve(APP, "../..");
  const listed = (dir, test) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(test).map((name) => path.join(dir, name)) : [];
  const targets = [
    ...listed(REPO, (n) => /^azure-pipelines.*\.ya?ml$/.test(n)),
    // Not web-feature-folders.yml: it names the pre-move src/lib/utils.ts on purpose, to find the move commit.
    ...listed(path.join(REPO, ".github/workflows"), (n) => /\.ya?ml$/.test(n) && n !== "web-feature-folders.yml"),
    ...walkAll(path.join(REPO, "scripts")).filter((f) => /\.(py|sh|mjs|js|ts|mts|json)$/.test(f)),
  ];
  // Folder and wildcard spellings that no single file entry covers.
  const patterns = [
    ["src/components/admin-chef-review-*", "src/features/admin/chef-review/components/admin-chef-review-*"],
    ["src/components/chef-order-*", "src/features/chef/components/chef-order-*"],
    ["src/components/subscription-*", "src/features/meal-plans/components/subscription-*"],
    ["src/lib/academy-*", "src/features/admin/academy/lib/academy-*"],
    ["src/lib/chef-kitchen-*", "src/features/chef/lib/chef-kitchen-*"],
    ["src/screens/OrderHistory/**", "src/features/orders/screens/OrderHistory.tsx"],
    ["src/screens/public/BrowseFoods", "src/features/home/screens"],
    ["src/screens/public/FoodDetails", "src/features/dish/screens"],
    ["src/screens/public/ChefProfile", "src/features/chefs/screens/ChefProfile.tsx"],
    ["src/components/checkout", "src/features/checkout/components"],
    ["src/components/home", "src/features/home/components"],
    ["src/components/order", "src/features/dish/components"],
  ];
  const otherApps = fs.readdirSync(path.join(REPO, "apps")).filter((a) => a !== path.basename(APP));
  const entries = Object.entries(MAP).filter(([, to]) => to).sort((a, b) => b[0].length - a[0].length);
  for (const file of targets) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(path.basename(APP))) continue;
    let next = text;
    for (const [from, to] of entries) {
      next = next.split(`${path.basename(APP)}/src/${from}`).join(`${path.basename(APP)}/src/${to}`);
      // Bare src/… spellings (pipelines that cd into the app), unless another app has the same path.
      if (!otherApps.some((a) => fs.existsSync(path.join(REPO, "apps", a, "src", from)))) {
        next = next.replace(new RegExp(`(?<![\\w./-])src/${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`, "g"), `src/${to}`);
      }
    }
    for (const [from, to] of patterns) next = next.replace(new RegExp(`(customer-web-next/)${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`, "g"), `$1${to}`);
    // The academy workflow runs inside the app folder and names its tests by pattern.
    next = next.split("node --test --experimental-strip-types src/lib/academy-*.test.ts").join("node --test --experimental-strip-types src/features/admin/academy/lib/academy-*.test.ts");
    if (next !== text) fs.writeFileSync(file, next);
  }
  // The release gate runs every web test file; they now live all over src/, not only in src/lib.
  const gate = path.join(REPO, "scripts/launch/launch-regression.py");
  const replaceAll = (text, from, to) => {
    if (!text.includes(from) && !text.includes(to) && !BRANCH) throw new Error(`launch-regression.py: expected ${from}`);
    return text.split(from).join(to);
  };
  if (BRANCH && !fs.existsSync(gate)) return;
  let gateText = fs.readFileSync(gate, "utf8");
  gateText = replaceAll(gateText, '"node scripts/verify-landing-hero.mjs && vitest run && node --test --experimental-strip-types src/lib/*.test.ts"', `'node scripts/verify-landing-hero.mjs && vitest run && node --test --experimental-strip-types "src/**/*.test.ts"'`);
  gateText = replaceAll(gateText, 'sorted((app / "src/lib").glob("*.test.ts"))', 'sorted((app / "src").rglob("*.test.ts"))');
  gateText = replaceAll(gateText, 'Path(source_folder).glob("*.vitest.ts")', 'Path(source_folder).rglob("*.vitest.ts")');
  gateText = replaceAll(gateText, 'json.loads(MANIFEST.read_text())["web"], app / "src/lib")', 'json.loads(MANIFEST.read_text())["web"], app / "src")');
  fs.writeFileSync(gate, gateText);
}

function walkAll(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAll(full, out);
    else out.push(full);
  }
  return out;
}
