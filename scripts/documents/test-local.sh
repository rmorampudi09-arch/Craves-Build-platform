#!/usr/bin/env bash
# Disposable tests only. Does not read cloud credentials, send email or deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
for command in docker mvn node npm python3; do command -v "$command" >/dev/null || { echo "Install $command first."; exit 1; }; done
CID="$(docker run -d --rm -e POSTGRES_DB=pdf_module_test -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=pdf_test_only -p 127.0.0.1::5432 postgres:16)"
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
for attempt in $(seq 1 30); do
  if docker exec "$CID" pg_isready -U postgres -d pdf_module_test >/dev/null 2>&1; then break; fi
  test "$attempt" != 30 || { echo 'Disposable PostgreSQL did not become ready'; exit 1; }
  sleep 2
done
PORT="$(docker port "$CID" 5432/tcp | sed -n 's/^127\.0\.0\.1://p')"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo 'Unable to resolve disposable database port'; exit 1; }
export DOCUMENT_TEST_JDBC_URL="jdbc:postgresql://localhost:$PORT/pdf_module_test"
export DOCUMENT_TEST_DB_USER=postgres DOCUMENT_TEST_DB_PASSWORD=pdf_test_only
for service in notification-service order-service integration-service subscription-service; do
  mvn -B -ntp -f "services/$service/pom.xml" verify
  python3 scripts/documents/verify-test-evidence.py --service "$service" \
    --reports "services/$service/target/surefire-reports" --output "services/$service/target/pdf-test-summary.json"
done
(cd apps/customer-web-next && npm ci && NEXT_TELEMETRY_DISABLED=1 npm run verify)
echo 'Local PDF module verification passed. No production state was changed.'
