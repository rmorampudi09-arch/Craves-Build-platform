#!/usr/bin/env bash
# Renews the Let's Encrypt certificate for craves.in and www.craves.in.
# Front Door serves it from Key Vault certificate craves-web-tls (useLatestVersion), so a new
# Key Vault version reaches the site by itself within 72 hours. DNS-01 runs on the Azure DNS zone
# craves.in. See infra/certificates/web-letsencrypt/README.md.
set -Eeuo pipefail
set +x
umask 077

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is missing: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "Required environment variable is missing: $name"
}

is_true() {
  case "${1,,}" in
    true|1|yes) return 0 ;;
    *) return 1 ;;
  esac
}

cleanup() {
  local exit_code=$?
  if [[ -n "${WORK_DIR:-}" && -d "${WORK_DIR:-}" ]]; then
    rm -rf "$WORK_DIR"
  fi
  unset AZUREDNS_BEARERTOKEN PFX_PASSWORD || true
  exit "$exit_code"
}

trap cleanup EXIT
trap 'fail "Customer web certificate automation failed near line $LINENO."' ERR

for command_name in az dig git openssl python3; do
  require_command "$command_name"
done

for env_name in \
  SUBSCRIPTION_ID \
  RESOURCE_GROUP \
  DNS_ZONE_NAME \
  KEY_VAULT_NAME \
  KEY_VAULT_CERTIFICATE_NAME \
  FRONT_DOOR_PROFILE \
  FRONT_DOOR_SECRET_NAME \
  APEX_HOSTNAME \
  WWW_HOSTNAME \
  LETSENCRYPT_CONTACT_EMAIL; do
  require_env "$env_name"
done

ACME_SH_VERSION="${ACME_SH_VERSION:-3.1.4}"
ACME_SERVER="${ACME_SERVER:-letsencrypt}"
RENEW_BEFORE_DAYS="${RENEW_BEFORE_DAYS:-35}"
DNS_PROPAGATION_SECONDS="${DNS_PROPAGATION_SECONDS:-90}"
PUBLIC_RESOLVER="${PUBLIC_RESOLVER:-8.8.8.8}"
FORCE_ISSUE="${FORCE_ISSUE:-false}"
CHECK_ONLY="${CHECK_ONLY:-false}"

[[ "$RENEW_BEFORE_DAYS" =~ ^[0-9]+$ ]] || fail "RENEW_BEFORE_DAYS must be a non-negative integer."
[[ "$DNS_PROPAGATION_SECONDS" =~ ^[0-9]+$ ]] || fail "DNS_PROPAGATION_SECONDS must be a non-negative integer."
[[ "$APEX_HOSTNAME" == "$DNS_ZONE_NAME" ]] || fail "APEX_HOSTNAME must equal the DNS zone ${DNS_ZONE_NAME}."
[[ "$WWW_HOSTNAME" == "www.${APEX_HOSTNAME}" ]] || fail "WWW_HOSTNAME must equal www.${APEX_HOSTNAME}."
[[ "$LETSENCRYPT_CONTACT_EMAIL" == *@* ]] || fail "LETSENCRYPT_CONTACT_EMAIL is invalid."
case "$ACME_SERVER" in
  letsencrypt|letsencrypt_test) ;;
  *) fail "ACME_SERVER must be letsencrypt or letsencrypt_test." ;;
esac
# A staging certificate is not trusted by browsers: it is issued to prove the DNS-01 path and never imported.
IMPORT_TO_KEY_VAULT=true
[[ "$ACME_SERVER" == letsencrypt ]] || IMPORT_TO_KEY_VAULT=false

RENEW_BEFORE_SECONDS=$((RENEW_BEFORE_DAYS * 86400))
WORK_DIR="$(mktemp -d)"
CURRENT_CERT_FILE="$WORK_DIR/current-certificate.pem"
ACME_SOURCE_DIR="$WORK_DIR/acme-source"
ACME_HOME="$WORK_DIR/acme-home"
ACME_CERT_HOME="$WORK_DIR/acme-certs"
OUTPUT_DIR="$WORK_DIR/output"
PFX_FILE="$WORK_DIR/${KEY_VAULT_CERTIFICATE_NAME}.pfx"
mkdir -p "$ACME_HOME" "$ACME_CERT_HOME" "$OUTPUT_DIR"

json_get() {
  # json_get <python expression on d> reads JSON from stdin; prints '' when the path is missing.
  python3 -c "import json,sys
try:
    d=json.load(sys.stdin); v=$1
except Exception:
    v=''
print('' if v is None else (str(v).lower() if isinstance(v,bool) else v))"
}

sorted_names() {
  tr ' ' '\n' | sed 's/\.$//' | tr '[:upper:]' '[:lower:]' | grep -v '^$' | sort -u
}

log "Selecting Azure subscription."
az account set --subscription "$SUBSCRIPTION_ID"
[[ "$(az account show --query id --output tsv --only-show-errors)" == "$SUBSCRIPTION_ID" ]] || \
  fail "The authenticated Azure context is using the wrong subscription."
TENANT_ID="$(az account show --query tenantId --output tsv --only-show-errors)"
[[ -n "$TENANT_ID" ]] || fail "Azure tenant ID could not be resolved."

log "Checking that Azure DNS zone ${DNS_ZONE_NAME} is the public, authoritative zone."
ZONE_JSON="$(az network dns zone list --query "[?name=='${DNS_ZONE_NAME}'] | [0]" --output json --only-show-errors)"
DNS_ZONE_ID="$(json_get "d['id']" <<<"$ZONE_JSON")"
[[ -n "$DNS_ZONE_ID" ]] || fail "Azure DNS zone ${DNS_ZONE_NAME} was not found in subscription ${SUBSCRIPTION_ID}."
AZURE_NAME_SERVERS="$(json_get "' '.join(d['nameServers'])" <<<"$ZONE_JSON" | sorted_names)"
PUBLIC_NAME_SERVERS="$(dig +short NS "$DNS_ZONE_NAME" @"$PUBLIC_RESOLVER" 2>/dev/null | sorted_names || true)"
[[ -n "$PUBLIC_NAME_SERVERS" ]] || fail "Public NS lookup for ${DNS_ZONE_NAME} returned nothing."
[[ "$PUBLIC_NAME_SERVERS" == "$AZURE_NAME_SERVERS" ]] || \
  fail "Public nameservers for ${DNS_ZONE_NAME} are not the Azure DNS zone's nameservers; DNS-01 would not be seen."
CAA_RECORDS="$(dig +short CAA "$DNS_ZONE_NAME" @"$PUBLIC_RESOLVER" 2>/dev/null || true)"
if [[ -n "$CAA_RECORDS" ]] && ! grep -qi 'letsencrypt.org' <<<"$CAA_RECORDS"; then
  fail "CAA records on ${DNS_ZONE_NAME} do not allow letsencrypt.org."
fi

log "Checking Key Vault ${KEY_VAULT_NAME} and the Front Door secret that serves the certificate."
KEY_VAULT_JSON="$(az keyvault show --resource-group "$RESOURCE_GROUP" --name "$KEY_VAULT_NAME" --output json --only-show-errors)"
KEY_VAULT_ID="$(json_get "d['id']" <<<"$KEY_VAULT_JSON")"
KEY_VAULT_RBAC="$(json_get "d['properties']['enableRbacAuthorization']" <<<"$KEY_VAULT_JSON")"
[[ -n "$KEY_VAULT_ID" ]] || fail "Key Vault ${KEY_VAULT_NAME} was not found."

FRONT_DOOR_SECRET_JSON="$(az rest --method get --only-show-errors \
  --uri "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Cdn/profiles/${FRONT_DOOR_PROFILE}/secrets/${FRONT_DOOR_SECRET_NAME}?api-version=2025-04-15")"
FRONT_DOOR_SECRET_TYPE="$(json_get "d['properties']['parameters']['type']" <<<"$FRONT_DOOR_SECRET_JSON")"
FRONT_DOOR_SECRET_SOURCE="$(json_get "d['properties']['parameters']['secretSource']['id']" <<<"$FRONT_DOOR_SECRET_JSON")"
FRONT_DOOR_LATEST="$(json_get "d['properties']['parameters']['useLatestVersion']" <<<"$FRONT_DOOR_SECRET_JSON")"
FRONT_DOOR_SERVED_EXPIRY="$(json_get "d['properties']['parameters'].get('expirationDate','')" <<<"$FRONT_DOOR_SECRET_JSON")"
[[ "$FRONT_DOOR_SECRET_TYPE" == CustomerCertificate ]] || \
  fail "Front Door secret ${FRONT_DOOR_SECRET_NAME} is not a CustomerCertificate (type '${FRONT_DOOR_SECRET_TYPE}')."
case "${FRONT_DOOR_SECRET_SOURCE,,}" in
  "${KEY_VAULT_ID,,}/secrets/${KEY_VAULT_CERTIFICATE_NAME,,}"|"${KEY_VAULT_ID,,}/certificates/${KEY_VAULT_CERTIFICATE_NAME,,}") ;;
  *) fail "Front Door secret ${FRONT_DOOR_SECRET_NAME} does not point at ${KEY_VAULT_NAME}/${KEY_VAULT_CERTIFICATE_NAME} without a version." ;;
esac
[[ "$FRONT_DOOR_LATEST" == true ]] || \
  fail "Front Door secret ${FRONT_DOOR_SECRET_NAME} has useLatestVersion off; a renewed certificate would never reach the site."

log "Checking that this pipeline's identity may write the DNS challenge and import the certificate."
CALLER_OBJECT_ID="$(az account get-access-token --resource https://management.azure.com/ --query accessToken --output tsv --only-show-errors | \
  python3 -c 'import base64,json,sys; p=sys.stdin.read().strip().split(".")[1]; p+="="*(-len(p)%4); print(json.loads(base64.urlsafe_b64decode(p)).get("oid",""))')"
MISSING_PERMISSIONS=()
roles_at() {
  az role assignment list --scope "$1" --include-inherited \
    --query "[?principalId=='${CALLER_OBJECT_ID}'].roleDefinitionName" --output tsv --only-show-errors
}
if [[ -z "$CALLER_OBJECT_ID" ]]; then
  log "WARNING: could not read this identity's object ID; permission check skipped."
elif DNS_ROLES="$(roles_at "$DNS_ZONE_ID" 2>/dev/null)"; then
  grep -Eqx 'Owner|Contributor|DNS Zone Contributor' <<<"$DNS_ROLES" || \
    MISSING_PERMISSIONS+=("az role assignment create --assignee-object-id ${CALLER_OBJECT_ID} --assignee-principal-type ServicePrincipal --role 'DNS Zone Contributor' --scope ${DNS_ZONE_ID}")
  if [[ "$KEY_VAULT_RBAC" == true ]]; then
    KV_ROLES="$(roles_at "$KEY_VAULT_ID" 2>/dev/null || true)"
    grep -Eqx 'Key Vault Administrator|Key Vault Certificates Officer' <<<"$KV_ROLES" || \
      MISSING_PERMISSIONS+=("az role assignment create --assignee-object-id ${CALLER_OBJECT_ID} --assignee-principal-type ServicePrincipal --role 'Key Vault Certificates Officer' --scope ${KEY_VAULT_ID}")
  else
    KV_POLICY="$(json_get "' '.join(' '.join(p['permissions'].get('certificates') or []) for p in d['properties']['accessPolicies'] if p['objectId']=='${CALLER_OBJECT_ID}')" <<<"$KEY_VAULT_JSON")"
    grep -qiw 'import' <<<"$KV_POLICY" || \
      MISSING_PERMISSIONS+=("az keyvault set-policy --name ${KEY_VAULT_NAME} --object-id ${CALLER_OBJECT_ID} --certificate-permissions get list import")
  fi
else
  log "WARNING: role assignments could not be listed; permission check skipped."
fi
if [[ "${#MISSING_PERMISSIONS[@]}" -gt 0 ]]; then
  printf 'MISSING_PERMISSION=%s\n' "${MISSING_PERMISSIONS[@]}"
  fail "This pipeline's identity (object ID ${CALLER_OBJECT_ID}) lacks the permissions above. A subscription Owner runs the printed command(s) once in Azure Cloud Shell."
fi

CERTIFICATE_EXISTS=false
CURRENT_NOT_AFTER=''
if az keyvault certificate show --vault-name "$KEY_VAULT_NAME" --name "$KEY_VAULT_CERTIFICATE_NAME" \
    --only-show-errors --output none 2>/dev/null; then
  CERTIFICATE_EXISTS=true
  az keyvault certificate download --vault-name "$KEY_VAULT_NAME" --name "$KEY_VAULT_CERTIFICATE_NAME" \
    --file "$CURRENT_CERT_FILE" --encoding PEM --only-show-errors --output none

  CURRENT_SAN="$(openssl x509 -in "$CURRENT_CERT_FILE" -noout -ext subjectAltName)"
  grep -Fq "DNS:${APEX_HOSTNAME}" <<<"$CURRENT_SAN" || fail "Existing Key Vault certificate is missing DNS:${APEX_HOSTNAME}."
  grep -Fq "DNS:${WWW_HOSTNAME}" <<<"$CURRENT_SAN" || fail "Existing Key Vault certificate is missing DNS:${WWW_HOSTNAME}."
  CURRENT_NOT_AFTER="$(openssl x509 -in "$CURRENT_CERT_FILE" -noout -enddate | cut -d= -f2-)"
  log "Key Vault certificate expires: ${CURRENT_NOT_AFTER}. Front Door reports: ${FRONT_DOOR_SERVED_EXPIRY:-unknown}."
fi

if is_true "$CHECK_ONLY"; then
  log "Check only: DNS, Key Vault, Front Door and permissions are ready. Nothing was changed."
  printf 'CERTIFICATE_CHANGED=false\nCHECK_ONLY=true\nCERTIFICATE_NOT_AFTER=%s\nFRONT_DOOR_EXPIRY=%s\n' \
    "$CURRENT_NOT_AFTER" "$FRONT_DOOR_SERVED_EXPIRY"
  exit 0
fi

if [[ "$CERTIFICATE_EXISTS" == true ]] && ! is_true "$FORCE_ISSUE" && [[ "$IMPORT_TO_KEY_VAULT" == true ]] && \
   openssl x509 -in "$CURRENT_CERT_FILE" -checkend "$RENEW_BEFORE_SECONDS" -noout >/dev/null 2>&1; then
  log "Certificate remains valid for more than ${RENEW_BEFORE_DAYS} days. No issuance is required."
  printf 'CERTIFICATE_CHANGED=false\nCERTIFICATE_NAME=%s\nCERTIFICATE_NOT_AFTER=%s\n' \
    "$KEY_VAULT_CERTIFICATE_NAME" "$CURRENT_NOT_AFTER"
  exit 0
fi

if [[ "$IMPORT_TO_KEY_VAULT" != true ]]; then
  log "Let's Encrypt staging test: the full DNS-01 flow runs, the untrusted certificate is not imported."
elif is_true "$FORCE_ISSUE"; then
  log "Forced issuance was requested."
elif [[ "$CERTIFICATE_EXISTS" == true ]]; then
  log "Certificate is within the ${RENEW_BEFORE_DAYS}-day renewal window."
else
  log "No existing Key Vault certificate was found. Performing initial issuance."
fi

log "Downloading pinned acme.sh release ${ACME_SH_VERSION}."
git clone --quiet --depth 1 --branch "$ACME_SH_VERSION" https://github.com/acmesh-official/acme.sh.git "$ACME_SOURCE_DIR"
ACME_SH="$ACME_SOURCE_DIR/acme.sh"
[[ -x "$ACME_SH" ]] || fail "Pinned acme.sh executable was not found."
ACME_REPORTED_VERSION="$($ACME_SH --version 2>&1 | tail -n 1 | awk '{print $NF}')"
ACME_REPORTED_VERSION="${ACME_REPORTED_VERSION#v}"
[[ "$ACME_REPORTED_VERSION" == "$ACME_SH_VERSION" ]] || \
  fail "Downloaded acme.sh version ${ACME_REPORTED_VERSION} does not match ${ACME_SH_VERSION}."

log "Obtaining a short-lived Azure Resource Manager token for the DNS-01 TXT records in ${DNS_ZONE_NAME}."
export AZUREDNS_SUBSCRIPTIONID="$SUBSCRIPTION_ID"
export AZUREDNS_TENANTID="$TENANT_ID"
export AZUREDNS_MANAGEDIDENTITY="false"
AZUREDNS_BEARERTOKEN="$(az account get-access-token --resource https://management.azure.com/ \
  --query accessToken --output tsv --only-show-errors)"
export AZUREDNS_BEARERTOKEN
[[ -n "$AZUREDNS_BEARERTOKEN" ]] || fail "Azure DNS bearer token could not be obtained."

acme() {
  "$ACME_SH" --home "$ACME_HOME" --config-home "$ACME_HOME" --cert-home "$ACME_CERT_HOME" --server "$ACME_SERVER" "$@"
}

log "Registering an ephemeral ACME account on ${ACME_SERVER}."
acme --register-account --accountemail "$LETSENCRYPT_CONTACT_EMAIL"

log "Requesting the SAN certificate through Azure DNS DNS-01 validation."
acme --issue --dns dns_azure --domain "$APEX_HOSTNAME" --domain "$WWW_HOSTNAME" \
  --keylength 2048 --dnssleep "$DNS_PROPAGATION_SECONDS"

acme --install-cert --domain "$APEX_HOSTNAME" \
  --key-file "$OUTPUT_DIR/private-key.pem" \
  --cert-file "$OUTPUT_DIR/certificate.pem" \
  --ca-file "$OUTPUT_DIR/issuer-chain.pem" \
  --fullchain-file "$OUTPUT_DIR/full-chain.pem"

for certificate_file in private-key.pem certificate.pem issuer-chain.pem full-chain.pem; do
  [[ -s "$OUTPUT_DIR/$certificate_file" ]] || fail "Expected certificate file was not created: $certificate_file"
done
openssl rsa -in "$OUTPUT_DIR/private-key.pem" -check -noout >/dev/null 2>&1
openssl verify -partial_chain -CAfile "$OUTPUT_DIR/issuer-chain.pem" "$OUTPUT_DIR/certificate.pem" >/dev/null

CERTIFICATE_SAN="$(openssl x509 -in "$OUTPUT_DIR/certificate.pem" -noout -ext subjectAltName)"
grep -Fq "DNS:${APEX_HOSTNAME}" <<<"$CERTIFICATE_SAN" || fail "Issued certificate does not contain DNS:${APEX_HOSTNAME}."
grep -Fq "DNS:${WWW_HOSTNAME}" <<<"$CERTIFICATE_SAN" || fail "Issued certificate does not contain DNS:${WWW_HOSTNAME}."
ISSUED_NOT_AFTER="$(openssl x509 -in "$OUTPUT_DIR/certificate.pem" -noout -enddate | cut -d= -f2-)"
ISSUED_FINGERPRINT="$(openssl x509 -in "$OUTPUT_DIR/certificate.pem" -noout -sha256 -fingerprint | cut -d= -f2 | tr -d ':')"

if [[ "$IMPORT_TO_KEY_VAULT" != true ]]; then
  log "Staging certificate issued and checked; DNS-01 on ${DNS_ZONE_NAME} works. Key Vault was not changed."
  printf 'CERTIFICATE_CHANGED=false\nSTAGING_TEST=passed\nSTAGING_NOT_AFTER=%s\n' "$ISSUED_NOT_AFTER"
  exit 0
fi

log "Building an encrypted PKCS#12 package for Key Vault import."
PFX_PASSWORD="$(openssl rand -base64 48 | tr -d '\n')"
export PFX_PASSWORD
openssl pkcs12 -export -out "$PFX_FILE" -inkey "$OUTPUT_DIR/private-key.pem" -in "$OUTPUT_DIR/certificate.pem" \
  -certfile "$OUTPUT_DIR/issuer-chain.pem" -name "$APEX_HOSTNAME" -passout env:PFX_PASSWORD
[[ -s "$PFX_FILE" ]] || fail "PKCS#12 package was not created."

log "Importing the certificate as a new version of ${KEY_VAULT_CERTIFICATE_NAME}."
az keyvault certificate import --vault-name "$KEY_VAULT_NAME" --name "$KEY_VAULT_CERTIFICATE_NAME" \
  --file "$PFX_FILE" --password "$PFX_PASSWORD" \
  --tags Domains="${APEX_HOSTNAME},${WWW_HOSTNAME}" Issuer=LetsEncrypt ManagedBy=AzureDevOps Purpose=CustomerWeb-TLS \
  --only-show-errors --output none
unset PFX_PASSWORD
rm -f "$PFX_FILE"

IMPORTED_CERT_FILE="$WORK_DIR/imported-certificate.pem"
az keyvault certificate download --vault-name "$KEY_VAULT_NAME" --name "$KEY_VAULT_CERTIFICATE_NAME" \
  --file "$IMPORTED_CERT_FILE" --encoding PEM --only-show-errors --output none
IMPORTED_FINGERPRINT="$(openssl x509 -in "$IMPORTED_CERT_FILE" -noout -sha256 -fingerprint | cut -d= -f2 | tr -d ':')"
[[ "$IMPORTED_FINGERPRINT" == "$ISSUED_FINGERPRINT" ]] || \
  fail "Key Vault certificate fingerprint does not match the issued certificate."
CERTIFICATE_ID="$(az keyvault certificate show --vault-name "$KEY_VAULT_NAME" --name "$KEY_VAULT_CERTIFICATE_NAME" \
  --query id --output tsv --only-show-errors)"

log "Renewed. Front Door follows the latest Key Vault version and serves it within 72 hours; the health check pipeline confirms it."
printf 'CERTIFICATE_CHANGED=true\n'
printf 'CERTIFICATE_NAME=%s\n' "$KEY_VAULT_CERTIFICATE_NAME"
printf 'CERTIFICATE_ID=%s\n' "$CERTIFICATE_ID"
printf 'CERTIFICATE_NOT_AFTER=%s\n' "$ISSUED_NOT_AFTER"
printf 'CERTIFICATE_SHA256=%s\n' "$ISSUED_FINGERPRINT"
