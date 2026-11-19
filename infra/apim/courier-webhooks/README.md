# Courier webhook gateway policy

One operation policy, `policy.xml`, for the two courier webhook routes listed in `routes.txt`, both served by integration-service:

```text
POST /api/v1/webhooks/delivery/borzo
POST /api/v1/webhooks/delivery/pidge
```

`scripts/apim/tests/test_courier_webhooks_apim.py` fails when `routes.txt` differs from the controllers or when a policy value changes without the test.

## What the policy sets

| Setting | Value | Notes |
|---|---|---|
| `validate-content max-size` | 262144 bytes, larger bodies are not forwarded | Equal to the size integration-service accepts on the Pidge route today (262,144 characters). The gateway counts bytes, so a body with non-ASCII text reaches the limit sooner. Lower it only after measuring stored callback sizes |
| `rate-limit-by-key` | 300 calls per 60 s per caller address (`context.Request.IpAddress`), then 429 | Needs a gateway tier that has `rate-limit-by-key` (not Consumption). Counted per gateway unit, so approximate |
| `ip-filter` | not set | No courier address list is published. Add one only from a list the courier provides |

Everything else is inherited through `<base />`: the backend, headers and error handling stay as they are. The service keeps checking each callback's credential and body as today.

## Apply

Nothing in CI or in a release pipeline applies this folder. Someone with rights on API Management applies it by hand, from a checkout of `main`, **on a non-production instance first**, then on production. Replace every `<PLACEHOLDER>`.

Since 17 Nov 2026 production runs on a VM behind a Caddy proxy (`docs/runbooks/production-environment.md`). Whether API Management still fronts production, and so whether this policy reaches the courier callbacks at all, is to be confirmed by the owner. Confirm it before applying.

1. Find the API and the operation that serve each route (read-only). If a route is served by a wildcard operation, stop: it needs its own `POST` operation in the same API first, so the policy does not reach other routes.

```bash
az account set -s <SUBSCRIPTION_ID>
az apim api list -g <RESOURCE_GROUP> --service-name <APIM_NAME> --query "[].{id:name,path:path}" -o table
az apim api operation list -g <RESOURCE_GROUP> --service-name <APIM_NAME> --api-id <API_ID> --query "[?method=='POST'].{id:name,url:urlTemplate}" -o table
```

2. Record what each route answers now, and save the operation's current policy (an error here means it has none):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://<GATEWAY_HOST>/api/v1/webhooks/delivery/<COURIER> -H 'Content-Type: application/json' --data '{}'
URL="https://management.azure.com/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RESOURCE_GROUP>/providers/Microsoft.ApiManagement/service/<APIM_NAME>/apis/<API_ID>/operations/<OPERATION_ID>/policies/policy?api-version=2022-08-01"
az rest --method get --url "$URL&format=rawxml" --query properties.value -o tsv > before-<OPERATION_ID>.xml
```

3. Apply, once per operation:

```bash
jq -Rs '{properties:{format:"rawxml",value:.}}' infra/apim/courier-webhooks/policy.xml > policy.json && az rest --method put --url "$URL" --body @policy.json -o none
```

The gateway validates the XML on this call and rejects it with a message if it does not accept a value; nothing changes in that case.

## Verify

- Read back: `az rest --method get --url "$URL&format=rawxml" --query properties.value -o tsv` shows `max-size="262144"` and `calls="300"`.
- The request from step 2 (`{}`, no credential) gets the same status as before the change. It stores nothing.
- On the non-production instance only: a body over 262144 bytes gets a 4xx from the gateway, and more than 300 calls within 60 s from one address get 429. Check there too that calls from two different addresses are counted separately; if the gateway sits behind an edge proxy and sees one address for every caller, do not apply to production and report it.
- After production: the next real callbacks from each courier are stored as before (`delivery_webhook_inbox` keeps growing) and the gateway shows no 429 for these operations.

## Roll back

Put the saved policy back, or delete the operation policy when there was none. The routes then behave as before; the service, flags and data are untouched.

```bash
jq -Rs '{properties:{format:"rawxml",value:.}}' before-<OPERATION_ID>.xml > before.json && az rest --method put --url "$URL" --body @before.json -o none
az rest --method delete --url "$URL" --headers 'If-Match=*'
```
