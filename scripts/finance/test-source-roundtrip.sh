#!/usr/bin/env bash
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[[ "${LEDGER_TEST_JDBC_URL:-}" =~ ^jdbc:postgresql://localhost:[0-9]+/chef_ledger_test$ ]] || { echo 'Refusing non-isolated financial test database' >&2; exit 1; }
[[ "${CRAVES_DISPOSABLE_TEST_DATABASE:-}" == true ]] || { echo 'Explicit disposable database acknowledgement is required' >&2; exit 1; }
for tool in java javac mvn python3; do command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 1; }; done
[[ -d services/order-service/target/classes && -d services/integration-service/target/classes ]] || { echo 'Run both Maven verify commands first' >&2; exit 1; }
mkdir -p target/finance-roundtrip/classes
mvn -B -ntp -f services/order-service/pom.xml org.apache.maven.plugins:maven-dependency-plugin:3.7.1:build-classpath \
  -Dmdep.includeScope=test -Dmdep.outputFile="$ROOT/target/finance-roundtrip/classpath.txt"
CP="$ROOT/services/order-service/target/classes:$ROOT/services/integration-service/target/classes:$(cat target/finance-roundtrip/classpath.txt)"
javac --release 21 -cp "$CP" -d target/finance-roundtrip/classes tests/finance/FinanceSourceRoundTrip.java
java -cp "$ROOT/target/finance-roundtrip/classes:$CP" in.craves.financetest.FinanceSourceRoundTrip
java -cp "$ROOT/target/finance-roundtrip/classes:$CP" in.craves.financetest.FinanceSourceRoundTrip --manual
python3 - <<'PY_REPORT'
import json,pathlib
folder=pathlib.Path('target/finance-roundtrip')
scenarios={name:json.loads((folder/('report-'+name+'.json')).read_text()) for name in ('provider','manual')}
for name,report in scenarios.items():
    assert report['status']=='PASS' and report['checkCount']>=20 and report['net']=='338.52',name
(folder/'report.json').write_text(json.dumps({'status':'PASS','scope':'Both provider and manual Craves connected source scenarios',
    'net':'338.52','checkCount':sum(report['checkCount'] for report in scenarios.values()),'scenarios':scenarios},indent=2)+'\n')
PY_REPORT
