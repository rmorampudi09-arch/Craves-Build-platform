import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(mobileRoot, 'src');
const manifestPath = path.resolve(
  mobileRoot,
  '../../api/apim-api/contracts/mobile-production.v1.json',
);

const fail = message => {
  console.error(`[P119] ${message}`);
  process.exitCode = 1;
};

const toPosix = value => value.split(path.sep).join('/');

function listProductionSourceFiles(root) {
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === '__mocks__') {
          continue;
        }
        visit(absolute);
        continue;
      }
      if (!/\.(?:ts|tsx)$/.test(entry.name)) {
        continue;
      }
      if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
        continue;
      }
      files.push(absolute);
    }
  };
  visit(root);
  return files;
}

if (!fs.existsSync(manifestPath)) {
  fail(`Missing published contract manifest: ${manifestPath}`);
  process.exit();
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.phase !== 'P119') {
  fail('Contract manifest schemaVersion/phase is not the P119 v1 contract.');
}
if (!Array.isArray(manifest.actions) || manifest.actions.length === 0) {
  fail('Contract manifest contains no production actions.');
}

const validMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const validAuth = new Set(['public', 'bearer']);
const ids = new Set();
const expectedBySource = new Map();

for (const action of manifest.actions ?? []) {
  for (const field of [
    'id',
    'source',
    'method',
    'path',
    'auth',
    'requestModel',
    'responseModel',
    'requestValidator',
    'responseValidator',
  ]) {
    if (typeof action[field] !== 'string' || !action[field].trim()) {
      fail(`Contract action is missing ${field}: ${JSON.stringify(action)}`);
    }
  }

  if (ids.has(action.id)) {
    fail(`Duplicate contract action id: ${action.id}`);
  }
  ids.add(action.id);

  if (!validMethods.has(action.method)) {
    fail(`${action.id} has unsupported method ${action.method}.`);
  }
  if (!validAuth.has(action.auth)) {
    fail(`${action.id} has unsupported auth mode ${action.auth}.`);
  }
  if (!action.path.startsWith('/api/v1/')) {
    fail(`${action.id} is not an APIM /api/v1 route: ${action.path}`);
  }
  if (/^https?:\/\//i.test(action.path)) {
    fail(`${action.id} contains an absolute endpoint URL.`);
  }

  const sourcePath = path.join(mobileRoot, action.source);
  if (!fs.existsSync(sourcePath)) {
    fail(`${action.id} points to missing source ${action.source}.`);
    continue;
  }

  const key = `${action.auth}:${action.method}`;
  const expected = expectedBySource.get(action.source) ?? new Map();
  expected.set(key, (expected.get(key) ?? 0) + 1);
  expectedBySource.set(action.source, expected);
}

const callPattern = /\b(httpClient|publicApiClient)\.(get|head|post|put|patch|delete)\s*(?:<[^;()]*?>)?\s*\(/g;
const actualBySource = new Map();
const callBearingSources = new Set();
const productionFiles = listProductionSourceFiles(srcRoot);

for (const absolute of productionFiles) {
  const source = fs.readFileSync(absolute, 'utf8');
  const relative = toPosix(path.relative(mobileRoot, absolute));

  if (!absolute.includes(`${path.sep}core${path.sep}http${path.sep}`)) {
    if (/from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)/.test(source)) {
      fail(`${relative} imports axios outside the centralized core/http transport.`);
    }
  }

  if (/\.azurewebsites\.net|\.azurecontainerapps\.io|x-functions-key|ocp-apim-subscription-key/i.test(source)) {
    fail(`${relative} contains a direct-backend host or forbidden gateway/internal credential literal.`);
  }

  const counts = new Map();
  for (const match of source.matchAll(callPattern)) {
    callBearingSources.add(relative);
    const auth = match[1] === 'publicApiClient' ? 'public' : 'bearer';
    const method = match[2].toUpperCase();
    const key = `${auth}:${method}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size > 0) {
    actualBySource.set(relative, counts);
  }
}

const allSources = new Set([...actualBySource.keys(), ...expectedBySource.keys()]);
for (const source of allSources) {
  const actual = actualBySource.get(source) ?? new Map();
  const expected = expectedBySource.get(source) ?? new Map();
  const keys = new Set([...actual.keys(), ...expected.keys()]);
  for (const key of keys) {
    const actualCount = actual.get(key) ?? 0;
    const expectedCount = expected.get(key) ?? 0;
    if (actualCount !== expectedCount) {
      fail(
        `${source} ${key} call count is ${actualCount}; published contract manifest expects ${expectedCount}.`,
      );
    }
  }
}

for (const item of manifest.quarantined ?? []) {
  if (typeof item.path !== 'string' || !item.path.startsWith('/api/v1/')) {
    fail(`Invalid quarantined route entry: ${JSON.stringify(item)}`);
    continue;
  }
  for (const relative of callBearingSources) {
    const source = fs.readFileSync(path.join(mobileRoot, relative), 'utf8');
    if (source.includes(item.path)) {
      fail(`${relative} still contains a production HTTP action for quarantined route ${item.path}.`);
    }
  }
}

if (!process.exitCode) {
  console.log(
    `[P119] PASS: ${manifest.actions.length} production mobile HTTP actions are mapped to published APIM contracts; ${callBearingSources.size} call-bearing source files audited.`,
  );
}
