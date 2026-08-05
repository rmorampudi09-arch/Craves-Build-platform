import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(appRoot, "public/brand/craves-logo.svg");
const targetPath = resolve(
  appRoot,
  "public/brand/craves-logo-20260805.png",
);

const source = await readFile(sourcePath, "utf8");
const match = source.match(/href="data:image\/png;base64,([^"]+)"/);
if (!match) {
  throw new Error(
    "Approved embedded Craves PNG was not found in public/brand/craves-logo.svg",
  );
}

const png = Buffer.from(match[1], "base64");
const signature = png.subarray(0, 8).toString("hex");
if (signature !== "89504e470d0a1a0a") {
  throw new Error("Extracted Craves logo does not have a valid PNG signature");
}

const decoded = await sharp(png)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = decoded.info;
if (width < 96 || height < 96 || width !== height || channels !== 4) {
  throw new Error("Extracted Craves logo is not a valid square RGBA production image");
}

const sha256 = createHash("sha256").update(png).digest("hex");
await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, png);
console.log(
  `Prepared approved Craves logo: ${width}x${height}, ${png.length} bytes, ${sha256}`,
);
