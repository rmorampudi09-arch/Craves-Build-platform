import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(appRoot, "scripts/assets");
const targetPath = resolve(
  appRoot,
  "public/brand/craves-logo-20260805.png",
);
const expectedSha256 = "afb6751bb1291f5cba13f3223140cc42229cb00696e025f617766527d6c7fd07";
const sourceParts = [
  "craves-logo-20260805.base64.00",
  "craves-logo-20260805.base64.01",
  "craves-logo-20260805.base64.02",
  "craves-logo-20260805.base64.03",
  "craves-logo-20260805.base64.04",
];

const encodedParts = await Promise.all(
  sourceParts.map(async (name) =>
    (await readFile(resolve(sourceDirectory, name), "utf8")).trim(),
  ),
);
const png = Buffer.from(encodedParts.join(""), "base64");
const signature = png.subarray(0, 8).toString("hex");
const sha256 = createHash("sha256").update(png).digest("hex");
if (signature !== "89504e470d0a1a0a" || sha256 !== expectedSha256) {
  throw new Error("Canonical Craves logo source is incomplete or has changed");
}

const decoded = await sharp(png)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = decoded.info;
if (width !== 112 || height !== 112 || channels !== 4) {
  throw new Error("Canonical Craves logo is not the approved 112x112 RGBA image");
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, png);
console.log(
  `Prepared approved Craves logo: ${width}x${height}, ${png.length} bytes, ${sha256}`,
);
