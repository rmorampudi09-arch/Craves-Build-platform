import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Validate the shipped media and currently linked build, rather than stale
// assets retained by Vite's emptyOutDir:false deployment compatibility policy.
const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public/landing-v20');
const manifest = JSON.parse(await readFile(path.join(root, 'assets/landing-v20/hero-rendition.json'), 'utf8'));
const original = JSON.parse(await readFile(path.join(root, 'assets/landing-v20/manifest.json'), 'utf8'));
const nameMatch = /^hero-web-([a-f0-9]{64})\.mp4$/.exec(manifest.file);
assert.ok(nameMatch, 'Hero video must use an immutable SHA-256 filename');
assert.equal(manifest.sha256, nameMatch[1], 'Hero manifest hash must match its filename');
assert.equal(manifest.sourceSha256, original.sha256, 'Hero rendition must identify the preserved original');
assert.equal(manifest.codec, 'h264', 'Hero rendition must support browser H.264 playback');
assert.equal(manifest.audio, false, 'Background hero must not contain audio');
assert.equal(manifest.fastStart, true, 'Hero rendition must allow progressive startup');
assert.ok(Number.isSafeInteger(manifest.size) && manifest.size > 0 && manifest.size <= 5 * 1024 * 1024,
  'Hero media must stay within its 5 MiB first-load budget');
const video = await readFile(path.join(publicRoot, 'videos', manifest.file));
assert.equal(video.length, manifest.size, 'Hero video byte size differs from its manifest');
assert.equal(createHash('sha256').update(video).digest('hex'), manifest.sha256,
  'Hero video checksum differs from its immutable URL');

// ISO BMFF atoms: check actual ordering and sample description without an
// ffprobe dependency in the customer-web build container.
function atoms(start = 0, end = video.length) {
  const result = [];
  while (start < end) {
    assert.ok(start + 8 <= end, 'Truncated MP4 atom header');
    const type = video.toString('ascii', start + 4, start + 8);
    let size = video.readUInt32BE(start);
    let header = 8;
    if (size === 1) {
      assert.ok(start + 16 <= end, 'Truncated extended MP4 atom header');
      const extended = video.readBigUInt64BE(start + 8);
      assert.ok(extended <= BigInt(Number.MAX_SAFE_INTEGER), 'MP4 atom exceeds supported size');
      size = Number(extended);
      header = 16;
    } else if (size === 0) {
      size = end - start;
    }
    assert.ok(size >= header && start + size <= end, `Invalid MP4 ${type} atom size`);
    result.push({ type, start, payload: start + header, end: start + size });
    start += size;
  }
  return result;
}
function child(parent, type) {
  const matches = atoms(parent.payload, parent.end).filter(atom => atom.type === type);
  assert.equal(matches.length, 1, `Hero video must contain exactly one ${type} atom`);
  return matches[0];
}
const top = atoms();
assert.ok(top.some(atom => atom.type === 'ftyp'), 'Hero media is not an MP4');
const moovs = top.filter(atom => atom.type === 'moov');
const mdats = top.filter(atom => atom.type === 'mdat');
assert.equal(moovs.length, 1, 'Hero MP4 must have exactly one metadata atom');
assert.ok(mdats.length > 0 && moovs[0].start < mdats[0].start,
  'Hero MP4 metadata must precede media bytes for fast startup');
const tracks = atoms(moovs[0].payload, moovs[0].end).filter(atom => atom.type === 'trak');
assert.equal(tracks.length, 1, 'Hero video must have one silent video track');
const mdia = child(tracks[0], 'mdia');
const handler = child(mdia, 'hdlr');
assert.ok(handler.payload + 12 <= handler.end, 'Truncated MP4 handler');
assert.equal(video.toString('ascii', handler.payload + 8, handler.payload + 12), 'vide',
  'Hero background must contain only a video track');
const stsd = child(child(child(mdia, 'minf'), 'stbl'), 'stsd');
assert.ok(stsd.payload + 8 <= stsd.end, 'Truncated MP4 sample description');
assert.equal(video.readUInt32BE(stsd.payload + 4), 1, 'Hero video must have one sample description');
const samples = atoms(stsd.payload + 8, stsd.end);
assert.equal(samples.length, 1, 'Invalid hero video sample descriptions');
assert.ok(['avc1', 'avc3'].includes(samples[0].type), 'Hero video must be encoded as H.264');
assert.ok(samples[0].payload + 78 <= samples[0].end, 'Truncated H.264 sample description');
assert.ok(atoms(samples[0].payload + 78, samples[0].end).some(atom => atom.type === 'avcC'),
  'Hero H.264 configuration is missing');

// The standalone Docker build only includes customer-web-next. Check authoring
// JSX when it is available, and always check the shipped JSX-runtime call below.
const heroSource = await readFile(path.join(root, '../landing-v20/src/components/Hero/Hero.tsx'), 'utf8')
  .catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
if (heroSource !== null) {
  const videoTags = heroSource.match(/<video\b[^>]*>/gs) || [];
  assert.ok(videoTags.length > 0, 'Landing hero must render a video');
  assert.ok(videoTags.every(tag => !/\bposter\s*(?:=|\})/.test(tag)),
    'Landing hero must not render a static poster');
  assert.ok(!heroSource.includes('hero-poster'), 'Landing hero must not use the old fallback picture');
}

const html = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
const queued = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
  .map(match => match[1]);
const visited = new Set();
let activeAssets = '';
let heroVideoFound = false;
for (let index = 0; index < queued.length; index++) {
  const url = queued[index].split('?')[0];
  if (!url.startsWith('/landing-v20/assets/')) continue;
  const relative = url.slice('/landing-v20/'.length);
  assert.ok(!relative.split('/').includes('..'), 'Invalid active landing asset path');
  if (visited.has(relative)) continue;
  visited.add(relative);
  const content = await readFile(path.join(publicRoot, relative), 'utf8');
  activeAssets += content;
  if (relative.endsWith('.js')) {
    const parsed = ts.createSourceFile(relative, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      if (ts.isCallExpression(node) && node.arguments.length >= 2 &&
          ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text === 'video' &&
          ts.isObjectLiteralExpression(node.arguments[1])) {
        const properties = node.arguments[1].properties;
        const named = name => properties.filter(property => ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name);
        const classes = named('className');
        if (classes.some(property => ts.isStringLiteralLike(property.initializer) &&
            property.initializer.text.split(/\s+/).includes('hero__video'))) {
          heroVideoFound = true;
          assert.equal(named('poster').length, 0, 'Shipped hero must not render a static poster');
          assert.ok(!properties.some(property => ts.isSpreadAssignment(property)),
            'Shipped hero video must use explicit properties so the no-poster guard remains enforceable');
          const sources = named('src');
          assert.ok(sources.length === 1 && ts.isStringLiteralLike(sources[0].initializer),
            'Shipped hero must use an explicit immutable video URL');
          assert.equal(sources[0].initializer.text.split('?')[0], `/landing-v20/videos/${manifest.file}`,
            'Shipped hero src must use the verified optimized rendition');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  // Follow shared chunks used by the active entry; do not scan old builds.
  for (const match of content.matchAll(/["']((?:\.\/|\/landing-v20\/assets\/)[^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)) {
    queued.push(match[1].startsWith('./') ? `/landing-v20/assets/${match[1].slice(2)}` : match[1]);
  }
}
assert.ok(visited.size > 0, 'No active landing entry assets were found');
assert.ok(heroVideoFound, 'No active compiled hero video was found');
assert.ok(activeAssets.includes(manifest.file), 'Active landing build does not use the verified optimized hero');
assert.ok(!activeAssets.includes('hero-bg-3.mp4'),
  'Active landing build must not download the 77 MB original video');
console.log(`Landing hero verified: ${manifest.size} bytes, silent H.264, fast start, immutable URL, no poster`);
