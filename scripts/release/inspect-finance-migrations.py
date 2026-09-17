"""Read-only comparison of live Finance history with the candidate SQL files."""
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('finance_history', ROOT / 'scripts/email/inspect-applied-email-history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)
original_compare = history.compare


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]+(?:\.[0-9]+)*', value):
        raise ValueError('INVALID_VERSION')
    return tuple(map(int, value.split('.')))


def compare(service, records, sources):
    report = original_compare(service, records, sources)
    applied = [version(r['version']) for r in records if r['type'] == 'SQL']
    pending = report['missingSourceVersions']
    # Only later, additive versions may be pending. No repair/ignore flags.
    after_applied = bool(applied) and all(version(v) > max(applied) for v in pending)
    report['passed'] = after_applied and all(r.get('matchesSource', r['success']) is True for r in report['history'])
    report['pendingMigrationsNotExecuted'] = pending
    return report


def sql(schema, db_env):
    if schema != 'payment_schema' or db_env.get('PGOPTIONS') != '-c default_transaction_read_only=on':
        raise ValueError('READ_SCOPE_NOT_ALLOWED')
    query = """BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM
 (SELECT version, script, checksum, success, type FROM payment_schema.flyway_schema_history
  ORDER BY installed_rank LIMIT 251) t;
ROLLBACK;
"""
    result = subprocess.run(['psql', '-X', '-qAt', '--set=ON_ERROR_STOP=1'], input=query,
                            env=db_env, capture_output=True, text=True, timeout=25)
    if result.returncode or len(result.stdout) > 200_000:
        raise ValueError('HISTORY_UNAVAILABLE')
    return json.loads(result.stdout)


def capture():
    # Reuse the established scoped-vault, TLS and runtime-stability checks.
    history.APPS = {'integration-service': ('ca-craves-integration-service-pr', 'payment_schema')}
    history.REQUIRED = {'integration-service': set()}
    history.compare = compare
    history.sql = sql
    return history.capture()


if __name__ == '__main__':
    try:
        report = capture()
        print(json.dumps(report, sort_keys=True))
        if not report['allMatched']:
            raise ValueError('HISTORY_DIFFERS')
    except Exception:
        print('FINANCE_MIGRATION_PREFLIGHT_STOPPED_NO_WRITES', file=sys.stderr)
        raise SystemExit(1)
