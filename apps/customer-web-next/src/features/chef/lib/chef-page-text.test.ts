import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { hasPageText, pageText } from "./chef-page-text.ts";

const CHEF_APP = new URL("../../../app/chef/", import.meta.url);

function pageFiles(dir: URL): URL[] {
  return readdirSync(dir).flatMap((name) => {
    const entry = new URL(name, dir);
    if (statSync(entry).isDirectory()) return pageFiles(new URL(`${name}/`, dir));
    return name === "page.tsx" ? [entry] : [];
  });
}

test("every chef page title, description and back label reads in Telugu and Kannada", () => {
  const missing: string[] = [];
  for (const file of pageFiles(CHEF_APP)) {
    const source = readFileSync(file, "utf8");
    const words = [
      ...[...source.matchAll(/<ChefPageHeader\b[^>]*?\btitle="([^"]+)"/g)].map((match) => match[1]!),
      ...[...source.matchAll(/<ChefPageHeader\b[^>]*?\bdescription="([^"]+)"/g)].map((match) => match[1]!),
      ...[...source.matchAll(/\blabel: "([^"]+)"/g)].map((match) => match[1]!),
    ];
    for (const english of words) if (!hasPageText(english)) missing.push(`${file.pathname.split("/app/chef/")[1]}: "${english}"`);
  }
  assert.deepEqual(missing, []);
});

test("page words fall back to English rather than showing nothing", () => {
  assert.equal(pageText("Bank account", "te"), "బ్యాంక్ ఖాతా");
  assert.equal(pageText("Bank account", "en"), "Bank account");
  assert.equal(pageText("A title nobody listed", "kn"), "A title nobody listed");
});
