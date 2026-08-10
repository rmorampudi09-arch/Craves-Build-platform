import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const mobileRoot = path.join(repoRoot, 'apps', 'mobile');
const sourceRoot = path.join(mobileRoot, 'src');
const testsRoot = path.join(mobileRoot, '__tests__');

const ignoredDirectories = new Set([
  'node_modules',
  'build',
  '.gradle',
  '.idea',
  '.bundle',
  'Pods',
]);

const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.gradle',
  '.properties',
  '.xml',
  '.md',
  '.env',
  '.example',
  '.yml',
  '.yaml',
]);

function walk(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function recordMatches(findings, filePath, text, label, regex) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const matcher = new RegExp(regex.source, flags);
  for (const match of text.matchAll(matcher)) {
    findings.push(`${relative(filePath)}:${lineNumber(text, match.index ?? 0)} — ${label}`);
  }
}

const findings = [];
const allMobileFiles = walk(mobileRoot);
const productionSourceFiles = walk(sourceRoot).filter(filePath => {
  const normalized = relative(filePath);
  const extension = path.extname(filePath);
  return (
    ['.ts', '.tsx', '.js', '.jsx'].includes(extension) &&
    !normalized.includes('/__tests__/') &&
    !/\.(?:test|spec)\.[jt]sx?$/.test(normalized)
  );
});

for (const filePath of productionSourceFiles) {
  const text = fs.readFileSync(filePath, 'utf8');
  recordMatches(findings, filePath, text, 'unfinished TODO/FIXME marker in production source', /\b(?:TODO|FIXME)\b/);
  recordMatches(
    findings,
    filePath,
    text,
    'empty event handler in production source',
    /on[A-Z][A-Za-z0-9]*\s*=\s*\{\s*\([^)]*\)\s*=>\s*\{\s*\}\s*\}/,
  );
  recordMatches(
    findings,
    filePath,
    text,
    'explicit not-implemented runtime branch',
    /throw\s+new\s+Error\s*\(\s*['"`](?:not implemented|todo)/i,
  );
  recordMatches(
    findings,
    filePath,
    text,
    'production source imports a mock-only module',
    /(?:from\s+|require\s*\()\s*['"][^'"]*(?:__mocks__|\/mocks?\/)[^'"]*['"]/, 
  );
}

const testFiles = [...walk(sourceRoot), ...walk(testsRoot)].filter(filePath =>
  /\.(?:test|spec)\.[jt]sx?$/.test(filePath),
);
for (const filePath of testFiles) {
  const text = fs.readFileSync(filePath, 'utf8');
  recordMatches(
    findings,
    filePath,
    text,
    'focused or skipped test remains in the production-readiness suite',
    /\b(?:describe|it|test)\.(?:only|skip)\s*\(/,
  );
}

const highConfidenceSecrets = [
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub classic token', /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,255}\b/],
  ['Stripe live secret', /\b[rs]k_live_[A-Za-z0-9]{16,255}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/],
];

for (const filePath of allMobileFiles) {
  const extension = path.extname(filePath);
  const basename = path.basename(filePath);
  if (!textExtensions.has(extension) && !basename.startsWith('.env')) {
    continue;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  for (const [label, pattern] of highConfidenceSecrets) {
    recordMatches(findings, filePath, text, `high-confidence secret pattern: ${label}`, pattern);
  }
}

const packageJsonPath = path.join(mobileRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
for (const scriptName of ['test', 'test:integration', 'test:e2e', 'check:p119', 'check:p120']) {
  if (typeof packageJson.scripts?.[scriptName] !== 'string' || packageJson.scripts[scriptName].trim() === '') {
    findings.push(`apps/mobile/package.json — required regression/static script missing: ${scriptName}`);
  }
}

const androidBuildGradlePath = path.join(mobileRoot, 'android', 'app', 'build.gradle');
const androidBuildGradle = fs.readFileSync(androidBuildGradlePath, 'utf8');
if (/release\s*\{[\s\S]{0,1600}?signingConfig\s+signingConfigs\.debug/.test(androidBuildGradle)) {
  findings.push(
    'apps/mobile/android/app/build.gradle — release build must never fall back to signingConfigs.debug',
  );
}
for (const requiredSigningInput of [
  'CRAVES_ANDROID_KEYSTORE_PATH',
  'CRAVES_ANDROID_KEYSTORE_PASSWORD',
  'CRAVES_ANDROID_KEY_ALIAS',
  'CRAVES_ANDROID_KEY_PASSWORD',
]) {
  if (!androidBuildGradle.includes(requiredSigningInput)) {
    findings.push(
      `apps/mobile/android/app/build.gradle — secure external release-signing input missing: ${requiredSigningInput}`,
    );
  }
}
if (!androidBuildGradle.includes('hasReleaseSigningConfig')) {
  findings.push(
    'apps/mobile/android/app/build.gradle — fail-closed conditional release-signing guard is missing',
  );
}

const visualGuardPaths = [
  'apps/mobile/__tests__/visual/P124CustomerVisualQATargets.test.ts',
  'apps/mobile/__tests__/visual/P125CustomerVisualQATargets.test.ts',
  'apps/mobile/__tests__/visual/P126ChefVisualQATargets.test.ts',
];
for (const guardPath of visualGuardPaths) {
  if (!fs.existsSync(path.join(repoRoot, guardPath))) {
    findings.push(`${guardPath} — required visual-QA guard is missing`);
  }
}

console.log(`P127 static readiness audit inspected ${productionSourceFiles.length} production source files.`);
console.log(`P127 secret scan inspected ${allMobileFiles.length} mobile-workspace files before extension filtering.`);
console.log(`P127 test-focus scan inspected ${testFiles.length} test files.`);

if (findings.length > 0) {
  console.error(`P127 static readiness audit found ${findings.length} blocker(s):`);
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('P127 static readiness audit passed.');
