# The `fleet-timers` queue (owner step, not created yet)

`main.bicep` defines one Service Bus queue, `fleet-timers`, on the namespace production already has. integration-service
uses it only when `CRAVES_FLEET_TIMERS` is `shadow` or `on` (off by default; `docs/riders/DISPATCH.md` "Timers",
`docs/riders/BACKEND.md` "Dispatch chain" step 5b).

Nothing creates it: no pipeline, no workflow and no agent runs this file. A signed-in person does, once.

- **Only in production subscription `34eefd95-1a19-416f-b9df-92b326500615`** (account ravitejamm6@gmail.com). Never in
  the idle subscription `721906c9` or the retired ones named in `AGENTS.md`.
- It adds one queue. It changes no existing queue, topic, rule or setting: the template names the namespace as
  `existing` and declares nothing else.
- Until it exists, leave `CRAVES_FLEET_TIMERS` off. If the flag is switched on without the queue, the service still
  starts and dispatch works as with off: the sends fail, `CRAVES_ALERT alert=FLEET_TIMERS_SEND_FAILED` and
  `FLEET_TIMERS_RECEIVE_FAILED` are logged at most once a minute each, and every order goes on by its delivery command.
- Since 17 Nov 2026 `CRAVES_FLEET_TIMERS` is set by hand on integration-service in `/opt/craves/compose.json` on the
  production VM, not on a container app (`docs/runbooks/production-environment.md`). Deploys there are manual, and the
  flag works only once the integration container runs a build that has this code (nothing merged from 17 Nov is live yet).

## Create it

```bash
az account set --subscription 34eefd95-1a19-416f-b9df-92b326500615
az account show --query "{subscription:id, user:user.name}" -o table      # must show 34eefd95… before going on

# Read only: find the namespace that holds the delivery-command queue, and its resource group.
az servicebus namespace list --query "[].{name:name, resourceGroup:resourceGroup, sku:sku.name}" -o table
az servicebus queue show -g <resource group> --namespace-name <namespace> -n delivery-command --query name -o tsv

# From a checkout of GitHub main. what-if must show exactly one resource to create and nothing to modify or delete.
az deployment group what-if -g <resource group> -f infra/fleet-timers/main.bicep -p serviceBusNamespaceName=<namespace>
az deployment group create  -g <resource group> -f infra/fleet-timers/main.bicep -p serviceBusNamespaceName=<namespace>

az servicebus queue show -g <resource group> --namespace-name <namespace> -n fleet-timers \
  --query "{duplicateDetection:requiresDuplicateDetection, ttl:defaultMessageTimeToLive, lock:lockDuration, maxDelivery:maxDeliveryCount}"
# expect: false, PT10M, PT1M, 10
```

## Access

integration-service signed in to Service Bus as its own identity (`id-craves-integration-prod`,
`docs/runbooks/production-environment.md`) while it ran on Container Apps. Since 17 Nov 2026 it runs as a container on the
production VM; which identity that container uses is to be confirmed by the owner. It must be able to send to and receive from the new queue. If its Service
Bus role is granted on the namespace, nothing more is needed. If it is granted queue by queue, grant the same role on
`fleet-timers` (read the existing grants first: `az role assignment list --assignee <the identity's principal id> --all -o table`).

## Undo

Set `CRAVES_FLEET_TIMERS` back to `off` first (dispatch then never touches the queue), then
`az servicebus queue delete -g <resource group> --namespace-name <namespace> -n fleet-timers`.
