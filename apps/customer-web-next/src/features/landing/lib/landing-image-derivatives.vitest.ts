import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

test('landing image derivatives retain original PNGs, metadata, and every decoded RGBA byte', () => {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/build-landing-image-derivatives.mjs');
  const output = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8', timeout: 25000 });
  expect(output).toContain('LANDING_IMAGE_DERIVATIVES_VERIFIED');
  expect(output).toContain('"images":8');
}, 30000);
