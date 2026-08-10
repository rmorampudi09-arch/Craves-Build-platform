import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(appRoot, "scripts/assets/landing-reference");
const targetDirectory = resolve(appRoot, "public/landing/reference");

const assets = [
  {
    name: "hero-reference",
    partCount: 4,
    sha256: "eebda2569b9caeabcb8957a7ee10528873c6d910cd8968d004173b7130a0c366",
  },
  {
    name: "how-craves-works-reference",
    partCount: 2,
    sha256: "714c7ddc7d596fb0c0d5243cc691a2817c0cdb4f26b02a24655e39baa8be3c7f",
  },
  {
    name: "why-craves-reference",
    partCount: 2,
    sha256: "f91516c17b3c91861629bd17b627635a13850e97152acca59b16dac18b499b93",
  },
  {
    name: "home-chefs-app-reference",
    partCount: 3,
    sha256: "f0f8536e2298a19e8495b044dda3ac9a668cb36ce13678947f7473365e4cf0d2",
  },
];

await mkdir(targetDirectory, { recursive: true });

for (const asset of assets) {
  const encodedParts = [];
  for (let index = 0; index < asset.partCount; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const partPath = resolve(
      sourceDirectory,
      `${asset.name}.webp.base64.${suffix}`,
    );
    encodedParts.push((await readFile(partPath, "utf8")).trim());
  }

  const image = Buffer.from(encodedParts.join(""), "base64");
  const actualSha256 = createHash("sha256").update(image).digest("hex");
  if (actualSha256 !== asset.sha256) {
    throw new Error(
      `Landing reference asset ${asset.name} has unexpected hash ${actualSha256}`,
    );
  }

  const riff = image.subarray(0, 4).toString("ascii");
  const webp = image.subarray(8, 12).toString("ascii");
  if (riff !== "RIFF" || webp !== "WEBP") {
    throw new Error(`Landing reference asset ${asset.name} is not WebP`);
  }

  await writeFile(resolve(targetDirectory, `${asset.name}.webp`), image);
  console.log(`Prepared landing reference asset: ${asset.name}.webp`);
}
