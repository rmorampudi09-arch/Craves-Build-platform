#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="$ROOT/config/production/container-app-secret-names.json"
fail() { echo "ERROR: $*" >&2; exit 1; }
command -v python3 >/dev/null || fail "python3 is required"
[[ -f "$INVENTORY" ]] || fail "Container App secret-name inventory is missing"

python3 - "$ROOT" "$INVENTORY" <<'PY'
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
inventory_path = Path(sys.argv[2])
data = json.loads(inventory_path.read_text(encoding="utf-8"))
maximum = data.get("maximumNameLength")
names = data.get("names")
if data.get("schemaVersion") != 1 or maximum != 20 or not isinstance(names, dict) or not names:
    raise SystemExit("ERROR: Invalid Container App secret-name inventory")
pattern = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
values = list(names.values())
if len(values) != len(set(values)):
    raise SystemExit("ERROR: Container App secret names are not unique")
for logical_name, secret_name in names.items():
    if not isinstance(secret_name, str) or not pattern.fullmatch(secret_name):
        raise SystemExit(f"ERROR: Invalid secret name for {logical_name}: {secret_name!r}")
    if "--" in secret_name or len(secret_name) > maximum:
        raise SystemExit(f"ERROR: Secret name exceeds Azure CLI constraints for {logical_name}: {secret_name}")
    print(f"SECRET_NAME_OK {logical_name}={secret_name}")

# Parse only literal keys supplied to `az containerapp secret set --secrets`.
# Existing Key Vault-backed secrets created through earlier infrastructure are not renamed here.
assignment = re.compile(r"^\s*([a-z0-9][a-z0-9-]*)=")
for pipeline in sorted(root.glob("azure-pipelines*.yml")):
    lines = pipeline.read_text(encoding="utf-8").splitlines()
    in_secret_set = False
    in_values = False
    for line in lines:
        if "az containerapp secret set" in line:
            in_secret_set = True
            in_values = False
            continue
        if not in_secret_set:
            continue
        if "--secrets" in line:
            in_values = True
            tail = line.split("--secrets", 1)[1].strip().rstrip("\\").strip()
            if tail:
                match = assignment.match(tail)
                if match:
                    name = match.group(1)
                    if len(name) > maximum or not pattern.fullmatch(name) or "--" in name:
                        raise SystemExit(f"ERROR: Invalid CLI-managed secret key {name} in {pipeline.name}")
            continue
        if in_values:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if stripped.startswith("-o ") or stripped.startswith("--output") or stripped == "-o none":
                in_secret_set = False
                in_values = False
                continue
            candidate = stripped.rstrip("\\").strip()
            match = assignment.match(candidate)
            if match:
                name = match.group(1)
                if len(name) > maximum or not pattern.fullmatch(name) or "--" in name:
                    raise SystemExit(f"ERROR: Invalid CLI-managed secret key {name} in {pipeline.name}")
                print(f"PIPELINE_SECRET_OK {pipeline.name}:{name}")
            elif candidate.startswith("az ") or candidate.startswith("echo "):
                in_secret_set = False
                in_values = False

required = {
    "azure-pipelines-auth-service.yml": {
        names["databasePassword"], names["firebaseAdminJson"],
        names["jwtPrivatePem"], names["internalServiceSecret"]
    },
    "azure-pipelines-subscription-service.yml": {
        names["databasePassword"], names["jwtVerificationPem"], names["internalServiceSecret"]
    },
}
for filename, required_names in required.items():
    text = (root / filename).read_text(encoding="utf-8")
    for secret_name in required_names:
        if f"{secret_name}=" not in text or f"secretref:{secret_name}" not in text:
            raise SystemExit(f"ERROR: {filename} does not consistently create and reference {secret_name}")

for forbidden in (
    "spring-datasource-password=",
    "firebase-service-account-json-base64=",
    "craves-jwt-private-key-pem-base64=",
    "craves-jwt-verification-pem-base64=",
):
    for filename in ("azure-pipelines-auth-service.yml", "azure-pipelines-subscription-service.yml"):
        if forbidden in (root / filename).read_text(encoding="utf-8"):
            raise SystemExit(f"ERROR: Overlength CLI secret key remains in {filename}: {forbidden[:-1]}")

print("SUCCESS: CLI-managed Container App secret names satisfy the current Azure CLI constraints.")
PY
