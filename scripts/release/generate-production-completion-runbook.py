#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import NoReturn


def fail(message: str) -> NoReturn:
    raise SystemExit(f"ERROR: {message}")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    pack_path = root / "config/production/production-completion-pack.json"
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "production-completion-run-plan.md"
    if not pack_path.exists():
        fail(f"missing completion pack: {pack_path}")

    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    if pack.get("schemaVersion") != 1:
        fail("unsupported completion pack schema")
    services = pack.get("backendServices") or []
    if len(services) != 7:
        fail("exactly seven backend services are required")

    azure = pack["azure"]
    lines: list[str] = [
        "# Craves production completion run plan",
        "",
        "> Generated from source only. It does not run pipelines, deploy Azure resources, rotate credentials, change APIM, migrate databases, or call providers.",
        "",
        "## Locked environment",
        "",
        f"- Environment: `{pack['environment']}`",
        f"- Target concurrency: `{pack['targetConcurrency']}`",
        f"- Resource group: `{azure['resourceGroup']}`",
        f"- Container Registry: `{azure['containerRegistry']}`",
        f"- Key Vault: `{azure['keyVault']}`",
        f"- API Management: `{azure['apiManagement']}`",
        f"- Service Bus: `{azure['serviceBusNamespace']}`",
        "",
        "## Source-completion sequence",
        "",
        "1. Run the source-completion pipeline and fix every compile, test, contract, security and packaging failure.",
        "2. Generate missing npm lockfiles in a controlled networked build and commit them before claiming deterministic Node builds.",
        "3. Run immutable backend image builds for the exact merged source SHA.",
        "4. Run the customer-web image build using Key Vault-backed build configuration.",
        "5. Review image manifests and ACR digests before any deployment.",
        "6. Provision the customer web Container App only if it is still absent and the billable action is explicitly approved.",
        "7. Run seven-service deployment only with all execution/provider/worker/enforcement flags forced false.",
        "8. Run customer-web deployment using the exact web image tag and production APIM base URL.",
        "9. Validate, review price, and then deploy Azure Managed Redis only through its explicit billable pipeline; store the new URL in Key Vault and keep revocation/rate-limiting flags false.",
        "10. Run APIM pipelines one module at a time after owning services are healthy.",
        "11. Complete mobile native shell, Firebase secure files and signing prerequisites before Android/iOS builds.",
        "12. Activate runtime features downstream-first in separate controlled sessions.",
        "13. Rotate existing Storage/PostgreSQL credentials only during the final production-completion security phase.",
        "",
        "## Backend deployment order",
        "",
    ]

    for index, service in enumerate(services, start=1):
        lines.append(
            f"{index}. `{service['serviceName']}` → `{service['containerApp']}` → `{azure['containerRegistryLoginServer']}/{service['imageRepository']}:<immutable-tag>`"
        )

    lines.extend(["", "## Disabled flags applied during initial deployment", ""])
    for service in services:
        lines.append(f"### {service['serviceName']}")
        lines.append("")
        for flag in service["disabledFlags"]:
            lines.append(f"- `{flag}=false`")
        lines.append("")

    lines.extend(
        [
            "## Key Vault-first rule for new work",
            "",
            "- New secret values are forbidden in Git, pipeline parameters, normal pipeline variables and plaintext Container App environment values.",
            "- New runtime secrets must be versionless Key Vault-backed Container App secret references.",
            "- The image-build pipelines may retrieve approved web build configuration through the Azure Key Vault task; values remain masked and are never published in artifacts.",
            "- Existing legacy bindings and existing Storage/PostgreSQL credential rotation remain intentionally deferred.",
            "- Azure Managed Redis is a new dependency: its generated access URL is written to Key Vault from a temporary file, bound through versionless references, and never published.",
            "",
            "## Pipeline catalog",
            "",
        ]
    )
    for name, path in pack["pipelines"].items():
        lines.append(f"- **{name}:** `{path}`")

    lines.extend(["", "## Manual-only dependencies", ""])
    for item in pack["manualOnly"]:
        lines.append(f"- {item}")

    lines.extend(
        [
            "",
            "## Stop conditions",
            "",
            "- Any source, test, lockfile, Docker, pipeline YAML, secret-policy, health, revision, APIM, migration or rollback gate fails.",
            "- A requested secret is not already in Key Vault or a required managed identity lacks access.",
            "- A deployment would use a mutable image tag.",
            "- A pipeline attempts to rotate existing credentials before the final security phase.",
            "- A product-owned value such as pricing, commission, radius, settlement, refund, subscription grace or FSSAI policy is missing.",
            "- A provider, worker, publisher, consumer, mutation API or enforcement flag would be enabled automatically.",
            "",
        ]
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated: {output}")


if __name__ == "__main__":
    main()
