#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${REFERRAL_TEST_CONFIRM:?Explicit disposable database confirmation required}"
[[ "$REFERRAL_TEST_CONFIRM" == YES_DISPOSABLE_REFERRAL_TEST_ONLY ]]
: "${REFERRAL_TEST_JDBC_URL:?}"
: "${REFERRAL_OWNER_TEST_JDBC_URL:?}"
: "${LEDGER_TEST_JDBC_URL:?}"
: "${EMAIL_TEST_DB_URL:?}"
for service in referral-service auth-service order-service integration-service; do
  mvn -B -ntp -f "services/$service/pom.xml" verify
done
python3 scripts/referrals/require-backend-evidence.py
