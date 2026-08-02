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
placeholder = re.compile(r"\$\{([^}:]+)(?::[^}]*)?}")
conditional_annotation = re.compile(r"@ConditionalOnProperty\s*\((.*?)\)", re.DOTALL)
prefix_attribute = re.compile(r'\bprefix\s*=\s*"([^"]+)"')
name_attribute = re.compile(
    r'\b(?:name|value)\s*=\s*(\{[^}]*\}|"[^"]+")',
    re.DOTALL,
)
quoted_value = re.compile(r'"([^"]+)"')


def spring_property_to_env(property_name: str) -> str:
    """Convert a Spring relaxed-binding property path to its canonical env name."""
    camel_split = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", property_name.strip())
    return re.sub(r"[^A-Za-z0-9]+", "_", camel_split).strip("_").upper()


def discover_supported_env_names(source_files: list[Path]) -> tuple[str, set[str], set[str]]:
    source_parts: list[str] = []
    placeholder_bindings: set[str] = set()
    conditional_bindings: set[str] = set()

    for path in source_files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        source_parts.append(text)

        for property_name in placeholder.findall(text):
            placeholder_bindings.add(spring_property_to_env(property_name))

        for annotation in conditional_annotation.findall(text):
            prefix_match = prefix_attribute.search(annotation)
            prefix = prefix_match.group(1).strip() if prefix_match else ""
            name_match = name_attribute.search(annotation)
            if not name_match:
                continue
            for name in quoted_value.findall(name_match.group(1)):
                property_name = f"{prefix}.{name}" if prefix else name
                conditional_bindings.add(spring_property_to_env(property_name))

    return "\n".join(source_parts), placeholder_bindings, conditional_bindings


mismatches: list[str] = []
bound_count = 0

for pipeline_name, service_dir_name in pairs.items():
    pipeline = root / pipeline_name
    service_dir = root / service_dir_name
    if not pipeline.is_file() or not service_dir.is_dir():
        mismatches.append(
            f"Missing deployment/source pair {pipeline_name} -> {service_dir_name}"
        )
        continue

    pipeline_lines = pipeline.read_text(encoding="utf-8").splitlines()
    configured: set[str] = set()
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
            env_segment = re.split(
                r"\s+(?:--no-wait|-o|--output|--min-replicas|--max-replicas)\b",
                env_segment,
                maxsplit=1,
            )[0]
            configured.update(assignment.findall(env_segment))
        index += 1

    if not configured:
        mismatches.append(
            f"No deployment environment bindings were parsed from {pipeline_name}"
        )
        continue

    source_files: list[Path] = []
    for path in service_dir.rglob("*"):
        if not path.is_file() or "target" in path.parts:
            continue
        if path.suffix.lower() not in {".java", ".yml", ".yaml", ".properties", ".xml"}:
            continue
        source_files.append(path)

    source, placeholder_bindings, conditional_bindings = discover_supported_env_names(
        source_files
    )

    for name in sorted(configured):
        if name in standard:
            print(f"ENV_STANDARD {pipeline_name}:{name}")
            bound_count += 1
            continue
        if name in source:
            print(f"ENV_BOUND_LITERAL {pipeline_name}:{name}")
            bound_count += 1
            continue
        if name in placeholder_bindings:
            print(f"ENV_BOUND_PLACEHOLDER {pipeline_name}:{name}")
            bound_count += 1
            continue
        if name in conditional_bindings:
            print(f"ENV_BOUND_CONDITIONAL {pipeline_name}:{name}")
            bound_count += 1
            continue

        mismatches.append(
            f"{pipeline_name} sets {name}, but {service_dir_name} does not consume "
            "that setting as a literal environment variable, Spring placeholder, "
            "or @ConditionalOnProperty binding"
        )

if mismatches:
    print(
        f"ERROR: {len(mismatches)} deployment environment binding issue(s) found:",
        file=sys.stderr,
    )
    for mismatch in mismatches:
        print(f"  - {mismatch}", file=sys.stderr)
    raise SystemExit(1)

print(
    "SUCCESS: "
    f"{bound_count} deployment environment variables are consumed by their owning "
    "Spring service or are standard Spring runtime variables."
)
PY
