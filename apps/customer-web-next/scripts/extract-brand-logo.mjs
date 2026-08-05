import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(appRoot, "public/brand/craves-logo.svg");
const targetPath = resolve(appRoot, "public/brand/craves-logo.png");

const source = await readFile(sourcePath, "utf8");
const match = source.match(/href="data:image\/png;base64,([^"]+)"/);
if (!match) {
  throw new Error("Approved embedded Craves PNG was not found in public/brand/craves-logo.svg");
}

const png = Buffer.from(match[1], "base64");
const signature = png.subarray(0, 8).toString("hex");
if (signature !== "89504e470d0a1a0a" || png.length < 10_000) {
  throw new Error("Extracted Craves logo is not a valid production PNG");
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, png);
console.log(`Prepared approved Craves logo: ${png.length} bytes`);
