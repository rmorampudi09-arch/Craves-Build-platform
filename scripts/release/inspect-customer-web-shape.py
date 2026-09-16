"""Compare running web template representations without exporting literal settings."""
import importlib.util
import json
from pathlib import Path
import subprocess

SPEC = importlib.util.spec_from_file_location('web_runtime', Path(__file__).with_name('verify-customer-web-runtime.py'))
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)
RG = 'rg-craves-prodlow-centralindia'
APP = 'ca-craves-web-prodlow'


def shape(value):
    result = {'type': type(value).__name__}
    if value is None or isinstance(value, (list, dict)): result['empty'] = not value
    if type(value) in (bool, int): result['scalar'] = value
    return result


def differences(left, right, path='$'):
    if left == right: return []
    if isinstance(left, dict) and isinstance(right, dict):
        result = []
        for key in sorted(set(left) | set(right)):
            name = path + '.' + key
            if key not in left: result.append({'path': name, 'desired': {'absent': True}, 'running': shape(right[key])})
            elif key not in right: result.append({'path': name, 'desired': shape(left[key]), 'running': {'absent': True}})
            else: result.extend(differences(left[key], right[key], name))
        return result
    if isinstance(left, list) and isinstance(right, list) and len(left) == len(right):
        return [item for i, (a, b) in enumerate(zip(left, right)) for item in differences(a, b, path + '[' + str(i) + ']')]
    return [{'path': path, 'desired': shape(left), 'running': shape(right)}]


def az(*args):
    runtime.require(args in [('account', 'show'), ('containerapp', 'show', '-g', RG, '-n', APP),
                            ('containerapp', 'revision', 'list', '-g', RG, '-n', APP)], 'Read-only scoped metadata command required')
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'], capture_output=True, text=True, timeout=45)
    runtime.require(result.returncode == 0, 'Metadata read failed; raw settings withheld')
    return json.loads(result.stdout)


def main():
    runtime.require(az('account', 'show')['id'] == '4f897b61-9b52-44b4-8cf1-bdac281cc1aa', 'Wrong subscription')
    app = az('containerapp', 'show', '-g', RG, '-n', APP)
    revisions = az('containerapp', 'revision', 'list', '-g', RG, '-n', APP)
    active = [r for r in revisions if r['properties'].get('active')]
    runtime.require(len(active) == 1 and active[0]['name'] == app['properties']['latestReadyRevisionName'], 'Ambiguous serving revision')
    desired = runtime.normalized_template(app['properties']['template'])
    running = runtime.normalized_template(active[0]['properties']['template'])
    runtime.require(az('containerapp', 'show', '-g', RG, '-n', APP) == app, 'Configuration changed during read')
    return {'readOnly': True, 'app': APP, 'revision': active[0]['name'], 'differences': differences(desired, running),
            'documentedDefaultsEquivalent': runtime.comparable_running_template(desired) == runtime.comparable_running_template(running),
            'accepted': False, 'literalSettingsIncluded': False}


if __name__ == '__main__':
    try: print(json.dumps(main(), sort_keys=True))
    except Exception as error:
        raise SystemExit('Web shape inspection stopped: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__))
