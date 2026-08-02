#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

python3 - <<'PY'
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRECTORY_PARTS = {
    '.git', 'node_modules', 'target', 'dist', 'build', 'coverage',
}
SKIP_SUFFIXES = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip', '.jar',
    '.keystore', '.jks', '.p12', '.mobileprovision', '.class', '.so', '.dll',
}
CONFIG_SUFFIXES = {
    '.env', '.properties', '.yml', '.yaml', '.json', '.toml', '.tfvars',
    '.ini', '.conf', '.config', '.xml', '.bicep',
}

HIGH_CONFIDENCE_PATTERNS = (
    ('private-key block', re.compile(
        r'^\s*-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\s*$'
    )),
    ('embedded access key', re.compile(
        r'accesskey=[A-Za-z0-9+/=]{20,}', re.IGNORECASE
    )),
    ('embedded bearer token', re.compile(
        r'Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}', re.IGNORECASE
    )),
    ('embedded Google API key', re.compile(r'AIza[0-9A-Za-z_-]{30,}')),
    ('embedded AWS access key', re.compile(r'AKIA[0-9A-Z]{16}')),
)

SECRET_KEY = r'(?:client[_-]?secret|connection[_-]?string|private[_-]?key)'
QUOTED_ASSIGNMENT = re.compile(
    rf'''(?ix)
    ["']?{SECRET_KEY}["']?
    \s*[:=]\s*
    (?P<quote>["'])
    (?P<value>.*?)
    (?P=quote)
    ''',
)
UNQUOTED_CONFIG_ASSIGNMENT = re.compile(
    rf'''(?ix)
    ["']?{SECRET_KEY}["']?
    \s*[:=]\s*
    (?P<value>[^\s,#"']+)
    ''',
)

SAFE_REFERENCE_PREFIXES = (
    'secretref:',
    'keyvaultref:',
    '@microsoft.keyvault(',
    '$(',
    '${',
    '{{',
    'system.getenv(',
    'system.getproperty(',
    'environment.getproperty(',
)
SAFE_PLACEHOLDER_MARKERS = (
    'replace-before-run',
    'replace_me',
    'replace-me',
    'placeholder',
    'change-me',
    'changeme',
    'example-only',
    'dummy-value',
    'not-configured',
    'not-set',
)


def is_configuration_file(path: Path) -> bool:
    name = path.name.lower()
    return (
        path.suffix.lower() in CONFIG_SUFFIXES
        or name == '.env'
        or name.startswith('.env.')
    )


def normalized_value(raw: str) -> str:
    return raw.strip().rstrip(';').rstrip(',').strip()


def is_safe_reference(raw: str) -> bool:
    value = normalized_value(raw)
    lowered = value.lower()
    if not value:
        return True
    if lowered in {'null', 'none', 'false', 'true'}:
        return True
    if any(lowered.startswith(prefix) for prefix in SAFE_REFERENCE_PREFIXES):
        return True
    if any(marker in lowered for marker in SAFE_PLACEHOLDER_MARKERS):
        return True
    return False


def scan_line(line: str, *, config_file: bool) -> list[str]:
    reasons: list[str] = []

    for reason, pattern in HIGH_CONFIDENCE_PATTERNS:
        if pattern.search(line):
            reasons.append(reason)

    # Source files are checked only for quoted hard-coded assignments. Normal
    # variable-to-variable Java/TypeScript assignments are therefore ignored,
    # while quoted credential literals remain blocked.
    for match in QUOTED_ASSIGNMENT.finditer(line):
        value = match.group('value')
        if len(normalized_value(value)) >= 16 and not is_safe_reference(value):
            reasons.append('hard-coded quoted secret assignment')

    # Configuration formats may legitimately use unquoted values. Safe
    # indirections are allow-listed; other long values remain blocked. The
    # unquoted pattern deliberately excludes quote characters so a quoted JSON
    # value is never evaluated twice.
    if config_file:
        for match in UNQUOTED_CONFIG_ASSIGNMENT.finditer(line):
            value = match.group('value')
            if len(normalized_value(value)) >= 16 and not is_safe_reference(value):
                reasons.append('hard-coded configuration secret assignment')

    return sorted(set(reasons))


def run_regression_tests() -> None:
    safe_cases = (
        ('this.connectionString = connectionString;', False),
        ('public String getConnectionString() { return connectionString; }', False),
        ('.replace("-----BEGIN PRIVATE KEY-----", "")', False),
        ('ACS_EMAIL_CONNECTION_STRING=secretref:acs-email-conn', True),
        ('connectionString: keyvaultref:https://vault/secrets/example', True),
        ('connectionString: $(SERVICE_BUS_CONNECTION_STRING)', True),
        ('connectionString: ${SERVICE_BUS_CONNECTION_STRING}', True),
        ('connectionString: @Microsoft.KeyVault(SecretUri=https://vault/secrets/example)', True),
        ('"cashfreeClientSecret": "cashfree-secret",', True),
    )

    # Assemble synthetic unsafe fixtures at runtime so this scanner source file
    # does not itself contain committed credential-like literals that it is
    # intentionally designed to reject.
    synthetic_private_key_header = '-----BEGIN ' + 'PRIVATE KEY-----'
    synthetic_client_secret = 'client_' + 'secret="' + ('a' * 20) + '"'
    synthetic_connection_string = (
        'connectionString: Endpoint=https://example.invalid/;'
        + 'Access' + 'Key=' + ('b' * 24)
    )
    synthetic_bearer = 'Authorization: ' + 'Bearer ' + ('c' * 28) + '.1234567890'

    blocked_cases = (
        (synthetic_private_key_header, False),
        (synthetic_client_secret, False),
        (synthetic_connection_string, True),
        (synthetic_bearer, False),
    )

    for line, config_file in safe_cases:
        if scan_line(line, config_file=config_file):
            raise SystemExit('ERROR: secret scanner regression test rejected a safe reference or source construct')

    for line, config_file in blocked_cases:
        if not scan_line(line, config_file=config_file):
            raise SystemExit('ERROR: secret scanner regression test failed to detect synthetic credential material')


run_regression_tests()

try:
    output = subprocess.check_output(['git', 'ls-files', '-z'])
except (OSError, subprocess.CalledProcessError) as exc:
    raise SystemExit(f'ERROR: unable to enumerate tracked files: {exc}') from exc

tracked = [item for item in output.decode('utf-8').split('\0') if item]
if not tracked:
    raise SystemExit('ERROR: no tracked files found.')

scanned = 0
findings: dict[str, dict[int, set[str]]] = {}

for item in tracked:
    path = Path(item)
    if any(part in SKIP_DIRECTORY_PARTS for part in path.parts):
        continue
    if path.suffix.lower() in SKIP_SUFFIXES:
        continue
    if not path.is_file():
        continue

    try:
        raw = path.read_bytes()
    except OSError:
        continue
    if b'\x00' in raw:
        continue
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        continue

    scanned += 1
    config_file = is_configuration_file(path)
    for line_number, line in enumerate(text.splitlines(), start=1):
        reasons = scan_line(line, config_file=config_file)
        if reasons:
            per_file = findings.setdefault(item, {})
            per_file.setdefault(line_number, set()).update(reasons)

if findings:
    for file_name in sorted(findings):
        print(f'ERROR: possible credential material in {file_name}', file=sys.stderr)
        for line_number in sorted(findings[file_name]):
            reasons = ', '.join(sorted(findings[file_name][line_number]))
            print(f'  line {line_number}: {reasons}', file=sys.stderr)
    print(f'FAILED: {len(findings)} file(s) contain possible secret material.', file=sys.stderr)
    raise SystemExit(1)

print(f'SUCCESS: scanned {scanned} tracked text files; no obvious credential material found.')
PY
