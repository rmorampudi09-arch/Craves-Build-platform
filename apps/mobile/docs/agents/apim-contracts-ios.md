# APIM Contracts iOS Readiness

## P119 Status

`npm run check:p119` passes from `/workspace/scratch/4bd5168d545c/craves-platform/apps/mobile`.

Current evidence:

```text
[P119] PASS: 91 production mobile HTTP actions across 3 published manifests are mapped; 29 call-bearing source files audited.
```

## Contract Manifests

The mobile P119 gate expects these exact contract manifests:

- `/workspace/scratch/4bd5168d545c/craves-platform/api/apim-api/contracts/mobile-production.v1.json`
- `/workspace/scratch/4bd5168d545c/craves-platform/api/apim-api/contracts/mobile-subscriptions.v1.json`
- `/workspace/scratch/4bd5168d545c/craves-platform/api/apim-api/contracts/mobile-catalog-presentation.v1.json`

The manifests now map all detected production mobile `httpClient` / `publicApiClient` calls and no longer use synthetic `/api/v1/mobile-contract/...` placeholder paths.

## Hardened Checks

`apps/mobile/scripts/p119-apim-contract-coverage-check.mjs` now fails when a manifest contains:

- Missing P119 schema or empty action list.
- Unsupported HTTP method or auth mode.
- Absolute URLs or routes outside `/api/v1`.
- Synthetic `/mobile-contract/` placeholder routes.
- Unresolved template fragments, line breaks, backticks, or `$` markers.
- Adjacent unresolved placeholders such as `{value}{value}`.
- Characters outside the mobile APIM route grammar.
- Missing source files.
- Model or validator names that do not deterministically match the action id.
- Mobile source files importing Axios outside the centralized transport.
- Direct Azure backend hosts or APIM/internal credential literals in mobile source.
- Call-count drift between mobile source and published manifests.
- Quarantined routes still present in production mobile source.

`apps/mobile/__tests__/APIMContractManifestGuards.test.ts` also covers the manifest schema, route quality, and deterministic model/validator naming during normal Jest runs.

## Residual Risk

These files are still generated/restored from the current mobile source surface in this sandbox. Before final release approval, replace or reconcile them with the APIM-published source-of-truth manifests from the platform/API pipeline, then rerun:

```bash
cd /workspace/scratch/4bd5168d545c/craves-platform/apps/mobile
npm run check:p119
npm test -- --runInBand --runTestsByPath __tests__/APIMContractManifestGuards.test.ts
```
