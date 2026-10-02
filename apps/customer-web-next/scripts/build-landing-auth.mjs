import { build } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'public/landing-auth');
const source = path.join(project, 'src');
const publicNames = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID', 'MESSAGING_SENDER_ID', 'STORAGE_BUCKET'];
const define = { 'process.env.NODE_ENV': JSON.stringify('production') };
const processEnvShim = { NODE_ENV: 'production' };
for (const suffix of publicNames) {
  const name = `NEXT_PUBLIC_FIREBASE_${suffix}`;
  const value = process.env[name] ?? '';
  define[`process.env.${name}`] = JSON.stringify(value);
  processEnvShim[name] = value;
}
await mkdir(output, { recursive: true });
const result = await build({
  configFile: false, root: project, publicDir: false, define,
  resolve: { alias: [
    { find: 'next/image', replacement: path.join(source, 'landing-auth/Image.tsx') },
    { find: '@', replacement: source },
  ], dedupe: ['react', 'react-dom'] },
  build: {
    outDir: output, emptyOutDir: false, write: false, target: 'es2020', minify: true,
    lib: { entry: path.join(source, 'landing-auth/entry.tsx'), formats: ['es'] },
    rolldownOptions: { output: {
      entryFileNames: 'auth-[hash].js',
      chunkFileNames: '[name]-[hash].js',
      intro: `globalThis.process = globalThis.process || { env: {} }; globalThis.process.env = Object.assign({}, ${JSON.stringify(processEnvShim)}, globalThis.process.env);\n`,
    } },
  },
});
const artifacts = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
const entry = artifacts.find((item) => item.type === 'chunk' && item.isEntry);
if (!entry) throw new Error('Missing landing authentication entry');
for (const artifact of artifacts) {
  // The original stylesheet is published below; omit Vite's duplicate/minified CSS.
  if (artifact.type === 'asset' && artifact.fileName.endsWith('.css')) continue;
  await writeFile(path.join(output, artifact.fileName), artifact.type === 'chunk' ? artifact.code : artifact.source);
}

// Publish the original ZIP stylesheet unchanged. Its selectors are already
// scoped to .auth-modal, and the popup renders a portal outside the host node.
const css = await readFile(path.join(source, 'landing-auth/AuthModal.css'));
const cssName = `auth-${createHash('sha256').update(css).digest('hex').slice(0, 16)}.css`;
await writeFile(path.join(output, cssName), css);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ script: `/landing-auth/${entry.fileName}`, style: `/landing-auth/${cssName}` }) + '\n');
console.log('Built the original landing popup with the existing MSG91/session flow.');
