import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetDirectory = resolve(appRoot, "public/landing/reference");

const assets = [
  {
    name: "hero-reference.png",
    url: "https://at.adobe.com/cpTbOwX86crCwT4Q",
    sha256: "51d8f9f7e8fa852fcf0db35f1b52a6b8303e0ea869fb890855cb35156fa68655",
  },
  {
    name: "how-craves-works-reference.png",
    url: "https://at.adobe.com/6s0dh3ynQNlJkrtA",
    sha256: "3e149fda7da24782a129bacdad7d652aae07358e90fd15182ccdf9730aff4796",
  },
  {
    name: "why-craves-reference.png",
    url: "https://at.adobe.com/rCojZEfKoldCU6Pe",
    sha256: "94592a5ac7a5ed5d4466e8ab6104bae0a062f6fb870eafb786ee36692d56f400",
  },
  {
    name: "home-chefs-app-reference.png",
    url: "https://at.adobe.com/LNOfkF4c92uElg8Y",
    sha256: "b3331ae6d53b85ba5face0383b82e25420527e208fcedee36c04a12eb19aa9bd",
  },
];

await mkdir(targetDirectory, { recursive: true });

for (const asset of assets) {
  const response = await fetch(asset.url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Craves-Customer-Web-Build/1.0",
      Accept: "image/png,image/*;q=0.9,*/*;q=0.1",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Unable to fetch landing reference ${asset.name}: HTTP ${response.status}`,
    );
  }

  const image = Buffer.from(await response.arrayBuffer());
  const signature = image.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`Landing reference ${asset.name} is not the approved PNG`);
  }

  const actualSha256 = createHash("sha256").update(image).digest("hex");
  if (actualSha256 !== asset.sha256) {
    throw new Error(
      `Landing reference ${asset.name} has unexpected hash ${actualSha256}`,
    );
  }

  await writeFile(resolve(targetDirectory, asset.name), image);
  console.log(`Prepared approved landing reference: ${asset.name}`);
}
