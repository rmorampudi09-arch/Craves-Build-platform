# Kitchen Schedule & Availability v1

## Purpose

Production backend support for Hyderabad home chefs to control when their kitchen is accepting orders, including weekly service windows, temporary pauses, and date-specific overrides. Catalog Service owns this domain in the Craves architecture.

No customer/chef web or mobile frontend is changed by this module.

## Compatibility rule

A kitchen with **no weekly schedule configured** remains schedule-open by default. This preserves current production behavior after deployment. The new schedule only restricts a kitchen after the chef explicitly configures it or sets a date override/pause.

## Timezone

Schedule evaluation uses:

```text
Asia/Kolkata
```

This matches the current Hyderabad business scope. The timezone is persisted per schedule so the design can be extended later without changing the API model.

## Chef API

Base:

```http
/api/v1/kitchens/me/schedule
```

### Read schedule

```http
GET /api/v1/kitchens/me/schedule
```

### Replace weekly schedule / pause state

```http
PUT /api/v1/kitchens/me/schedule
Content-Type: application/json
Authorization: Bearer <Craves JWT>
```

Example:

```json
{
  "acceptingOrders": true,
  "pausedUntil": null,
  "pauseReason": null,
  "weeklyWindows": [
    {"dayOfWeek": 1, "opensAt": "07:00:00", "closesAt": "10:30:00"},
    {"dayOfWeek": 1, "opensAt": "18:00:00", "closesAt": "21:30:00"}
  ]
}
```

ISO day-of-week is used:

```text
1 Monday
2 Tuesday
3 Wednesday
4 Thursday
5 Friday
6 Saturday
7 Sunday
```

A service window must start and end on the same local day and `opensAt < closesAt`. Multiple non-overlapping windows per day are supported.

`weeklyWindows: []` explicitly clears the weekly schedule, returning the kitchen to backward-compatible unrestricted schedule behavior unless paused, not accepting orders, inactive, or a date override applies.

### Date override

```http
GET    /api/v1/kitchens/me/schedule/overrides/{yyyy-MM-dd}
PUT    /api/v1/kitchens/me/schedule/overrides/{yyyy-MM-dd}
DELETE /api/v1/kitchens/me/schedule/overrides/{yyyy-MM-dd}
```

Closed date example:

```json
{
  "closed": true,
  "reason": "Personal leave",
  "windows": []
}
```

Special-hours example:

```json
{
  "closed": false,
  "reason": "Festival hours",
  "windows": [
    {"opensAt": "08:00:00", "closesAt": "12:00:00"}
  ]
}
```

A date override replaces weekly windows for that date. A closed override cannot include windows; an open override must include at least one window.

## Public live availability API

Service endpoint:

```http
GET /api/v1/catalog/kitchens/{kitchenId}/availability
```

APIM public discovery alias:

```http
GET /api/v1/discovery/kitchens/{kitchenId}/availability
```

Optional deterministic evaluation time:

```text
?at=2026-08-19T14:30:00Z
```

If `at` is omitted, the service evaluates the current instant.

Response includes:

```text
kitchenActive
scheduleConfigured
acceptingOrders
paused
openBySchedule
availableNow
localDate/localTime/timezoneId
```

`availableNow` is true only when all of these are true:

```text
kitchen status is ACTIVE
acceptingOrders is true
pause is not active
schedule/date override says open
```

This is Catalog schedule availability. Final delivery serviceability, delivery provider capacity, price/fees, and checkout validation remain separate concerns.

## Validation and safety

Technical guards:

```text
weekly windows <= 56
per-date override windows <= 8
reason <= 160 characters
no overlapping windows
same-local-day windows only
```

Chef identity is taken from the authenticated Craves principal and mapped to that chef's kitchen. Clients cannot submit a different kitchen ID for management endpoints.

## Audit

Every weekly schedule replacement, date-override upsert, and override deletion writes an audit row containing:

```text
kitchen ID
actor identity ID
action
old JSON snapshot
new JSON snapshot
timestamp
```

## Database

Flyway:

```text
V7__kitchen_schedule_availability.sql
```

Tables:

```text
catalog_schema.kitchen_schedule_config
catalog_schema.kitchen_weekly_service_window
catalog_schema.kitchen_schedule_date_override
catalog_schema.kitchen_schedule_override_window
catalog_schema.kitchen_schedule_audit
```

## APIM

Configure:

```bash
bash scripts/apim/configure-kitchen-schedule-v1-apim.sh
```

Rollback only the new operations:

```bash
bash scripts/apim/rollback-kitchen-schedule-v1-apim.sh
```

The rollback does not delete the existing Chef Kitchen or Discovery APIs.

## Local / CI test

```bash
cd services/catalog-service
mvn -B -ntp clean verify
```

Integration checks should cover:

```text
existing kitchen with no schedule -> schedule-open
chef replaces weekly schedule
multiple non-overlapping windows
reject overlapping windows
pause active vs expired pause
closed date override
special-hours date override
inactive kitchen -> availableNow false
boundary at opensAt inclusive
boundary at closesAt exclusive
chef identity isolation
audit rows written for every mutation
APIM chef routes require Bearer authentication
public availability response is no-store
```

## Azure impact

No new Azure resource or secret is required. Catalog Flyway V7 adds tables/indexes to the existing Business PostgreSQL database. Deploy through the existing Catalog Service Azure DevOps pipeline before running the APIM configuration script.

## Deliberately excluded

This module does not define:

```text
chef order capacity per slot
minimum order value
pricing or commission
delivery radius
delivery provider availability
ratings/reviews
FSSAI/KYC
refund/cancellation policy
subscription capacity rules
frontend schedule UI
```
