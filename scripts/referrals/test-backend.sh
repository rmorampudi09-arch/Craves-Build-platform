#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${REFERRAL_TEST_CONFIRM:?Explicit disposable database confirmation required}"
[[ "$REFERRAL_TEST_CONFIRM" == YES_DISPOSABLE_REFERRAL_TEST_ONLY ]]
: "${REFERRAL_TEST_JDBC_URL:?}"
: "${REFERRAL_OWNER_TEST_JDBC_URL:?}"
: "${LEDGER_TEST_JDBC_URL:?}"
: "${EMAIL_TEST_DB_URL:?}"
verification_status=0
for service in referral-service auth-service order-service integration-service; do
  if ! mvn -B -ntp -f "services/$service/pom.xml" verify; then verification_status=1; fi
done
if [[ "$verification_status" != 0 ]]; then exit "$verification_status"; fi
python3 scripts/referrals/verify-build.py
python3 scripts/referrals/require-backend-evidence.py
