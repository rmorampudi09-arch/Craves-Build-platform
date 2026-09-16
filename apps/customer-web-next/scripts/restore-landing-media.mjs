import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'assets/landing-v20');
const target = path.join(root, 'public/landing-v20/videos/hero-bg-3.mp4');
const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
const filenames = Array.from({ length: 10 }, (_, index) => `hero-bg-3.mp4.part${String(index + 1).padStart(2, '0')}`);

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest('hex');
}

if (manifest.size !== 77733727 || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    manifest.parts.length !== filenames.length || manifest.parts.some((part, index) =>
      part.file !== filenames[index] || !Number.isSafeInteger(part.size) || part.size <= 0 ||
      !/^[a-f0-9]{64}$/.test(part.sha256)) ||
    manifest.parts.reduce((sum, part) => sum + part.size, 0) !== manifest.size) {
  throw new Error('Invalid original landing video manifest');
}

const current = await stat(target).catch(() => null);
if (current?.size === manifest.size && await checksum(target) === manifest.sha256) {
  console.log('Original landing video verified');
} else {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  let output;
  try {
    for (const part of manifest.parts) {
      const file = path.join(source, part.file);
      if ((await stat(file)).size !== part.size || await checksum(file) !== part.sha256) {
        throw new Error(`Original landing media verification failed: ${part.file}`);
      }
    }
    output = createWriteStream(temporary, { flags: 'wx' });
    // Keep asynchronous I/O failures observable throughout concatenation.
    let writeError;
    output.on('error', error => { writeError = error; });
    for (const part of manifest.parts) {
      for await (const data of createReadStream(path.join(source, part.file))) {
        if (writeError) throw writeError;
        if (!output.write(data)) await once(output, 'drain');
      }
    }
    if (writeError) throw writeError;
    const finished = once(output, 'finish');
    output.end();
    await finished;
    if ((await stat(temporary)).size !== manifest.size || await checksum(temporary) !== manifest.sha256) {
      throw new Error('Reconstructed landing video differs from the uploaded original');
    }
    await rename(temporary, target);
    console.log('Original landing video restored and verified');
  } finally {
    output?.destroy();
    await rm(temporary, { force: true });
  }
}
