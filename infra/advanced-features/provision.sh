#!/usr/bin/env bash
# Production infrastructure for advanced-features-service, following the one-resource-group-per-feature design
# (Craves-Dev project doc claude/new-subscription-build.md). Idempotent and additive: it never deletes or changes another
# feature's resources, except short-lived firewall/network rules for this Cloud Shell that it removes again.
#
# Normally run once through setup-once.sh. Phases (Azure Cloud Shell, directory ravitejamm6gmail):
#   bash provision.sh all <main-commit>
#   bash provision.sh network|identity|vault|database|environment|firewall|apim|apim-remove|devops|alerts|lock
#   bash provision.sh image|app <main-commit>        (only code that is on GitHub main)
set -euo pipefail
set +H
az config set extension.use_dynamic_install=yes_without_prompt >/dev/null 2>&1 || true

SUB=34eefd95-1a19-416f-b9df-92b326500615
LOC=centralindia
FEATURE=advanced
RG=rg-craves-$FEATURE-prod
VNET=vnet-craves-$FEATURE-prod
SUBNET=infra
NAT=nat-craves-$FEATURE
PIP=pip-nat-craves-$FEATURE
UAI=id-craves-$FEATURE-prod
KV=kv-crv-$FEATURE-34eefd
CAE=cae-craves-$FEATURE-prod
APP=ca-craves-$FEATURE-prod
IMAGE_REPO=craves/advanced-features-service
ACR=crcravesprod34eefd
SHARED_RG=rg-craves-shared-prod
APIM_NAME=apim-craves-prod-34eefd
API_ID=craves-adv-v1
API_PATH=api/v1/advanced
LAW=law-craves-prod
TEMPLATE_RG=rg-craves-catalog-prod
TEMPLATE_APP=ca-craves-catalog-prod
PG_RG=rg-craves-data-business-prod
PG=pg-craves-business-prod
DB=craves_advanced_db
DB_USER=craves_advanced
GITHUB_REPO=rmorampudi09-arch/Craves-Build-platform
ORG=https://dev.azure.com/ravitejamm6
PROJECT=Craves-New-Original
ADO_RESOURCE=499b84ac-1321-427f-aa17-267ca6975798
APIM_OUTBOUND_IP=4.188.68.132
# Static egress IPs of the other features (network lockdown, 30 Oct 2026).
FEATURE_NAT_IPS="20.198.108.229 20.235.64.75 20.198.125.128 20.219.136.254 20.235.95.84 20.204.118.52 20.204.46.72 20.192.2.161 104.211.91.72 20.198.84.102 20.219.159.80 20.219.193.93"
TAGS="environment=prod product=craves feature=$FEATURE owner=raviteja.m@craves.in"
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
STATE=~/advanced-features-state
mkdir -p "$STATE"
az account set -s "$SUB"

log() { printf '\n== %s\n' "$*"; }
my_ip() { curl -fsS https://api.ipify.org; }
ado() { az rest --resource "$ADO_RESOURCE" "$@"; }

network() {
  log "Resource group $RG, VNet, NAT gateway (static egress IP)"
  az group create -n "$RG" -l "$LOC" --tags $TAGS -o none
  if ! az network vnet show -g "$RG" -n "$VNET" -o none 2>/dev/null; then
    local used x
    used=$(az network vnet list --query "[].addressSpace.addressPrefixes[]" -o tsv)
    for x in $(seq 22 120); do grep -q "^10\.$x\." <<<"$used" || break; done
    az network vnet create -g "$RG" -n "$VNET" -l "$LOC" --address-prefixes "10.$x.0.0/23" --subnet-name "$SUBNET" \
      --subnet-prefixes "10.$x.0.0/23" --tags $TAGS -o none
    az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --delegations Microsoft.App/environments -o none
  fi
  az network public-ip show -g "$RG" -n "$PIP" -o none 2>/dev/null || \
    az network public-ip create -g "$RG" -n "$PIP" -l "$LOC" --sku Standard --allocation-method Static --zone 1 2 3 --tags $TAGS -o none
  az network nat gateway show -g "$RG" -n "$NAT" -o none 2>/dev/null || \
    az network nat gateway create -g "$RG" -n "$NAT" -l "$LOC" --public-ip-addresses "$PIP" --idle-timeout 10 --tags $TAGS -o none
  az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --nat-gateway "$NAT" -o none
  az network public-ip show -g "$RG" -n "$PIP" --query ipAddress -o tsv | tee "$STATE/nat-ip"
}

nat_ip() { [ -s "$STATE/nat-ip" ] || az network public-ip show -g "$RG" -n "$PIP" --query ipAddress -o tsv > "$STATE/nat-ip"; cat "$STATE/nat-ip"; }

identity() {
  log "Managed identity $UAI with AcrPull"
  az identity show -g "$RG" -n "$UAI" -o none 2>/dev/null || az identity create -g "$RG" -n "$UAI" -l "$LOC" --tags $TAGS -o none
  local principal; principal=$(az identity show -g "$RG" -n "$UAI" --query principalId -o tsv)
  az role assignment create --assignee-object-id "$principal" --assignee-principal-type ServicePrincipal --role AcrPull \
    --scope "$(az acr show -n "$ACR" --query id -o tsv)" -o none 2>/dev/null || true
}

with_kv_access() { # vault command...: briefly allows this shell's IP on a firewalled vault, then removes it
  local vault=$1; shift
  local ip; ip=$(my_ip)
  az keyvault network-rule add -n "$vault" --ip-address "$ip/32" -o none
  sleep 25
  local rc=0; "$@" || rc=$?
  az keyvault network-rule remove -n "$vault" --ip-address "$ip/32" -o none || true
  return $rc
}

template_secret_url() { # Key Vault URL behind one of the template app's secret environment variables
  local ref; ref=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[?name=='$1'].secretRef | [0]" -o tsv)
  [ -n "$ref" ] || return 1
  az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.configuration.secrets[?name=='$ref'].keyVaultUrl | [0]" -o tsv
}

copy_secret() { # source-url target-name: copies a secret value into our vault without printing it
  local url=$1 target=$2 vault name tmp
  vault=$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$url"); name=$(sed -E 's#.*/secrets/([^/]+).*#\1#' <<<"$url")
  tmp=$(mktemp); chmod 600 "$tmp"
  with_kv_access "$vault" bash -c "az keyvault secret show --vault-name '$vault' -n '$name' --query value -o tsv > '$tmp'"
  [ -s "$tmp" ] || { rm -f "$tmp"; echo "Could not read $vault/$name"; return 1; }
  with_kv_access "$KV" az keyvault secret set --vault-name "$KV" -n "$target" --file "$tmp" -o none
  rm -f "$tmp"
}

vault() {
  log "Key Vault $KV (RBAC, purge protection, default deny + our NAT IP)"
  az keyvault show -n "$KV" -o none 2>/dev/null || az keyvault create -g "$RG" -n "$KV" -l "$LOC" --enable-rbac-authorization true \
    --enable-purge-protection true --retention-days 90 --default-action Deny --bypass AzureServices --tags $TAGS -o none
  local kv_id principal me
  kv_id=$(az keyvault show -n "$KV" --query id -o tsv)
  principal=$(az identity show -g "$RG" -n "$UAI" --query principalId -o tsv)
  me=$(az ad signed-in-user show --query id -o tsv)
  az role assignment create --assignee-object-id "$principal" --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" --scope "$kv_id" -o none 2>/dev/null || true
  az role assignment create --assignee-object-id "$me" --assignee-principal-type User --role "Key Vault Secrets Officer" --scope "$kv_id" -o none 2>/dev/null || true
  az keyvault network-rule add -n "$KV" --ip-address "$(nat_ip)/32" -o none
  sleep 30 # role assignments propagate
  copy_secret "$(template_secret_url CRAVES_JWT_VERIFICATION_PEM_BASE64)" craves-jwt-verification-pem-base64
  if ! with_kv_access "$KV" az keyvault secret show --vault-name "$KV" -n adv-db-password -o none 2>/dev/null; then
    local tmp; tmp=$(mktemp); chmod 600 "$tmp"
    openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-40 > "$tmp"
    with_kv_access "$KV" az keyvault secret set --vault-name "$KV" -n adv-db-password --file "$tmp" -o none
    rm -f "$tmp"
  fi
  echo "Secrets in $KV: craves-jwt-verification-pem-base64, adv-db-password"
}

database() {
  log "Database $DB and least-privilege login $DB_USER on $PG"
  az postgres flexible-server db show -g "$PG_RG" -s "$PG" -d "$DB" -o none 2>/dev/null || az postgres flexible-server db create -g "$PG_RG" -s "$PG" -d "$DB" -o none
  local fqdn admin ip admin_pw db_pw rc=0
  fqdn=$(az postgres flexible-server show -g "$PG_RG" -n "$PG" --query fullyQualifiedDomainName -o tsv)
  admin=$(az postgres flexible-server show -g "$PG_RG" -n "$PG" --query administratorLogin -o tsv)
  admin_pw=$(mktemp); db_pw=$(mktemp); chmod 600 "$admin_pw" "$db_pw"
  if [ -n "${PGADMINPASSWORD:-}" ]; then printf '%s' "$PGADMINPASSWORD" > "$admin_pw"
  elif [ "$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[?name=='SPRING_DATASOURCE_USERNAME'].value | [0]" -o tsv)" = "$admin" ]; then
    local url vault name; url=$(template_secret_url SPRING_DATASOURCE_PASSWORD)
    vault=$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$url"); name=$(sed -E 's#.*/secrets/([^/]+).*#\1#' <<<"$url")
    with_kv_access "$vault" bash -c "az keyvault secret show --vault-name '$vault' -n '$name' --query value -o tsv > '$admin_pw'"
  else
    rm -f "$admin_pw" "$db_pw"; echo "The template app does not connect as $admin: export PGADMINPASSWORD and rerun"; return 1
  fi
  with_kv_access "$KV" bash -c "az keyvault secret show --vault-name '$KV' -n adv-db-password --query value -o tsv > '$db_pw'"
  ip=$(my_ip)
  az postgres flexible-server firewall-rule create -g "$PG_RG" --server-name "$PG" --name advanced-provision-shell --start-ip-address "$ip" --end-ip-address "$ip" -o none
  PGPASSWORD="$(cat "$admin_pw")" psql "host=$fqdn port=5432 dbname=postgres user=$admin sslmode=require" -v ON_ERROR_STOP=1 -q \
    -v role="$DB_USER" -v pw="$(cat "$db_pw")" -v db="$DB" <<'SQL' || rc=$?
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'role', :'pw') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO %I', :'db', :'role') \gexec
SQL
  rm -f "$admin_pw" "$db_pw"
  # The data RG carries a CanNotDelete lock: lift it only around deleting our own temporary rule, then restore it as it was.
  local lock_name lock_notes
  lock_name=$(az lock list -g "$PG_RG" --query "[?level=='CanNotDelete'] | [0].name" -o tsv)
  lock_notes=$(az lock list -g "$PG_RG" --query "[?level=='CanNotDelete'] | [0].notes" -o tsv)
  if [ -n "$lock_name" ]; then az lock delete -g "$PG_RG" -n "$lock_name" -o none; fi
  az postgres flexible-server firewall-rule delete -g "$PG_RG" --server-name "$PG" --name advanced-provision-shell --yes -o none || rc=1
  if [ -n "$lock_name" ]; then az lock create -g "$PG_RG" -n "$lock_name" --lock-type CanNotDelete --notes "${lock_notes:-}" -o none; fi
  return $rc
}

firewall() {
  log "Business Postgres admits the $FEATURE NAT IP"
  local nat; nat=$(nat_ip)
  az postgres flexible-server firewall-rule create -g "$PG_RG" --server-name "$PG" --name "cae-$FEATURE" --start-ip-address "$nat" --end-ip-address "$nat" -o none
}

environment() {
  log "Container Apps environment $CAE (zone redundant, workload profiles, logs to $LAW)"
  if az containerapp env show -g "$RG" -n "$CAE" -o none 2>/dev/null; then echo "exists"; return; fi
  local subnet ws_id ws_key
  subnet=$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --query id -o tsv)
  ws_id=$(az monitor log-analytics workspace show -g "$SHARED_RG" -n "$LAW" --query customerId -o tsv)
  ws_key=$(az monitor log-analytics workspace get-shared-keys -g "$SHARED_RG" -n "$LAW" --query primarySharedKey -o tsv)
  az containerapp env create -g "$RG" -n "$CAE" -l "$LOC" --infrastructure-subnet-resource-id "$subnet" --enable-workload-profiles \
    --zone-redundant --logs-destination log-analytics --logs-workspace-id "$ws_id" --logs-workspace-key "$ws_key" --tags $TAGS -o none
}

source_dir() { # the service source at a main commit
  local commit=$1 dir="$STATE/src-$1"
  if [ ! -f "$dir/services/advanced-features-service/pom.xml" ]; then
    mkdir -p "$dir"
    curl -fsSL "https://codeload.github.com/$GITHUB_REPO/tar.gz/$commit" | tar -xz -C "$dir" --strip-components=1 --wildcards '*/services/advanced-features-service/*'
  fi
  echo "$dir/services/advanced-features-service"
}

image() {
  local commit=${1:?main commit}
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Give the full 40-character main commit"; return 1; }
  local tag=${commit:0:12}
  log "Image $IMAGE_REPO:$tag"
  if az acr repository show -n "$ACR" --image "$IMAGE_REPO:$tag" -o none 2>/dev/null; then echo "exists"; return; fi
  az acr build -r "$ACR" -t "$IMAGE_REPO:$tag" -f Dockerfile "$(source_dir "$commit")" --no-logs -o none
}

app() {
  local commit=${1:?main commit}
  local tag=${commit:0:12}
  log "Container app $APP ($IMAGE_REPO:$tag)"
  local env_id uai_id kv_uri fqdn ip i=0 restrictions
  env_id=$(az containerapp env show -g "$RG" -n "$CAE" --query id -o tsv)
  uai_id=$(az identity show -g "$RG" -n "$UAI" --query id -o tsv)
  kv_uri=$(az keyvault show -n "$KV" --query properties.vaultUri -o tsv)
  fqdn=$(az postgres flexible-server show -g "$PG_RG" -n "$PG" --query fullyQualifiedDomainName -o tsv)
  restrictions="      - {name: apim, action: Allow, ipAddressRange: $APIM_OUTBOUND_IP/32}"
  for ip in $FEATURE_NAT_IPS $(nat_ip); do i=$((i+1)); restrictions="$restrictions
      - {name: nat-$i, action: Allow, ipAddressRange: $ip/32}"; done
  cat > "$STATE/app.yaml" <<YAML
location: $LOC
identity:
  type: UserAssigned
  userAssignedIdentities:
    $uai_id: {}
tags: {environment: prod, product: craves, feature: $FEATURE, owner: raviteja.m@craves.in}
properties:
  environmentId: $env_id
  workloadProfileName: Consumption
  configuration:
    activeRevisionsMode: Multiple
    ingress:
      external: true
      targetPort: 8080
      transport: auto
      allowInsecure: false
      traffic:
      - {latestRevision: true, weight: 100}
      ipSecurityRestrictions:
$restrictions
    registries:
    - {server: $ACR.azurecr.io, identity: $uai_id}
    secrets:
    - {name: jwt-pem, keyVaultUrl: ${kv_uri}secrets/craves-jwt-verification-pem-base64, identity: $uai_id}
    - {name: db-password, keyVaultUrl: ${kv_uri}secrets/adv-db-password, identity: $uai_id}
  template:
    revisionSuffix: m${tag:0:8}
    containers:
    - name: advanced-features
      image: $ACR.azurecr.io/$IMAGE_REPO:$tag
      resources: {cpu: 1.0, memory: 2Gi}
      env:
      - {name: CRAVES_ENVIRONMENT, value: prodlow}
      - {name: ADV_DB_URL, value: "jdbc:postgresql://$fqdn:5432/$DB?sslmode=require"}
      - {name: ADV_DB_USER, value: $DB_USER}
      - {name: ADV_DB_PASSWORD, secretRef: db-password}
      - {name: CRAVES_JWT_VERIFICATION_PEM_BASE64, secretRef: jwt-pem}
      - {name: CRAVES_JWT_ISSUER, value: https://api.craves.in/auth}
      - {name: CRAVES_JWT_AUDIENCE, value: craves-api}
      - {name: CRAVES_API_ORIGIN, value: https://api.craves.in}
      - {name: CRAVES_PUBLIC_WEB_ORIGIN, value: https://craves.in}
      probes:
      - {type: Liveness, httpGet: {path: /actuator/health/liveness, port: 8080}, initialDelaySeconds: 20, periodSeconds: 10, failureThreshold: 6}
      - {type: Readiness, httpGet: {path: /actuator/health/readiness, port: 8080}, initialDelaySeconds: 15, periodSeconds: 5, failureThreshold: 6}
      - {type: Startup, httpGet: {path: /actuator/health/liveness, port: 8080}, initialDelaySeconds: 5, periodSeconds: 5, failureThreshold: 30}
    scale:
      minReplicas: 2
      maxReplicas: 10
      rules:
      - {name: http, http: {metadata: {concurrentRequests: "80"}}}
YAML
  if az containerapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
    az containerapp update -g "$RG" -n "$APP" --yaml "$STATE/app.yaml" -o none
  else
    az containerapp create -g "$RG" -n "$APP" --yaml "$STATE/app.yaml" -o none
  fi
  local revision state="" n
  for n in $(seq 1 40); do
    revision=$(az containerapp show -g "$RG" -n "$APP" --query properties.latestRevisionName -o tsv)
    state=$(az containerapp revision show -g "$RG" -n "$APP" --revision "$revision" --query properties.healthState -o tsv 2>/dev/null || true)
    [ "$state" = Healthy ] && break; sleep 15
  done
  echo "Revision $revision: ${state:-unknown}"
  [ "$state" = Healthy ]
}

apim() {
  log "Gateway: one API $API_ID at $API_PATH with wildcard operations"
  local base fqdn owner m
  base="https://management.azure.com/subscriptions/$SUB/resourceGroups/$SHARED_RG/providers/Microsoft.ApiManagement/service/$APIM_NAME"
  fqdn=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
  owner=$(az rest --method get --url "$base/apis?api-version=2022-08-01&\$top=500" --query "value[?properties.path=='$API_PATH'].name | [0]" -o tsv)
  if [ -n "$owner" ] && [ "$owner" != "$API_ID" ]; then echo "Path $API_PATH already belongs to $owner; refusing"; return 1; fi
  az rest --method put --url "$base/apis/$API_ID?api-version=2022-08-01" --headers "Content-Type=application/json" "If-Match=*" -o none --body \
    "{\"properties\":{\"displayName\":\"Craves advanced features v1\",\"path\":\"$API_PATH\",\"protocols\":[\"https\"],\"serviceUrl\":\"https://$fqdn/$API_PATH\",\"subscriptionRequired\":false,\"apiType\":\"http\",\"description\":\"advanced-features-service; contracts in contracts/openapi/advanced\"}}"
  for m in GET POST PUT PATCH DELETE; do
    az rest --method put --url "$base/apis/$API_ID/operations/${m,,}-all?api-version=2022-08-01" --headers "Content-Type=application/json" "If-Match=*" -o none \
      --body "{\"properties\":{\"displayName\":\"$m /*\",\"method\":\"$m\",\"urlTemplate\":\"/*\",\"templateParameters\":[]}}"
  done
  python3 -c 'import json,sys;print(json.dumps({"properties":{"format":"rawxml","value":open(sys.argv[1]).read()}}))' \
    "$ROOT/infra/apim/advanced-features/api-policy.xml" > "$STATE/policy.json"
  az rest --method put --url "$base/apis/$API_ID/policies/policy?api-version=2022-08-01" --headers "Content-Type=application/json" "If-Match=*" -o none --body @"$STATE/policy.json"
  echo "Published https://api.craves.in/$API_PATH/* -> https://$fqdn/$API_PATH/*"
}

apim_remove() {
  local base="https://management.azure.com/subscriptions/$SUB/resourceGroups/$SHARED_RG/providers/Microsoft.ApiManagement/service/$APIM_NAME"
  az rest --method delete --url "$base/apis/$API_ID?api-version=2022-08-01&deleteRevisions=true" --headers "If-Match=*" -o none
  echo "Removed $API_ID (backend and data untouched)"
}

devops() {
  log "Azure DevOps: identity sp-craves-devops-$FEATURE, service connection sc-craves-$FEATURE, pipeline release/release-$FEATURE"
  local tenant app_id sp_id project_id ep_id issuer subject repo_id code_id head pipeline_id env_id
  tenant=$(az account show --query tenantId -o tsv)
  app_id=$(az ad app list --display-name "sp-craves-devops-$FEATURE" --query "[0].appId" -o tsv)
  [ -n "$app_id" ] || app_id=$(az ad app create --display-name "sp-craves-devops-$FEATURE" --query appId -o tsv)
  az ad sp show --id "$app_id" -o none 2>/dev/null || az ad sp create --id "$app_id" -o none
  sp_id=$(az ad sp show --id "$app_id" --query id -o tsv)
  az role assignment create --assignee-object-id "$sp_id" --assignee-principal-type ServicePrincipal --role Contributor \
    --scope "$(az group show -n "$RG" --query id -o tsv)" -o none 2>/dev/null || true
  project_id=$(ado --method get --url "$ORG/_apis/projects/$PROJECT?api-version=7.1" --query id -o tsv)
  ep_id=$(ado --method get --url "$ORG/$PROJECT/_apis/serviceendpoint/endpoints?endpointNames=sc-craves-$FEATURE&api-version=7.1" --query "value[0].id" -o tsv)
  if [ -z "$ep_id" ]; then
    cat > "$STATE/sc.json" <<JSON
{"name":"sc-craves-$FEATURE","type":"azurerm","url":"https://management.azure.com/","isShared":false,"isReady":true,
 "authorization":{"scheme":"WorkloadIdentityFederation","parameters":{"tenantid":"$tenant","serviceprincipalid":"$app_id"}},
 "data":{"environment":"AzureCloud","scopeLevel":"Subscription","subscriptionId":"$SUB","subscriptionName":"$(az account show --query name -o tsv)","creationMode":"Manual"},
 "serviceEndpointProjectReferences":[{"projectReference":{"id":"$project_id","name":"$PROJECT"},"name":"sc-craves-$FEATURE"}]}
JSON
    ep_id=$(ado --method post --url "$ORG/_apis/serviceendpoint/endpoints?api-version=7.1" --headers "Content-Type=application/json" --body @"$STATE/sc.json" --query id -o tsv)
  fi
  issuer=$(ado --method get --url "$ORG/$PROJECT/_apis/serviceendpoint/endpoints/$ep_id?api-version=7.1" --query "authorization.parameters.workloadIdentityFederationIssuer" -o tsv)
  subject=$(ado --method get --url "$ORG/$PROJECT/_apis/serviceendpoint/endpoints/$ep_id?api-version=7.1" --query "authorization.parameters.workloadIdentityFederationSubject" -o tsv)
  az ad app federated-credential create --id "$app_id" -o none --parameters \
    "{\"name\":\"devops-sc-craves-$FEATURE\",\"issuer\":\"$issuer\",\"subject\":\"$subject\",\"audiences\":[\"api://AzureADTokenExchange\"]}" 2>/dev/null || true
  ado --method patch --url "$ORG/$PROJECT/_apis/pipelines/pipelinePermissions/endpoint/$ep_id?api-version=7.1-preview.1" \
    --headers "Content-Type=application/json" --body '{"allPipelines":{"authorized":true}}' -o none
  repo_id=$(ado --method get --url "$ORG/$PROJECT/_apis/git/repositories/craves-pipelines?api-version=7.1" --query id -o tsv)
  if ! ado --method get --url "$ORG/$PROJECT/_apis/git/repositories/$repo_id/items?path=/advanced.yml&api-version=7.1" -o none 2>/dev/null; then
    head=$(ado --method get --url "$ORG/$PROJECT/_apis/git/repositories/$repo_id/refs?filter=heads/main&api-version=7.1" --query "value[0].objectId" -o tsv)
    python3 - "$head" "$ROOT/infra/advanced-features/devops/advanced.yml" > "$STATE/push.json" <<'PY'
import json, sys
print(json.dumps({"refUpdates": [{"name": "refs/heads/main", "oldObjectId": sys.argv[1]}],
                  "commits": [{"comment": "Add release-advanced (advanced-features-service)",
                               "changes": [{"changeType": "add", "item": {"path": "/advanced.yml"},
                                            "newContent": {"content": open(sys.argv[2]).read(), "contentType": "rawtext"}}]}]}))
PY
    ado --method post --url "$ORG/$PROJECT/_apis/git/repositories/$repo_id/pushes?api-version=7.1" --headers "Content-Type=application/json" --body @"$STATE/push.json" -o none
  fi
  pipeline_id=$(ado --method get --url "$ORG/$PROJECT/_apis/pipelines?api-version=7.1" --query "value[?name=='release-$FEATURE'].id | [0]" -o tsv)
  if [ -z "$pipeline_id" ]; then
    pipeline_id=$(ado --method post --url "$ORG/$PROJECT/_apis/pipelines?api-version=7.1" --headers "Content-Type=application/json" --query id -o tsv --body \
      "{\"name\":\"release-$FEATURE\",\"folder\":\"\\\\release\",\"configuration\":{\"type\":\"yaml\",\"path\":\"/advanced.yml\",\"repository\":{\"id\":\"$repo_id\",\"type\":\"azureReposGit\"}}}")
  fi
  code_id=$(ado --method get --url "$ORG/$PROJECT/_apis/git/repositories/craves-code?api-version=7.1" --query id -o tsv)
  ado --method patch --url "$ORG/$PROJECT/_apis/pipelines/pipelinePermissions/repository/$project_id.$code_id?api-version=7.1-preview.1" \
    --headers "Content-Type=application/json" --body "{\"pipelines\":[{\"id\":$pipeline_id,\"authorized\":true}]}" -o none || true
  env_id=$(ado --method get --url "$ORG/$PROJECT/_apis/distributedtask/environments?name=production&api-version=7.1" --query "value[0].id" -o tsv || true)
  if [ -n "$env_id" ]; then
    ado --method patch --url "$ORG/$PROJECT/_apis/pipelines/pipelinePermissions/environment/$env_id?api-version=7.1-preview.1" \
      --headers "Content-Type=application/json" --body "{\"pipelines\":[{\"id\":$pipeline_id,\"authorized\":true}]}" -o none || true
  fi
  echo "release-$FEATURE pipeline id $pipeline_id; service connection $ep_id. Merges under services/advanced-features-service now deploy automatically."
}

alerts() {
  log "Alerts to ag-craves-prod (restarts, 5xx, replicas)"
  local app_id ag
  app_id=$(az containerapp show -g "$RG" -n "$APP" --query id -o tsv)
  ag=$(az monitor action-group show -g "$SHARED_RG" -n ag-craves-prod --query id -o tsv)
  az monitor metrics alert create -g "$RG" -n "alert-$APP-restarts" --scopes "$app_id" --condition "total RestartCount > 5" \
    --window-size 15m --evaluation-frequency 5m --action "$ag" --severity 2 -o none 2>/dev/null || true
  az monitor metrics alert create -g "$RG" -n "alert-$APP-5xx" --scopes "$app_id" --condition "total Requests > 20 where statusCodeCategory includes 5xx" \
    --window-size 5m --evaluation-frequency 1m --action "$ag" --severity 2 -o none 2>/dev/null || true
  az monitor metrics alert create -g "$RG" -n "alert-$APP-replicas" --scopes "$app_id" --condition "max Replicas < 1" \
    --window-size 5m --evaluation-frequency 1m --action "$ag" --severity 1 -o none 2>/dev/null || true
}

lock() {
  az lock list -g "$RG" --query "[?level=='CanNotDelete'] | [0].name" -o tsv | grep -q . || az lock create -g "$RG" -n no-delete --lock-type CanNotDelete -o none
  echo "CanNotDelete lock on $RG"
}

phase=${1:-}
case "$phase" in
  network|identity|vault|database|environment|firewall|apim|devops|alerts|lock) "$phase" ;;
  apim-remove) apim_remove ;;
  image|app) "$phase" "${2:-}" ;;
  all)
    commit=${2:?main commit}
    network; identity; vault; firewall; database; environment; image "$commit"; app "$commit"; apim; alerts; lock
    devops || echo "DevOps setup did not finish: deploys still work with 'provision.sh image <commit> && provision.sh app <commit>'."
    log "Done. NAT egress IP: $(nat_ip). Check: curl -s https://api.craves.in/$API_PATH/features" ;;
  *) echo "usage: provision.sh all <main-commit> | <phase>"; exit 2 ;;
esac
