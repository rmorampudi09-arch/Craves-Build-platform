"""Read only Azure backup metadata; never creates a backup or restores a server."""
from datetime import datetime, timezone
import json
import subprocess
import sys

SUBSCRIPTION = '4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
RESOURCE_GROUP = 'rg-craves-prodlow-centralindia'
SERVER = 'pg-craves-prodlow-l3ing6'
RESOURCE = (f'/subscriptions/{SUBSCRIPTION}/resourceGroups/{RESOURCE_GROUP}'
            f'/providers/Microsoft.DBforPostgreSQL/flexibleServers/{SERVER}')
BASE = 'https://management.azure.com' + RESOURCE
SERVER_URL = BASE + '?api-version=2025-08-01'
BACKUPS_URL = BASE + '/backups?api-version=2025-08-01'


def read_azure(*args):
    allowed = {
        ('account', 'show', '--query', 'id'),
        ('rest', '--method', 'GET', '--url', SERVER_URL),
        ('rest', '--method', 'GET', '--url', BACKUPS_URL),
    }
    if args not in allowed:
        raise ValueError('READ_NOT_ALLOWED')
    result = subprocess.run(['az', *args, '--output', 'json', '--only-show-errors'],
                            capture_output=True, text=True, timeout=120, check=False)
    if result.returncode:
        raise ValueError('READ_UNAVAILABLE')
    return json.loads(result.stdout)


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError('INVALID_TIMESTAMP')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('UNZONED_TIMESTAMP')
    return parsed.astimezone(timezone.utc)


def summarize(server, backups, now):
    if server.get('id', '').lower() != RESOURCE.lower():
        raise ValueError('WRONG_SERVER')
    props = server['properties']
    if props['state'] != 'Ready':
        raise ValueError('SERVER_NOT_READY')
    policy = props['backup']
    retention = policy['backupRetentionDays']
    if type(retention) is not int or not 7 <= retention <= 35:
        raise ValueError('INVALID_RETENTION')
    geo = policy['geoRedundantBackup']
    if geo not in ('Enabled', 'Disabled'):
        raise ValueError('INVALID_REDUNDANCY')
    earliest = timestamp(policy['earliestRestoreDate'])
    if earliest > now:
        raise ValueError('FUTURE_RESTORE_TIME')
    # Do not follow service-returned URLs or report a partial page as complete.
    if backups.get('nextLink'):
        raise ValueError('INCOMPLETE_BACKUP_LIST')
    items = backups['value']
    if not isinstance(items, list) or len(items) > 1000:
        raise ValueError('INVALID_BACKUP_LIST')
    completed = []
    pending = 0
    for item in items:
        backup_id = item.get('id', '')
        prefix = RESOURCE.lower() + '/backups/'
        if not backup_id.lower().startswith(prefix) or '/' in backup_id[len(prefix):] or not backup_id[len(prefix):]:
            raise ValueError('WRONG_BACKUP_SERVER')
        details = item['properties']
        if details['backupType'] not in ('Full', 'Customer On-Demand'):
            raise ValueError('UNKNOWN_BACKUP_TYPE')
        if not details.get('completedTime'):
            pending += 1
            continue
        finished = timestamp(details['completedTime'])
        if finished > now:
            raise ValueError('FUTURE_BACKUP_TIME')
        completed.append(finished)
    latest = max(completed) if completed else None
    return {
        'readOnly': True,
        'server': SERVER,
        'observedAtUtc': now.isoformat(),
        'serverState': 'Ready',
        'retentionDays': retention,
        'geoRedundantBackup': geo,
        'earliestRestoreTimeUtc': earliest.isoformat(),
        'completedBackupCount': len(completed),
        'incompleteBackupCount': pending,
        'latestCompletedBackupTimeUtc': latest.isoformat() if latest else None,
        'latestCompletedBackupAgeSeconds': int((now - latest).total_seconds()) if latest else None,
        'restoreRehearsalPerformed': False,
        'limitation': 'Provider metadata only; no restore, data consistency, RPO or RTO test performed.',
    }


def capture():
    if read_azure('account', 'show', '--query', 'id') != SUBSCRIPTION:
        raise ValueError('WRONG_SUBSCRIPTION')
    before = read_azure('rest', '--method', 'GET', '--url', SERVER_URL)
    backups = read_azure('rest', '--method', 'GET', '--url', BACKUPS_URL)
    after = read_azure('rest', '--method', 'GET', '--url', SERVER_URL)
    for field in ('state', 'backup'):
        if before['properties'][field] != after['properties'][field]:
            raise ValueError('BACKUP_CONFIGURATION_CHANGED')
    if before['id'] != after['id']:
        raise ValueError('SERVER_CHANGED')
    return summarize(after, backups, datetime.now(timezone.utc))


if __name__ == '__main__':
    try:
        print(json.dumps(capture(), sort_keys=True))
    except Exception:
        # CLI responses can contain identifiers/credentials; never echo exceptions.
        print('BACKUP_METADATA_UNAVAILABLE_DETAILS_SUPPRESSED', file=sys.stderr)
        raise SystemExit(1)
