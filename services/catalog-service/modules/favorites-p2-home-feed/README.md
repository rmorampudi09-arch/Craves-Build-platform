# Favorites 2.0 P2 — Favorite Home Feed

## Purpose

Catalog P2 turns customer-owned favorite chef/kitchen IDs into current, privacy-reduced home-food facts for the Saved/Home experience.

Endpoint:

`POST /api/v1/discovery/favorites/home/resolve`

Input is a combined batch of up to 100 chef identity IDs and kitchen IDs. The endpoint does not receive or persist customer identity, favorite ownership, notification preferences or order history.

## Response truth

The resolver emits only Catalog-owned facts:

- kitchen name/display name and lifecycle status
- area/city/state
- count of ACTIVE + `is_available=true` dishes
- at most three current dish previews
- authoritative schedule state
- `COOKING_NOW`, `COOKING_LATER_TODAY`, `NOT_TODAY`, `PAUSED`, `NOT_ACCEPTING`, `INACTIVE`, or `MISSING`
- next schedule opening when deterministically available within the seven-day lookup window

It does **not** claim delivery serviceability, sold-out quantity, ratings, review quality, health/freshness, inventory scarcity, order count or customer-specific eligibility.

## Scale

The request is bounded to 100 relationships. Database work is batch-oriented: kitchen/config projection, active-item counts, bounded previews, weekly windows and date overrides. The mobile client does not need one request per favorite chef/kitchen.

## Privacy

No phone number, email, exact address line, coordinates or document/KYC field is returned. Chef identity IDs are only used for matching an ID the caller already supplied.

## Local verification

```bash
cd services/catalog-service
mvn -B -ntp clean verify
```

## Runtime order later

1. Deploy Catalog V7 schedule baseline and P1B resolver dependency.
2. Deploy this Catalog source through the existing guarded Catalog pipeline.
3. Publish the P2 APIM operation after the new revision is healthy.
4. Smoke valid, missing and inactive relationships and capture correlation IDs.
5. Only then certify the P2 mobile Saved/Home experience.

No new Azure resource, secret or billable infrastructure is created by this module.
