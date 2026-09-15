#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "${REFERRAL_TEST_CONFIRM:?}" == YES_DISPOSABLE_REFERRAL_TEST_ONLY ]]
: "${REFERRAL_OWNER_TEST_JDBC_URL:?}"
: "${LEDGER_TEST_JDBC_URL:?}"
result=0
for service in auth-service order-service; do
  if ! mvn -B -ntp -f "services/$service/pom.xml" verify; then result=1; fi
done
[[ "$result" == 0 ]]
python3 scripts/referrals/require-owner-evidence.py
