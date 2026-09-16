"""Read-only exact-main GitHub regression and public web contract checks.

No credentials, mailbox requests, transactions or customer bodies are used.
"""
import argparse
import json
import re
import urllib.error
import urllib.request

REPO = 'rmorampudi09-arch/Craves-Build-platform'
API = 'https://api.github.com/repos/' + REPO
JOBS = {'Pin the reviewed source', 'Seven complete Java services and connected source',
        'Clean web install, lint, types, every test and build', 'Exact-SHA complete regression evidence'}


def require(ok, message):
    if not ok: raise ValueError(message)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None


def request(url, method='GET'):
    req = urllib.request.Request(url, method=method, headers={'Accept': 'application/json', 'User-Agent': 'Craves-release-verifier'})
    try: return urllib.request.build_opener(NoRedirect()).open(req, timeout=25)
    except urllib.error.HTTPError as error: return error


def read_json(url):
    with request(url) as response:
        require(response.code == 200, 'Read-only evidence endpoint unavailable')
        data = response.read(2_000_001)
        require(len(data) <= 2_000_000, 'Evidence response exceeds bound')
        return json.loads(data)


def validate_evidence(sha, run, jobs, artifacts, main):
    require(bool(re.fullmatch('[0-9a-f]{40}', sha)), 'Exact source required')
    require(run.get('head_sha') == sha and main.get('commit', {}).get('sha') == sha, 'Stale or different source')
    require(run.get('repository', {}).get('full_name') == REPO, 'Wrong repository')
    require(run.get('path') == '.github/workflows/launch-regression-ci.yml', 'Wrong regression workflow')
    require(run.get('event') in ('push', 'workflow_dispatch') and run.get('head_branch') == 'main', 'Merged main evidence required')
    require(run.get('status') == 'completed' and run.get('conclusion') == 'success', 'Regression did not succeed')
    rows = jobs.get('jobs', [])
    require(jobs.get('total_count') == len(rows) == len(JOBS), 'Incomplete or duplicate job evidence')
    require({r.get('name') for r in rows} == JOBS, 'Required jobs missing')
    require(all(r.get('head_sha') == sha and r.get('status') == 'completed' and r.get('conclusion') == 'success' for r in rows), 'Failed, skipped or stale prerequisite')
    name = 'launch-regression-summary-' + str(run['id']) + '-' + str(run['run_attempt'])
    matches = [a for a in artifacts.get('artifacts', []) if a.get('name') == name]
    require(len(matches) == 1 and matches[0].get('expired') is False and matches[0].get('size_in_bytes', 0) > 0, 'Current aggregate artifact missing or expired')
    return {'sourceSha': sha, 'runId': run['id'], 'runAttempt': run['run_attempt'], 'artifactId': matches[0]['id'], 'passed': True}


def evidence(sha, run_id):
    require(bool(re.fullmatch('[1-9][0-9]{0,15}', run_id)), 'Exact regression run ID required')
    base = API + '/actions/runs/' + run_id
    run = read_json(base)
    return validate_evidence(sha, run, read_json(base + '/attempts/' + str(run['run_attempt']) + '/jobs?per_page=100'),
                             read_json(base + '/artifacts?per_page=100'), read_json(API + '/branches/main'))


def smoke(origin, email=True):
    require(origin == 'https://craves.in' or bool(re.fullmatch(r'https://ca-craves-web-prodlow\.[a-z0-9.-]+\.azurecontainerapps\.io', origin)), 'Unexpected web origin')
    readiness = read_json(origin + '/api/readiness/razorpay')
    require(readiness.get('service') == 'craves-customer-web' and readiness.get('razorpayMode') == 'production'
            and readiness.get('productionEligible') is True, 'Production merchant readiness changed')
    rows = []
    if email:
        for method, path in [('GET', '/api/auth/email-verification'),
                             ('POST', '/api/auth/email-verification/challenges'),
                             ('POST', '/api/auth/email-verification/verify'),
                             ('POST', '/api/auth/email-verification/resend')]:
            with request(origin + path, method) as response:
                # No body: even an unexpected response must never publish account data.
                cache = response.headers.get('Cache-Control', '')
                require(response.code in (401, 403) and 'no-store' in cache.lower(), 'Email route absent or unauthenticated/private-response contract failed')
                rows.append({'method': method, 'path': path, 'status': response.code, 'cacheControl': cache})
    return {'origin': origin, 'merchantReady': True, 'emailDenials': rows, 'mailboxAccepted': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sha'); parser.add_argument('--run-id')
    parser.add_argument('--origin'); parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    try:
        result = smoke(args.origin, not args.baseline) if args.origin else evidence(args.sha or '', args.run_id or '')
        print(json.dumps(result, sort_keys=True))
    except Exception as error:
        raise SystemExit('Web evidence stopped: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__))
