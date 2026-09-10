import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

const requiredMarkers = [
  ['src/core/observability/observability.ts', 'sanitizeObservabilityAttributes'],
  ['src/core/observability/observability.ts', 'SENSITIVE_ATTRIBUTE_KEY'],
  ['src/core/observability/networkObservability.ts', 'sanitizeNetworkRoute'],
  ['src/core/observability/networkObservability.ts', 'startPerformanceTrace'],
  ['src/core/http/transport.ts', 'beginNetworkObservation'],
  ['src/core/http/transport.ts', 'endNetworkObservation'],
  ['src/core/http/httpClient.ts', "trackAction('backend_mutation_started'"],
  ['src/features/auth/api/sessionManager.ts', "trackSessionEvent('session_refresh_started'"],
  ['src/app/navigation/AppNavigator.tsx', 'trackScreen(routeName'],
  ['src/core/observability/globalErrorObservation.ts', "captureException(error, 'unhandled_js_exception'"],
  ['index.js', 'installGlobalErrorObservation();'],
];

const failures = [];

for (const [relativePath, marker] of requiredMarkers) {
  const source = read(relativePath);
  if (!source.includes(marker)) {
    failures.push(`${relativePath}: missing required P120 marker ${marker}`);
  }
}

for (const relativePath of [
  'src/core/observability/observability.ts',
  'src/core/observability/networkObservability.ts',
  'src/core/observability/globalErrorObservation.ts',
]) {
  const source = read(relativePath);
  if (/\bconsole\.(?:log|info|warn|error|debug)\s*\(/.test(source)) {
    failures.push(`${relativePath}: observability runtime must not write raw console telemetry`);
  }
}

const observabilitySource = read('src/core/observability/observability.ts');
if (/error\.message|error\.stack/.test(observabilitySource)) {
  failures.push('observability.ts: raw error message/stack export is forbidden');
}

const networkSource = read('src/core/observability/networkObservability.ts');
if (!networkSource.includes("split('?')[0]") || !networkSource.includes("split('#')[0]")) {
  failures.push('networkObservability.ts: query/fragment stripping must remain enabled');
}

if (failures.length > 0) {
  console.error('P120 observability audit check failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('P120 observability audit check passed.');
