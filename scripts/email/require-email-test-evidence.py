#!/usr/bin/env python3
"""Fail release CI if any required email persistence/security suite was absent or skipped."""
import datetime
import json
import os
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET

REQUIRED = {
    'auth-service': {'EmailVerificationCryptoTest': 5, 'EmailVerificationControllerTest': 4,
        'EmailCanonicalPreservationTest': 2, 'SignedEmailTransportTest': 4, 'EmailVerificationPersistenceTest': 16,
        'PostgresAuthRateLimiterDbTest': 12, 'PostgresAuthAbuseProtectionFilterTest': 19,
        'AuthRequestReadConfigurationTest': 3, 'AuthRequestReadTomcatTest': 2,
        'AuthProtectedOperationTest': 6, 'AuthProtectedOperationTomcatTest': 2, 'RedisAuthAbuseProtectionFilterTest': 4},
    'user-chef-service': {'AuthEmailProjectionSecurityTest': 6, 'AuthEmailProjectionDbTest': 10,
        'AuthCanonicalEmailTest': 3, 'AuthEmailHttpTest': 3},
    'notification-service': {'VerificationEmailSecurityTest': 10, 'VerificationEmailTemplateTest': 5,
        'VerificationEmailReceiptDbTest': 6, 'AuthRecipientEmailResolverTest': 4},
}
service = sys.argv[1]
if service not in REQUIRED:
    raise SystemExit('Unknown service')
reports = pathlib.Path('services') / service / 'target' / 'surefire-reports'
result = []
for suite, minimum in REQUIRED[service].items():
    files = list(reports.glob('TEST-*.' + suite + '.xml'))
    if len(files) != 1:
        raise SystemExit('Missing/ambiguous required suite: ' + suite)
    root = ET.parse(files[0]).getroot()
    counts = {key: int(root.attrib.get(key, '0')) for key in ('tests', 'failures', 'errors', 'skipped')}
    if counts['tests'] < minimum or any(counts[key] for key in ('failures', 'errors', 'skipped')):
        raise SystemExit('Required suite did not pass without skips: ' + suite)
    result.append({'suite': suite, **counts, 'evidenceFile': str(files[0])})
summary = {'service': service, 'sourceSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'runId': os.environ.get('GITHUB_RUN_ID') or os.environ.get('BUILD_BUILDID'), 'environment': 'disposable CI; provider transport mocked',
    'executedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'PASS', 'suites': result}
pathlib.Path('email-test-summary-' + service + '.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
print(service + ': all required email suites passed without skips')
