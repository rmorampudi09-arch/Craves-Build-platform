import { build } from 'vite';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'public/landing-auth');
const source = path.join(project, 'src');
const publicNames = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID', 'MESSAGING_SENDER_ID', 'STORAGE_BUCKET'];
const define = { 'process.env.NODE_ENV': JSON.stringify('production') };
for (const suffix of publicNames) {
  const name = `NEXT_PUBLIC_FIREBASE_${suffix}`;
  define[`process.env.${name}`] = JSON.stringify(process.env[name] ?? '');
}
await mkdir(output, { recursive: true });
const result = await build({
  configFile: false, root: project, publicDir: false, define,
  resolve: { alias: [
    { find: 'next/image', replacement: path.join(source, 'landing-auth/Image.tsx') },
    { find: '@', replacement: source },
  ], dedupe: ['react', 'react-dom'] },
  build: {
    outDir: output, emptyOutDir: false, target: 'es2020', minify: true,
    lib: { entry: path.join(source, 'landing-auth/entry.tsx'), formats: ['es'] },
    rolldownOptions: { output: { entryFileNames: 'auth-[hash].js', chunkFileNames: '[name]-[hash].js' } },
  },
});
const entry = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output).find((item) => item.type === 'chunk' && item.isEntry);
if (!entry) throw new Error('Missing landing authentication entry');

// Reuse the application's actual theme. Scope every rule to the popup, including
// Tailwind's reset, so loading authentication cannot restyle the landing document.
let css = await readFile(path.join(source, 'styles.css'), 'utf8');
css = css.replace('@source "../src";', '@source "./components/auth";\n@source "./components/brand/CravesLogo.tsx";');
for (const filename of ['craves-theme.css', 'otp-overrides.css', 'control-border-overrides.css']) {
  css += '\n' + await readFile(path.join(source, filename), 'utf8');
}
const compiled = await postcss([tailwind({ base: project })]).process(css, { from: path.join(source, 'styles.css') });
compiled.root.walkAtRules('layer', (rule) => {
  if (rule.nodes) rule.replaceWith(rule.nodes); else rule.remove();
});
compiled.root.walkRules((rule) => {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'rule' || (parent.type === 'atrule' && /keyframes$/.test(parent.name))) return;
    parent = parent.parent;
  }
  rule.selectors = rule.selectors.map((selector) => {
    if (/^(?::root|:host|html|body)(?=$|[\s.:#[])/.test(selector)) {
      return selector.replace(/^(?::root|:host|html|body)/, '#craves-customer-auth');
    }
    return `#craves-customer-auth ${selector}`;
  });
});
const scoped = compiled.root.toString() + `
#craves-customer-auth { position: fixed; inset: 0; z-index: 1000; min-height: 0; --font-craves-display: Inter; --font-craves-body: Inter; font-family: Inter, system-ui, sans-serif; }
#craves-customer-auth > div { background: rgb(0 0 0 / .25); backdrop-filter: blur(16px); }
#craves-customer-auth [role=dialog] { background: #fff; max-height: 95dvh; overscroll-behavior: contain; }
#craves-customer-auth [aria-pressed=true] { background: #F62E18 !important; border-color: #F62E18 !important; color: #fff !important; }
#craves-customer-auth p { line-height: inherit; }
`;
const cssName = `auth-${createHash('sha256').update(scoped).digest('hex').slice(0, 16)}.css`;
await writeFile(path.join(output, cssName), scoped);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ script: `/landing-auth/${entry.fileName}`, style: `/landing-auth/${cssName}` }) + '\n');
console.log('Built isolated landing popup from the current shared customer/chef authentication components.');
