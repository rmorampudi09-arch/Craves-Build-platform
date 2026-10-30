#!/usr/bin/env bash
# Production infrastructure for advanced-features-service, following the one-resource-group-per-feature design
# (claude/new-subscription-build.md). Idempotent and additive: it never deletes or changes another feature's resources,
# except temporary firewall/network rules for this Cloud Shell that it removes again.
#
# Run in Azure Cloud Shell (directory ravitejamm6gmail, subscription 34eefd95), one phase at a time or "all":
#   bash provision.sh discover|network|identity|vault|database|environment|image|app|firewall|alerts|lock|all [commit]
# "image" and "app" take the 40-character GitHub main commit to deploy (only code that is on main).
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
TEMPLATE_RG=rg-craves-catalog-prod
TEMPLATE_APP=ca-craves-catalog-prod
PG_RG=rg-craves-data-business-prod
PG=pg-craves-business-prod
DB=craves_advanced_db
DB_USER=craves_advanced
REPO=https://github.com/rmorampudi09-arch/Craves-Build-platform.git
APIM_OUTBOUND_IP=4.188.68.132
# Static egress IPs of the other features (claude/new-subscription-build.md, network lockdown).
FEATURE_NAT_IPS="20.198.108.229 20.235.64.75 20.198.125.128 20.219.136.254 20.235.95.84 20.204.118.52 20.204.46.72 20.192.2.161 104.211.91.72 20.198.84.102 20.219.159.80 20.219.193.93"
TAGS="environment=prod product=craves feature=$FEATURE owner=raviteja.m@craves.in"
STATE=~/advanced-features-state
mkdir -p "$STATE"

az account set -s "$SUB"
log() { printf '\n== %s\n' "$*"; }
my_ip() { curl -fsS https://api.ipify.org; }

discover() {
  log "Template app $TEMPLATE_APP: env names and secret references (no values)"
  az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "{image:properties.template.containers[0].image, \
    env:properties.template.containers[0].env[].{name:name,secretRef:secretRef}, secrets:properties.configuration.secrets[].{name:name,kv:keyVaultUrl}, \
    identity:identity.userAssignedIdentities, ingress:properties.configuration.ingress.{external:external,port:targetPort,rules:length(ipSecurityRestrictions)}, \
    scale:properties.template.scale, resources:properties.template.containers[0].resources, env_id:properties.environmentId}" -o json
  log "Template environment"
  local env_id; env_id=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query properties.environmentId -o tsv)
  az containerapp env show --ids "$env_id" --query "{zoneRedundant:properties.zoneRedundant, profiles:properties.workloadProfiles, \
    subnet:properties.vnetConfiguration.infrastructureSubnetId, internal:properties.vnetConfiguration.internal, logs:properties.appLogsConfiguration}" -o json
  log "Virtual networks in use"
  az network vnet list --query "[].{name:name, rg:resourceGroup, space:addressSpace.addressPrefixes}" -o table
  log "Business Postgres"
  az postgres flexible-server show -g "$PG_RG" -n "$PG" --query "{fqdn:fullyQualifiedDomainName, admin:administratorLogin, version:version, auth:authConfig}" -o json
  log "Log Analytics and action group"
  az monitor log-analytics workspace list -g "$SHARED_RG" --query "[].{name:name,id:customerId}" -o table
  az monitor action-group list -g "$SHARED_RG" --query "[].name" -o tsv
}

network() {
  log "Resource group, VNet, NAT gateway"
  az group create -n "$RG" -l "$LOC" --tags $TAGS -o none
  if ! az network vnet show -g "$RG" -n "$VNET" -o none 2>/dev/null; then
    # Pick a 10.x.0.0/16 no other VNet in the subscription uses (feature VNets are not peered, but stay distinct anyway).
    local used x
    used=$(az network vnet list --query "[].addressSpace.addressPrefixes[]" -o tsv)
    for x in $(seq 60 120); do grep -q "^10\.$x\." <<<"$used" || break; done
    az network vnet create -g "$RG" -n "$VNET" -l "$LOC" --address-prefixes "10.$x.0.0/16" --subnet-name "$SUBNET" \
      --subnet-prefixes "10.$x.0.0/23" --tags $TAGS -o none
    az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --delegations Microsoft.App/environments -o none
  fi
  az network public-ip create -g "$RG" -n "$PIP" -l "$LOC" --sku Standard --allocation-method Static --zone 1 2 3 --tags $TAGS -o none
  az network nat gateway create -g "$RG" -n "$NAT" -l "$LOC" --public-ip-addresses "$PIP" --idle-timeout 10 --tags $TAGS -o none
  az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --nat-gateway "$NAT" -o none
  az network public-ip show -g "$RG" -n "$PIP" --query ipAddress -o tsv | tee "$STATE/nat-ip"
}

identity() {
  log "User-assigned identity with AcrPull"
  az identity create -g "$RG" -n "$UAI" -l "$LOC" --tags $TAGS -o none
  local principal acr_id
  principal=$(az identity show -g "$RG" -n "$UAI" --query principalId -o tsv)
  acr_id=$(az acr show -n "$ACR" --query id -o tsv)
  az role assignment create --assignee-object-id "$principal" --assignee-principal-type ServicePrincipal --role AcrPull --scope "$acr_id" -o none 2>/dev/null || true
}

with_kv_access() { # $1 vault, rest: command. Temporarily allows this shell's IP on a firewalled vault, then removes it.
  local vault=$1; shift
  local ip; ip=$(my_ip)
  az keyvault network-rule add -n "$vault" --ip-address "$ip/32" -o none
  sleep 20
  local rc=0; "$@" || rc=$?
  az keyvault network-rule remove -n "$vault" --ip-address "$ip/32" -o none || true
  return $rc
}

template_secret_url() { # Key Vault URL behind one of the template app's secret env vars
  local ref; ref=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[?name=='$1'].secretRef | [0]" -o tsv)
  [ -n "$ref" ] || return 1
  az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.configuration.secrets[?name=='$ref'].keyVaultUrl | [0]" -o tsv
}

read_secret_url() { # prints the value behind a Key Vault secret URL, opening that vault's firewall to this shell briefly
  local url=$1 vault name out; vault=$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$url"); name=$(sed -E 's#.*/secrets/([^/]+).*#\1#' <<<"$url")
  out=$(mktemp); chmod 600 "$out"
  with_kv_access "$vault" bash -c "az keyvault secret show --vault-name '$vault' -n '$name' --query value -o tsv > '$out'"
  cat "$out"; rm -f "$out"
}

vault() {
  log "Key Vault $KV (RBAC, purge protection, default deny)"
  if ! az keyvault show -n "$KV" -o none 2>/dev/null; then
    az keyvault create -g "$RG" -n "$KV" -l "$LOC" --enable-rbac-authorization true --enable-purge-protection true \
      --retention-days 90 --default-action Deny --bypass AzureServices --tags $TAGS -o none
  fi
  local kv_id principal me
  kv_id=$(az keyvault show -n "$KV" --query id -o tsv)
  principal=$(az identity show -g "$RG" -n "$UAI" --query principalId -o tsv)
  me=$(az ad signed-in-user show --query id -o tsv)
  az role assignment create --assignee-object-id "$principal" --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" --scope "$kv_id" -o none 2>/dev/null || true
  az role assignment create --assignee-object-id "$me" --assignee-principal-type User --role "Key Vault Secrets Officer" --scope "$kv_id" -o none 2>/dev/null || true
  if [ -s "$STATE/nat-ip" ]; then az keyvault network-rule add -n "$KV" --ip-address "$(cat "$STATE/nat-ip")/32" -o none; fi

  # The JWT verification key: the same public key every Craves service verifies with, copied from the template app's vault.
  local source_url source_vault source_name
  source_url=$(template_secret_url CRAVES_JWT_VERIFICATION_PEM_BASE64)
  source_vault=$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$source_url"); source_name=$(sed -E 's#.*/secrets/([^/]+).*#\1#' <<<"$source_url")
  echo "JWT key source: $source_vault/$source_name"
  local tmp; tmp=$(mktemp); chmod 600 "$tmp"
  with_kv_access "$source_vault" bash -c "az keyvault secret show --vault-name '$source_vault' -n '$source_name' --query value -o tsv > '$tmp'"
  [ -s "$tmp" ] || { echo "Could not read the JWT verification key"; rm -f "$tmp"; return 1; }
  if [ ! -s "$STATE/db-password" ]; then (umask 077; openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40 > "$STATE/db-password"); fi
  with_kv_access "$KV" bash -c "az keyvault secret set --vault-name '$KV' -n craves-jwt-verification-pem-base64 --file '$tmp' -o none && \
    az keyvault secret set --vault-name '$KV' -n adv-db-password --file '$STATE/db-password' -o none"
  rm -f "$tmp"
  echo "Secrets in $KV: craves-jwt-verification-pem-base64, adv-db-password"
}

database() {
  log "Database $DB and least-privilege role $DB_USER on $PG"
  az postgres flexible-server db create -g "$PG_RG" -s "$PG" -d "$DB" -o none 2>/dev/null || true
  local fqdn admin ip
  fqdn=$(az postgres flexible-server show -g "$PG_RG" -n "$PG" --query fullyQualifiedDomainName -o tsv)
  admin=$(az postgres flexible-server show -g "$PG_RG" -n "$PG" --query administratorLogin -o tsv)
  if [ -z "${PGADMINPASSWORD:-}" ]; then
    # The business services connect as the server admin; reuse the template app's own password reference.
    local user_var pass_var user
    user_var=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[].name" -o tsv \
      | grep -E '(DB_USER|DB_USERNAME|DATASOURCE_USERNAME)$' | head -1)
    pass_var=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[].name" -o tsv \
      | grep -E '(DB_PASSWORD|DATASOURCE_PASSWORD)$' | head -1)
    user=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[?name=='$user_var'].value | [0]" -o tsv)
    echo "Template DB user variable: $user_var=$user (server admin: $admin), password variable: $pass_var"
    [ "$user" = "$admin" ] || { echo "Template app does not use the admin login; export PGADMINPASSWORD and rerun"; return 1; }
    PGADMINPASSWORD=$(read_secret_url "$(template_secret_url "$pass_var")")
  fi
  ip=$(my_ip)
  az postgres flexible-server firewall-rule create -g "$PG_RG" -n "$PG" --rule-name advanced-provision-shell \
    --start-ip-address "$ip" --end-ip-address "$ip" -o none
  local rc=0
  PGPASSWORD="$PGADMINPASSWORD" psql "host=$fqdn port=5432 dbname=postgres user=$admin sslmode=require" -v ON_ERROR_STOP=1 \
    -v role="$DB_USER" -v pw="$(cat "$STATE/db-password")" -v db="$DB" <<'SQL' || rc=$?
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'role', :'pw') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO %I', :'db', :'role') \gexec
SQL
  # Azure keeps a CanNotDelete lock on the RG: lift it only around deleting our own temporary rule.
  local lock_name lock_notes
  lock_name=$(az lock list -g "$PG_RG" --query "[?level=='CanNotDelete'] | [0].name" -o tsv)
  lock_notes=$(az lock list -g "$PG_RG" --query "[?level=='CanNotDelete'] | [0].notes" -o tsv)
  [ -n "$lock_name" ] && az lock delete -g "$PG_RG" -n "$lock_name" -o none
  az postgres flexible-server firewall-rule delete -g "$PG_RG" -n "$PG" --rule-name advanced-provision-shell --yes -o none || rc=1
  [ -n "$lock_name" ] && az lock create -g "$PG_RG" -n "$lock_name" --lock-type CanNotDelete --notes "${lock_notes:-}" -o none
  return $rc
}

environment() {
  log "Container Apps environment $CAE (zone redundant, workload profiles, logs to the shared workspace)"
  if az containerapp env show -g "$RG" -n "$CAE" -o none 2>/dev/null; then echo "exists"; return; fi
  local subnet ws_id ws_key ws_name
  subnet=$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --query id -o tsv)
  ws_name=$(az monitor log-analytics workspace list -g "$SHARED_RG" --query "[0].name" -o tsv)
  ws_id=$(az monitor log-analytics workspace show -g "$SHARED_RG" -n "$ws_name" --query customerId -o tsv)
  ws_key=$(az monitor log-analytics workspace get-shared-keys -g "$SHARED_RG" -n "$ws_name" --query primarySharedKey -o tsv)
  az containerapp env create -g "$RG" -n "$CAE" -l "$LOC" --infrastructure-subnet-resource-id "$subnet" \
    --enable-workload-profiles --zone-redundant --logs-destination log-analytics --logs-workspace-id "$ws_id" \
    --logs-workspace-key "$ws_key" --tags $TAGS -o none
}

image() {
  local commit=${1:?main commit to build}
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Give the full 40-character commit"; return 1; }
  local tag=${commit:0:12}
  log "Building $IMAGE_REPO:$tag from GitHub main $commit"
  if az acr repository show -n "$ACR" --image "$IMAGE_REPO:$tag" -o none 2>/dev/null; then echo "Image exists"; return; fi
  az acr build -r "$ACR" -t "$IMAGE_REPO:$tag" -f Dockerfile "$REPO#$commit:services/advanced-features-service"
}

app() {
  local commit=${1:?main commit to deploy}
  local tag=${commit:0:12}
  log "Container app $APP ($IMAGE_REPO:$tag)"
  local env_id uai_id kv_uri issuer audience restrictions ip i=0
  env_id=$(az containerapp env show -g "$RG" -n "$CAE" --query id -o tsv)
  uai_id=$(az identity show -g "$RG" -n "$UAI" --query id -o tsv)
  kv_uri=$(az keyvault show -n "$KV" --query properties.vaultUri -o tsv)
  issuer=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[?name=='CRAVES_JWT_ISSUER'].value | [0]" -o tsv)
  audience=$(az containerapp show -g "$TEMPLATE_RG" -n "$TEMPLATE_APP" --query "properties.template.containers[0].env[?name=='CRAVES_JWT_AUDIENCE'].value | [0]" -o tsv)
  local fqdn; fqdn=$(az postgres flexible-server show -g "$PG_RG" -n "$PG" --query fullyQualifiedDomainName -o tsv)
  restrictions="      - {name: apim, action: Allow, ipAddressRange: $APIM_OUTBOUND_IP/32}"
  for ip in $FEATURE_NAT_IPS $(cat "$STATE/nat-ip"); do i=$((i+1)); restrictions="$restrictions
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
      - {name: CRAVES_JWT_ISSUER, value: "${issuer:-https://api.craves.in/auth}"}
      - {name: CRAVES_JWT_AUDIENCE, value: "${audience:-craves-api}"}
      - {name: CRAVES_API_ORIGIN, value: https://api.craves.in}
      - {name: CRAVES_PUBLIC_WEB_ORIGIN, value: https://craves.in}
      - {name: SECRETS_SYNC, value: "$(date +%s)"}
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
  az containerapp show -g "$RG" -n "$APP" --query "{fqdn:properties.configuration.ingress.fqdn, revision:properties.latestRevisionName, state:properties.runningStatus}" -o json \
    | tee "$STATE/app.json"
}

firewall() {
  log "Business Postgres admits the new NAT IP"
  local nat; nat=$(cat "$STATE/nat-ip")
  az postgres flexible-server firewall-rule create -g "$PG_RG" -n "$PG" --rule-name "cae-$FEATURE" \
    --start-ip-address "$nat" --end-ip-address "$nat" -o none
}

alerts() {
  log "Alerts to ag-craves-prod (restarts, 5xx, replicas)"
  local app_id ag
  app_id=$(az containerapp show -g "$RG" -n "$APP" --query id -o tsv)
  ag=$(az monitor action-group show -g "$SHARED_RG" -n ag-craves-prod --query id -o tsv)
  az monitor metrics alert create -g "$RG" -n "alert-$APP-restarts" --scopes "$app_id" --condition "total RestartCount > 5" \
    --window-size 15m --evaluation-frequency 5m --action "$ag" --severity 2 -o none 2>/dev/null || true
  az monitor metrics alert create -g "$RG" -n "alert-$APP-5xx" --scopes "$app_id" \
    --condition "total Requests > 20 where statusCodeCategory includes 5xx" --window-size 5m --evaluation-frequency 1m --action "$ag" --severity 2 -o none 2>/dev/null || true
  az monitor metrics alert create -g "$RG" -n "alert-$APP-replicas" --scopes "$app_id" --condition "max Replicas < 1" \
    --window-size 5m --evaluation-frequency 1m --action "$ag" --severity 1 -o none 2>/dev/null || true
}

lock() {
  az lock create -g "$RG" -n no-delete --lock-type CanNotDelete -o none
  echo "CanNotDelete lock on $RG"
}

phase=${1:-discover}
case "$phase" in
  discover|network|identity|vault|database|environment|firewall|alerts|lock) "$phase" ;;
  image|app) "$phase" "${2:-}" ;;
  all) network; identity; vault; database; environment; firewall; image "${2:?commit}"; app "$2"; alerts; lock ;;
  *) echo "unknown phase $phase"; exit 2 ;;
esac
