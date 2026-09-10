import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(appRoot, "../..");
const sourceDirectory = resolve(repositoryRoot, "apps/customer-web-next/scripts/assets");
const targetPath = resolve(appRoot, "public/brand/craves-logo-20260805.png");
const expectedSha256 = "afb6751bb1291f5cba13f3223140cc42229cb00696e025f617766527d6c7fd07";
const sourceParts = [
  "craves-logo-20260805.base64.00",
  "craves-logo-20260805.base64.01",
  "craves-logo-20260805.base64.02",
  "craves-logo-20260805.base64.03",
  "craves-logo-20260805.base64.04a",
  "craves-logo-20260805.base64.04b"
];

const encoded = [];
for (const part of sourceParts) {
  encoded.push((await readFile(resolve(sourceDirectory, part), "utf8")).trim());
}
const png = Buffer.from(encoded.join(""), "base64");
const sha256 = createHash("sha256").update(png).digest("hex");
if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || sha256 !== expectedSha256) {
  throw new Error(`Canonical Craves logo failed integrity validation: ${sha256}`);
}
await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, png);
console.log(`Prepared approved Craves logo ${sha256}`);
