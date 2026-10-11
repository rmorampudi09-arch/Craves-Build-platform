#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import yaml

# This is a reviewed exception for automatic *validation*, not a filename
# exemption. The exact parsed contract below was inspected at source commit
# 11980833e2a33384845e0403da698b6c69f134f5. Any semantic edit needs re-review.
REVIEWED_ADMIN_CONTRACT_SHA256 = "685e2d1ce5582b998b8f6a34f6d8886f25bea1b17e5c457a0647a25f2bae1360"
PRODUCTION_CONDITION = "and(succeeded(), eq('${{ parameters.deployProduction }}', 'true'), eq(variables['Build.Reason'], 'Manual'), eq(variables['Build.SourceBranch'], 'refs/heads/main'))"


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node, deep=False):
    loader.flatten_mapping(node)
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise yaml.constructor.ConstructorError(None, None, f"duplicate key: {key}", key_node.start_mark)
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def reviewed_admin_validation(rel: pathlib.Path, doc: dict) -> bool:
    if str(rel) != "azure-pipelines-admin-dashboard.yml":
        return False
    try:
        parameters = {value["name"]: value for value in doc["parameters"]}
        if parameters["deployProduction"]["type"] != "boolean" or parameters["deployProduction"]["default"] is not False:
            return False
        if parameters["expectedReleaseSha"]["default"] != "" or parameters["regressionRunId"]["default"] != "":
            return False
        stages = doc["stages"]
        if [stage["stage"] for stage in stages] != ["Validate", "Image", "Deploy"]:
            return False
        if stages[1]["condition"] != PRODUCTION_CONDITION or stages[2]["condition"] != PRODUCTION_CONDITION:
            return False
        if stages[1]["dependsOn"] != "Validate" or stages[2]["dependsOn"] != "Image":
            return False
        source_guard = stages[0]["jobs"][0]["steps"][1]["script"]
        required_source_guards = (
            '${DEPLOY_PRODUCTION,,}', '$BUILD_REASON" == Manual',
            '$BUILD_SOURCEBRANCH" == refs/heads/main',
            '"$(git rev-parse HEAD)" == "$EXPECTED_RELEASE_SHA"',
            '"$BUILD_SOURCEVERSION" == "$EXPECTED_RELEASE_SHA"',
            'verify-web-release-evidence.py --sha "$EXPECTED_RELEASE_SHA" --run-id "$REGRESSION_RUN_ID"',
        )
        if not all(guard in source_guard for guard in required_source_guards):
            return False
        # Covers every job, task, script, environment binding and trigger, so
        # added automatic deployment steps cannot inherit this exception.
        canonical = json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(canonical).hexdigest() == REVIEWED_ADMIN_CONTRACT_SHA256
    except (KeyError, IndexError, TypeError, ValueError):
        return False


ROOT = pathlib.Path(__file__).resolve().parents[2]
FILES = sorted({*ROOT.glob("azure-pipelines*.yml"), *ROOT.glob(".github/workflows/*.yml"), *ROOT.glob(".github/workflows/*.yaml")})
if not FILES:
    raise SystemExit("ERROR: no pipeline YAML files were found")

errors: list[str] = []
for path in FILES:
    rel = path.relative_to(ROOT)
    text = path.read_text(encoding="utf-8")
    if "\t" in text:
        errors.append(f"{rel}: tab characters are not permitted")
    try:
        doc = yaml.load(text, Loader=UniqueKeyLoader)
    except yaml.YAMLError as exc:
        errors.append(f"{rel}: invalid YAML: {exc}")
        continue
    if not isinstance(doc, dict):
        errors.append(f"{rel}: top-level YAML must be a mapping")
        continue
    if rel.name.startswith("azure-pipelines"):
        if "steps" not in doc and "stages" not in doc and "jobs" not in doc:
            errors.append(f"{rel}: Azure pipeline has no steps, jobs or stages")
        reviewed_validation = reviewed_admin_validation(rel, doc)
        if str(rel) == "azure-pipelines-admin-dashboard.yml" and not reviewed_validation:
            errors.append(f"{rel}: reviewed automatic-validation/manual-production contract changed; re-review required")
        if not reviewed_validation and doc.get("trigger") not in (None, "none", {"none": True}):
            errors.append(f"{rel}: automatic CI trigger must be reviewed; expected trigger: none")
        if not reviewed_validation and doc.get("pr") not in (None, "none", {"none": True}):
            errors.append(f"{rel}: automatic PR trigger must be reviewed; expected pr: none")

if errors:
    print("\n".join(f"ERROR: {item}" for item in errors), file=sys.stderr)
    raise SystemExit(1)
print(f"SUCCESS: validated {len(FILES)} pipeline YAML files")
