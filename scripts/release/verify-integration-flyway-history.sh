#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

python3 scripts/release/validate-flyway-migrations.py

sha256sum --check <<'CHECKSUMS'
9151b4a15d56096fa8b71fe2981cd33288479913a45151a741856ed37a42355a  services/integration-service/src/main/resources/db/migration/V112__delivery_telemetry_projection.sql
74c2dcb10e33d4b5113ba12c87778ea23e13790f8bd99f95211d52cc349079d4  services/integration-service/src/main/resources/db/migration/V113__delivery_provider_exact_eta.sql
dfc8d0f8408e6d119f25de338c6e54ed0d84a46c705649f1bb2ada7fc130f9ff  services/integration-service/src/main/resources/db/migration/V115__razorpay_webhook_delivery_guard.sql
CHECKSUMS

test -f services/integration-service/src/main/resources/db/migration/V114__admin_customer_journey_indexes.sql
test -f services/integration-service/src/main/resources/db/migration/V116__shadowfax_hyperlocal_marketplace_contract.sql
test ! -e services/integration-service/src/main/resources/db/migration/V112__admin_customer_journey_indexes.sql

echo 'SUCCESS: Integration Service applied Flyway history is preserved and new migrations are append-only.'
