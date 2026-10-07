import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// The original PNGs remain the source of truth. WebP exact mode also preserves
// RGB values beneath fully transparent pixels; ordinary lossless mode does not.
const IMAGES = [
  {"source":"images/story-grid/cook-fresh-pot.png","derivative":"images/story-grid/cook-fresh-pot.lossless-eba448c1538f21b4.webp","sourceSha":"dfb557fd6f510a9bf1a1bf7a804fe2094507042442d78f31c6baf1020bf2d371","derivativeSha":"eba448c1538f21b4eb7fe4e122d4096b91a466dd5ea42aed001ab2fc3cf37468","pixelSha":"6677a78d24a79f86d8b996d084840b45e55287f2d29b04cffc2aa1da52c392b4"},
  {"source":"images/story-grid/prep-1.png","derivative":"images/story-grid/prep-1.lossless-5e78de105cf19b84.webp","sourceSha":"c4553ec8cb9b799554a52cc1a36e6359205b3916465a116717de2c871078a021","derivativeSha":"5e78de105cf19b841d3e9f3646e8064d272bbe09ae80b33ffa4a8e82fb840397","pixelSha":"bcb2ecf0a626004ed40c5993b3ec021c2df4dd404942daf679eda96fc9de12bf"},
  {"source":"images/story-grid/cook-pot.png","derivative":"images/story-grid/cook-pot.lossless-89a99aed4375d8eb.webp","sourceSha":"3239ed66bfaa92aec871544518d059d467eaf469d615ca4471ec104c9c9eda3d","derivativeSha":"89a99aed4375d8ebc2ad55494fbd7106eb3032e91b638ede3c4fe22b27df727f","pixelSha":"bd8ea920ca67b6ba88777107c0ef25bf8e2eb9ed91d7b5e302b2d57055faa270"},
  {"source":"images/story-grid/pack-delivery.png","derivative":"images/story-grid/pack-delivery.lossless-c99bb219f7e001d2.webp","sourceSha":"9a63002a7646e20de47b070738cf87a11283f515389e44e5ee06fbe3ebba76cf","derivativeSha":"c99bb219f7e001d28ff951a704682ba78ea9ddcd3df6dbb66946b42885c21356","pixelSha":"6b42ff1b2287a6a95f3f4265f3b1684e14c35ed14d6976abdd72d3b4c8994e0a"},
  {"source":"images/chef-letters/tomato.png","derivative":"images/chef-letters/tomato.lossless-ba4f6f0b072eff7d.webp","sourceSha":"3cb2dada3120aab5689fa0492c40dd4d450760381f73a436013683f43c8ceaec","derivativeSha":"ba4f6f0b072eff7d178f43fa1682d60cd0fd620d15432db1654a942b4d10eb61","pixelSha":"153a6433ffa9f650673214aeb786655985fca36ec0308287919131acefafd1b2"},
  {"source":"images/chef-letters/carrot.png","derivative":"images/chef-letters/carrot.lossless-702ac148667bfe91.webp","sourceSha":"ad5f2861f6d7f71576b1060bf8bfc18c854109f0f296c1c50df0892f493c6d79","derivativeSha":"702ac148667bfe91866f972830f1288cb0bfe7eae44b30f5ed92f5641767a64a","pixelSha":"32bed0f3958314e3b06424a3a3eacf02e1a3d7a67226acd6586abd76321f4bb9"},
  {"source":"images/chef-letters/onion.png","derivative":"images/chef-letters/onion.lossless-4d5b07b8cf0037e7.webp","sourceSha":"e807aa58d7d2782aa0c13ab30c9d09d675d772ec003155f39327f72af5687ca9","derivativeSha":"4d5b07b8cf0037e7fe2c547b18718b2134cd4a455143e4ac3b89b53e5cf0a3db","pixelSha":"fc1ed3d3f4c7c891bb3da9ace55aa58b1c31ee79a0af6e51ecd8942b172b956d"},
  {"source":"images/chef-letters/potato.png","derivative":"images/chef-letters/potato.lossless-ef357b9118819f15.webp","sourceSha":"30fc32ac9359fa7a4accebb4649b2a8dceee1a9e3b6abafe2c134cd7af35e67f","derivativeSha":"ef357b9118819f15549f58ead946f3ff9c8d82be5b542fd2969c4d35055d18b4","pixelSha":"857869adbd605f16196bd7f9cb4fa11f20af1bf3a23a2a906184165eae4f1511"}
];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(scriptDirectory, '../public/landing-v20');
const mode = process.argv[2] ?? '--check';
assert.ok(['--check', '--write'].includes(mode), 'Use --check or --write.');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
let originalBytes = 0;
let derivativeBytes = 0;

for (const image of IMAGES) {
  const original = readFileSync(resolve(publicDirectory, image.source));
  assert.equal(sha256(original), image.sourceSha, `Original PNG changed: ${image.source}`);
  const originalMetadata = await sharp(original).metadata();
  const target = resolve(publicDirectory, image.derivative);
  if (mode === '--write') {
    let encoder = sharp(original);
    if (originalMetadata.icc) encoder = encoder.keepIccProfile();
    if (originalMetadata.exif) encoder = encoder.keepExif();
    if (originalMetadata.xmp) encoder = encoder.keepXmp();
    if (originalMetadata.iptc) encoder = encoder.keepIptc();
    const regenerated = await encoder.webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
    // A toolchain change must be reviewed rather than silently replacing bytes.
    assert.equal(sha256(regenerated), image.derivativeSha, `Encoder output changed: ${image.source}`);
    if (!existsSync(target) || !readFileSync(target).equals(regenerated)) writeFileSync(target, regenerated);
  }
  const derivative = readFileSync(target);
  assert.equal(sha256(derivative), image.derivativeSha, `WebP bytes changed: ${image.derivative}`);
  assert.ok(image.derivative.endsWith(`.lossless-${image.derivativeSha.slice(0, 16)}.webp`), 'Asset filename must contain its byte fingerprint.');
  const derivativeMetadata = await sharp(derivative).metadata();
  for (const field of ['width', 'height', 'orientation', 'icc', 'exif', 'xmp', 'iptc']) {
    assert.deepEqual(derivativeMetadata[field], originalMetadata[field], `${field} changed: ${image.source}`);
  }
  const originalPixels = await sharp(original).ensureAlpha().raw().toBuffer();
  const derivativePixels = await sharp(derivative).ensureAlpha().raw().toBuffer();
  assert.equal(sha256(originalPixels), image.pixelSha, `Original decoded pixels changed: ${image.source}`);
  assert.ok(originalPixels.equals(derivativePixels), `Decoded RGBA pixels changed: ${image.derivative}`);
  const component = image.source.startsWith('images/story-grid/') ? 'StoryVideo/StoryVideo.tsx' : 'ForHomeChefs/ForHomeChefs.tsx';
  const componentSource = readFileSync(resolve(scriptDirectory, `../../landing-v20/src/components/${component}`), 'utf8');
  assert.ok(componentSource.includes(`/${image.derivative}`), `Component does not reference the verified WebP: ${component}`);
  originalBytes += original.length;
  derivativeBytes += derivative.length;
}
console.log('LANDING_IMAGE_DERIVATIVES_VERIFIED ' + JSON.stringify({ images: IMAGES.length, originalBytes, derivativeBytes, savedBytes: originalBytes - derivativeBytes }));
