# F06: read-only protection inventory

This module adds no Auth behavior or activation. It reads only the existing Auth Container App and revision metadata through the existing Azure pipeline122/service connection. No new resources, credentials, permissions, OTPs, customer calls or database requests are involved.

## Files

- `scripts/release/inspect-auth-protection.py`: exact subscription/resource/app allowlist; captures reviewed numeric/boolean/mode settings, missing-source-default distinctions, single active ready revision, desired/running differences, and before/after drift checks. It never resolves secrets or exports unknown setting values. Container image tags are not treated as provenance proof.
- `scripts/release/tests/test_auth_protection_inventory.py`: twelve isolated fixtures covering read-only scope, private-value redaction, duplicates, unknown images/values, absent defaults, setting divergence, configuration/revision drift and wrong subscription.
- `azure-pipelines-email-readiness-status.yml`: explicit `inspect-auth-protection` action; tests run before the read.
- `.github/workflows/launch-regression-ci.yml`: includes those fixtures in the exact-source regression gate.

## Local test

Python3, standard library only:

```text
python -m unittest discover -s scripts/release/tests -p test_auth_protection_inventory.py -v
```

The local tests use synthetic metadata; they do not connect to Azure. The actual inspector requires the existing scoped authenticated Azure CLI context. Run it through pipeline122 on the reviewed branch, choosing only `inspect-auth-protection`. Do not select legacy release actions for this read-only audit.

## Interpretation and manual steps

The receipt always says activationAccepted=false. Explicit environment values are metadata, not independently established effective Spring configuration. Absent values show the documented source defaults, not a claim about an unlabelled running image. JVM/Spring override names and command/argument presence are reported without contents. Gateway rules, image provenance, actual bounded responses and a reviewed safe activation/recovery procedure are separate evidence.

No portal settings, DNS, keys, app-store work or owner input is required to run this read-only check. Activating protection is a separate reviewed change; preserve the working email flow, existing migrations and current limits until that evidence exists. Do not stress public sign-in or weaken remaining protections to make a test pass.
