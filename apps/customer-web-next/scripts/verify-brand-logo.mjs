import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const path = resolve("public/brand/craves-logo.png");
const png = await readFile(path);
const signature = png.subarray(0, 8).toString("hex");
if (signature !== "89504e470d0a1a0a" || png.length < 10_000) {
  throw new Error("Generated Craves brand logo is missing or invalid");
}
console.log(`Verified Craves brand logo: ${png.length} bytes`);
