#!/usr/bin/env python3
"""Require all User/Chef tests, including both disposable databases, to execute."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

reports = Path("services/user-chef-service/target/surefire-reports")
required = {
    "AuthEmailProjectionDbTest": 15,
    "ExplorerPostgresTest": 9,
    "ExplorerRateLimiterPostgresTest": 8,
    "ChefApplicationReadinessTest": 8,
    "ChefApplicationReadinessHttpTest": 4,
    "CustomerAddressRequestValidationTest": 13,
}
totals = {key: 0 for key in ("tests", "failures", "errors", "skipped")}
suites = []
for report in sorted(reports.glob("TEST-*.xml")):
    root = ET.parse(report).getroot()
    counts = {key: int(root.attrib.get(key, "0")) for key in totals}
    name = root.attrib["name"].rsplit(".", 1)[-1]
    if name in required:
        minimum = required.pop(name)
        if counts["tests"] < minimum:
            raise SystemExit(f"Missing required test cases in {name}: {counts}")
    if any(counts[key] for key in ("failures", "errors", "skipped")):
        raise SystemExit(f"Suite must pass with no skips: {name}: {counts}")
    suites.append({"suite": name, **counts})
    for key in totals:
        totals[key] += counts[key]
if required:
    raise SystemExit(f"Missing required suites: {sorted(required)}")
summary = {"service": "user-chef-service", "totals": totals, "suites": suites}
(reports / "release-test-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
