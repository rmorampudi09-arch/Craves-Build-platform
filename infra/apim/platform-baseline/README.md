# Craves APIM Platform Baseline

## Purpose

Reusable, non-destructive gateway hardening for the production Craves API surface. This module prepares correlation, safe response headers, JSON body-size protection, and a conservative public-discovery abuse ceiling without changing customer/chef business rules.

## Fragments

### `CravesCorrelationInbound`

Adds `X-Correlation-ID` only when the caller did not already provide one. APIM `context.RequestId` is used as the gateway-generated value.

### `CravesSecurityOutbound`

Returns the request correlation ID and adds:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

### `CravesJsonBodyGuard`

Provides a reusable 1 MiB maximum request body guard for normal JSON operations. It must not be attached to multipart/media upload routes.

## Discovery hardening

`scripts/apim/configure-apim-platform-baseline.sh` applies correlation and outbound security headers only to the two existing public discovery operations:

```text
discover-nearby-kitchens
discover-nearby-menu-items
```

When supported by the active APIM SKU, it also adds a configurable `rate-limit-by-key` ceiling. Defaults:

```text
6000 calls / 60 seconds / source IP / API
```

This is an abuse ceiling, not a product quota. It is intentionally high because many mobile users can share a carrier-grade NAT address. Tune it only from observed production traffic and load-test evidence.

On APIM Consumption tier, the script skips `rate-limit-by-key` rather than failing deployment.

## Replacement safety

The script refuses to overwrite an unknown custom discovery operation policy. It automatically proceeds only when the operation policy is absent, effectively base-only, or already contains the Craves baseline fragment.

An explicit override is possible with:

```text
ALLOW_REPLACE_DISCOVERY_OPERATION_POLICY=true
```

Use that only after reviewing/snapshotting the current policy.

## No billable resource creation

This module does not create or scale APIM, Redis, Container Apps, PostgreSQL, Front Door, Application Insights, or any other Azure resource.

## Production command

```bash
bash scripts/apim/configure-apim-platform-baseline.sh
```

Optional settings:

```text
DISCOVERY_RATE_LIMIT_CALLS
DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS
ENABLE_DISCOVERY_RATE_LIMIT
ALLOW_REPLACE_DISCOVERY_OPERATION_POLICY
```

## Verification

After execution verify:

```text
X-Correlation-ID is present end-to-end
X-Content-Type-Options is nosniff
Referrer-Policy is no-referrer
public discovery still returns the same functional payload
429 appears only when the configured burst ceiling is genuinely exceeded
no unrelated API or operation policy changed
```

## Rollback

Use `scripts/apim/rollback-apim-platform-baseline.sh`. It removes only a recognized Craves baseline policy from the two discovery operations and leaves the reusable policy fragments in place. Unreferenced fragments are inert and can remain safely for later APIs.
