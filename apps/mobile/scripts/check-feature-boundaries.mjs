#!/usr/bin/env node
// Keeps features independent. Reads feature-boundaries.json in the current app folder and fails when:
//  - a feature uses a file inside another feature that is not listed in "allowed"
//  - a lower layer (shared code) uses a feature
//  - a file is added outside the agreed top-level folders ("topLevel")
//  - an "allowed" entry is no longer used (so the list only ever shrinks)
// Run: node scripts/check-feature-boundaries.mjs            (check)
//      node scripts/check-feature-boundaries.mjs --update   (rewrite "allowed" to today's links; review the diff!)
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const CONFIG_FILE = path.join(APP, "feature-boundaries.json");
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
const SRC = path.join(APP, config.src);
const FEATURES = path.join(APP, config.features);
const alias = config.alias ? [config.alias[0], path.join(APP, config.alias[1])] : null; // e.g. ["@/", "src"]
const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".css", "/index.ts", "/index.tsx", "/index.js"];
const LITERAL = /(["'`])((?:@\/|\.{1,2}\/)[^"'`\s$]*?)\1/g;
const posix = (p) => p.split(path.sep).join("/");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function resolve(spec, from) {
  const base = alias && spec.startsWith(alias[0]) ? path.join(alias[1], spec.slice(alias[0].length)) : path.resolve(path.dirname(from), spec);
  for (const ext of EXTS) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  return null;
}

// Which feature (or layer) a file belongs to. Features may have sub-folders; the first folder is the feature.
function owner(file) {
  if (file.startsWith(FEATURES + path.sep)) return "feature:" + path.relative(FEATURES, file).split(path.sep)[0];
  for (const layer of config.lowerLayers ?? []) if (file.startsWith(path.join(APP, layer) + path.sep)) return "layer:" + layer;
  return "free";
}

const files = walk(SRC);
const problems = [];
const found = new Set();
for (const file of files) {
  const rel = posix(path.relative(SRC, file));
  if (config.topLevel && !config.topLevel.includes(rel.split("/")[0])) {
    problems.push(`${posix(path.relative(APP, file))} is outside the agreed folders (${config.topLevel.join(", ")}). Put feature code in ${config.features}/<feature>/ and code used by many features in ${config.sharedHint}.`);
  }
  if (!/\.(tsx?|jsx?|mjs|css)$/.test(file)) continue;
  const from = owner(file);
  if (from === "free") continue;
  for (const hit of fs.readFileSync(file, "utf8").matchAll(LITERAL)) {
    const target = resolve(hit[2], file);
    if (!target) continue;
    const to = owner(target);
    if (!to.startsWith("feature:") || to === from) continue;
    const link = `${from.split(":")[1]} -> ${posix(path.relative(APP, target))}`;
    found.add(link);
    if (!config.allowed.includes(link)) {
      problems.push(from.startsWith("layer:")
        ? `${posix(path.relative(APP, file))} (shared code) uses ${posix(path.relative(APP, target))}. Shared code must not depend on a feature; move the needed piece into ${config.sharedHint}.`
        : `${posix(path.relative(APP, file))} uses ${posix(path.relative(APP, target))} from another feature. Use ${config.sharedHint} for code many features need, or, if this link is intended, add "${link}" to feature-boundaries.json so reviewers see it.`);
    }
  }
}

if (process.argv.includes("--update")) {
  config.allowed = [...found].sort();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  console.log(`feature-boundaries.json: ${config.allowed.length} cross-feature links recorded.`);
  process.exit(0);
}
for (const link of config.allowed) if (!found.has(link)) problems.push(`"${link}" is no longer used. Remove it from feature-boundaries.json.`);
if (problems.length) {
  console.error(`Feature boundaries: ${problems.length} problem(s)\n- ` + [...new Set(problems)].join("\n- "));
  process.exit(1);
}
console.log(`Feature boundaries OK (${found.size} known cross-feature links).`);
