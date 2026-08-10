import fs from 'node:fs';
import path from 'node:path';

const auditPath = process.argv[2];
const auditOutcome = process.env.P127_NPM_AUDIT_OUTCOME;

if (!auditPath) {
  console.error('P127 dependency classification requires the npm-audit log path.');
  process.exit(1);
}

const resolvedAuditPath = path.resolve(process.cwd(), auditPath);
if (!fs.existsSync(resolvedAuditPath)) {
  console.error(`P127 dependency classification could not find ${auditPath}.`);
  process.exit(1);
}

const auditLog = fs.readFileSync(resolvedAuditPath, 'utf8');

if (auditOutcome === 'success') {
  console.log('P127 production dependency audit passed with no high-or-critical gate failure.');
  process.exit(0);
}

if (auditOutcome !== 'failure') {
  console.error(`P127 production dependency audit had unexpected outcome: ${auditOutcome ?? 'missing'}.`);
  process.exit(1);
}

if (/Severity:\s*critical/i.test(auditLog)) {
  console.error('P127 dependency classification found a critical production dependency advisory.');
  process.exit(1);
}

const lines = auditLog.split(/\r?\n/);
const highSections = [];
for (let index = 0; index < lines.length; index += 1) {
  if (lines[index].trim().toLowerCase() !== 'severity: high') {
    continue;
  }

  let packageLineIndex = index - 1;
  while (packageLineIndex >= 0 && lines[packageLineIndex].trim() === '') {
    packageLineIndex -= 1;
  }

  let endIndex = index + 1;
  while (endIndex < lines.length && lines[endIndex].trim() !== '') {
    endIndex += 1;
  }

  highSections.push({
    packageLine: packageLineIndex >= 0 ? lines[packageLineIndex].trim() : '',
    section: lines.slice(Math.max(packageLineIndex, 0), endIndex).join('\n'),
  });
}

if (highSections.length !== 1) {
  console.error(
    `P127 dependency classification expected exactly one known high-severity root advisory section, found ${highSections.length}.`,
  );
  process.exit(1);
}

const [{packageLine, section}] = highSections;
const packageName = packageLine.split(/\s+/)[0];
if (packageName !== 'image-size') {
  console.error(`P127 dependency classification found an unaccepted high-severity package: ${packageName || 'unknown'}.`);
  process.exit(1);
}

const expectedAdvisories = new Set([
  'GHSA-w3rx-r6r6-pgpr',
  'GHSA-5p2g-fcmc-qvqq',
]);
const foundAdvisories = new Set(section.match(/GHSA-[a-z0-9-]+/gi) ?? []);

if (
  foundAdvisories.size !== expectedAdvisories.size ||
  [...foundAdvisories].some(advisory => !expectedAdvisories.has(advisory))
) {
  console.error(
    `P127 dependency classification found a changed/unaccepted image-size advisory set: ${[
      ...foundAdvisories,
    ].join(', ') || 'none'}.`,
  );
  process.exit(1);
}

const productionSourceMarkers = [
  'src/',
  'App.tsx',
  'index.js',
];
if (productionSourceMarkers.some(marker => section.includes(marker))) {
  console.error('P127 dependency classification cannot confirm the known advisory is toolchain-only.');
  process.exit(1);
}

console.log(
  'P127 dependency audit classification accepted the known image-size high-severity advisories as an external React Native/Metro toolchain blocker for P127 review closure only.',
);
console.log(
  'This classification is not a production-release security approval; P128 remains on release hold until Security/Release Engineering accepts or remediates the toolchain advisory.',
);
