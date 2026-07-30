#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
command -v python3 >/dev/null || { echo 'ERROR: python3 is required' >&2; exit 1; }

python3 - "$ROOT" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pairs = {
    "azure-pipelines-auth-service.yml": "services/auth-service",
    "azure-pipelines-user-chef-service.yml": "services/user-chef-service",
    "azure-pipelines-catalog-service.yml": "services/catalog-service",
    "azure-pipelines-order-service.yml": "services/order-service",
    "azure-pipelines-subscription-service.yml": "services/subscription-service",
    "azure-pipelines-integration-service.yml": "services/integration-service",
    "azure-pipelines-notification-service.yml": "services/notification-service",
}
standard = {
    "SERVER_PORT",
    "SPRING_PROFILES_ACTIVE",
    "SPRING_DATASOURCE_URL",
    "SPRING_DATASOURCE_USERNAME",
    "SPRING_DATASOURCE_PASSWORD",
    "SPRING_FLYWAY_TABLE",
    "SPRING_DATA_REDIS_URL",
}
assignment = re.compile(r"(?:^|\s)([A-Z][A-Z0-9_]+)=")

for pipeline_name, service_dir_name in pairs.items():
    pipeline = root / pipeline_name
    service_dir = root / service_dir_name
    if not pipeline.is_file() or not service_dir.is_dir():
        raise SystemExit(f"ERROR: Missing deployment/source pair {pipeline_name} -> {service_dir_name}")

    pipeline_lines = pipeline.read_text(encoding="utf-8").splitlines()
    configured = set()
    index = 0
    while index < len(pipeline_lines):
        if "az containerapp update" not in pipeline_lines[index]:
            index += 1
            continue
        command_lines = [pipeline_lines[index].strip()]
        while command_lines[-1].rstrip().endswith("\\") and index + 1 < len(pipeline_lines):
            index += 1
            command_lines.append(pipeline_lines[index].strip())
        command = " ".join(part.rstrip("\\").strip() for part in command_lines)
        if "--set-env-vars" in command:
            env_segment = command.split("--set-env-vars", 1)[1]
            env_segment = re.split(r"\s+(?:--no-wait|-o|--output|--min-replicas|--max-replicas)\b", env_segment, maxsplit=1)[0]
            configured.update(assignment.findall(env_segment))
        index += 1

    if not configured:
        raise SystemExit(f"ERROR: No deployment environment bindings were parsed from {pipeline_name}")

    source_parts = []
    for path in service_dir.rglob("*"):
        if not path.is_file() or "target" in path.parts:
            continue
        if path.suffix.lower() not in {".java", ".yml", ".yaml", ".properties", ".xml"}:
            continue
        source_parts.append(path.read_text(encoding="utf-8", errors="ignore"))
    source = "\n".join(source_parts)

    for name in sorted(configured):
        if name in standard:
            print(f"ENV_STANDARD {pipeline_name}:{name}")
            continue
        if name not in source:
            raise SystemExit(
                f"ERROR: {pipeline_name} sets {name}, but {service_dir_name} does not consume that environment variable"
            )
        print(f"ENV_BOUND {pipeline_name}:{name}")

print("SUCCESS: Every deployment environment variable is consumed by its owning Spring service or is a standard Spring runtime variable.")
PY
