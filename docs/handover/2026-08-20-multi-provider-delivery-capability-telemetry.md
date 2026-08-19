# Craves Multi-Provider Delivery Capability & Telemetry — Engineering Handover

**Date:** 2026-08-20  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Production execution:** deferred. No Azure DevOps deployment, Service Bus filter mutation, APIM activation or live-location activation was executed while building this module.

Delivery is now modeled as a multi-provider capability system rather than a Borzo-centered implementation. Craves keeps one provider-neutral transaction/read model and uses provider-specific adapters to preserve each provider's verified capabilities.

## Providers

Borzo, Shiprocket Quick, Shadowfax, Porter and Delhivery Direct Intracity are represented as peer providers.

## Core boundary

`DeliveryProviderAdapter.quote/create/cancel/track` remains provider-neutral. Provider-specific semantics stay inside Integration Service. Order Service receives normalized status and telemetry only. Provider priority/fallback, pricing, commission and refund consequences are not introduced here.

## Capability model

Capabilities include serviceability, quote/ETA, create/cancel, track/tracking link, webhook status, live courier location, provider ETA, delivery verification/POD, NDR actions, return tracking, create reconciliation and multi-stop.

States are `AVAILABLE_NOW`, `SUPPORTED_NOT_WIRED`, `PRIVATE_CONTRACT_REQUIRED`, `NOT_VERIFIED` and `NOT_SUPPORTED`.

The capability matrix must never be used as a commercial provider-ranking table.

## Current runtime implementation

Borzo tracking + normalized webhook telemetry can retain validated courier coordinates, provider-native exact pickup/drop-off ETA and arrival windows.

Shiprocket is first-class: tracking responses and normalized webhooks can retain the latest valid GPS point from tracking scans plus provider ETD as exact drop-off ETA. Arbitrary top-level coordinates are not accepted as rider GPS; coordinates must be paired, valid, non-zero, fresh and from trusted scan structures.

Shadowfax, Porter and Delhivery Direct Intracity remain peer provider profiles, but their exact Craves partner transaction/auth/webhook contracts are absent from authoritative repo docs, so executable operations stay fail-closed rather than guessed.

## Telemetry event/storage

Producer: `DELIVERY_TELEMETRY_UPDATED 1.1`; Order accepts 1.0 and 1.1.

Migrations:
- Integration V112 telemetry projection
- Integration V113 exact provider ETA
- Order V17 telemetry projection
- Order V18 exact provider ETA

Only the latest useful snapshot is projected; no unbounded GPS history is created.

## Webhook safety

A newer same-state callback may update telemetry without another status event. Stale/equal, unknown or terminal-protected callbacks cannot update live telemetry. A late non-terminal callback cannot resurrect telemetry after terminal delivery.

## Customer/chef experience

`trackingExperience` is derived for the already-selected provider:
- fresh privacy-approved coordinates -> LIVE_MAP
- else provider tracking URL -> PROVIDER_TRACKING_LINK
- else STATUS_TIMELINE

This does not rank/select providers.

## Privacy

`CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false` by default. Exact location requires explicit activation and freshness/terminal checks. Courier PII, raw provider payloads/credentials, private addresses and raw POD URLs are not exposed.

## Validation

GitHub Backend completion CI run 396 passed source integrity and Maven verify for all seven Java services at the validated multi-provider runtime state. Later commits only refine documentation/Azure source gates.

The separate Admin dashboard workflow had an unrelated Next.js admin test failure; its Order-service admin authorization job passed. That frontend issue remains visible for the admin workstream.

## Azure status

Azure pipelines are intentionally deferred until all modules are complete. The delivery downstream source gate now checks V17/V18/V112/V113, the capability registry, Borzo/Shiprocket extractors, event v1.1, `trackingExperience`, no-ranking/private-contract guards and live-location fail-closed behavior.

## Partner contracts still required

Shadowfax, Porter and Delhivery Direct Intracity require verified sandbox/production URLs, auth, quote/serviceability, create/cancel/track, webhooks/signatures, idempotency, rate limits and POD/OTP semantics from their onboarding channels. Secrets must be Key Vault-backed, never pasted into chat/source.

## Product decisions still blocked

Provider priority/fallback; NDR reattempt versus return; who may initiate return; customer NDR confirmation; POD presentation; Delivery Code/OTP exposure; and commercial consequences of failed/returned delivery.
