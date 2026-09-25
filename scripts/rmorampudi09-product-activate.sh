#!/usr/bin/env bash
set -euo pipefail
set +x

RG="rg-craves-prodlow-centralindia"
ACR="cravesrm09prodlow6bf632"
PG_SERVER="pg-craves-prodlow-kmqgfy"
PG_ADMIN="cravesadmin"
TAG="${TAG:-activate-${BUILD_BUILDID:-manual-$(date +%Y%m%d%H%M%S)}}"
SRC="${PIPELINE_WORKSPACE:-$PWD}/craves-source"
FRONT_DOOR_URL="https://craves-prodlow-kmqgfy-fyfpa3ddefevcvdf.z02.azurefd.net"
RESUME_FROM="${RESUME_FROM:-full}"

require_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "$name secret variable is required." >&2
    exit 1
  fi
}

if [[ "$RESUME_FROM" != "apim-web" ]]; then
  require_secret POSTGRES_ADMIN_PASSWORD
fi

containerapp_retry() {
  local label="$1"
  shift
  local attempt
  local delay=20
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if "$@"; then
      return 0
    fi
    local rc=$?
    if [[ "$attempt" == "12" ]]; then
      echo "${label} failed after ${attempt} attempts." >&2
      return "$rc"
    fi
    echo "${label} is waiting for Azure to finish the previous Container App operation; retry ${attempt}/12 in ${delay}s."
    sleep "$delay"
    delay=$((delay + 20))
  done
}

echo "Starting Craves activation run ${BUILD_BUILDID:-manual}."
echo "Checking Azure CLI extension readiness without allowing extension install to stall the deployment."
timeout 120 az extension add --name containerapp --upgrade --yes --only-show-errors >/dev/null || true
timeout 60 az extension add --name apim --upgrade --yes --only-show-errors >/dev/null || true

rm -rf "$SRC"
echo "Cloning Craves product source from GitHub."
if [[ -n "${GITHUB_PAT:-}" ]]; then
  GITHUB_AUTH_HEADER=$(printf 'x-access-token:%s' "$GITHUB_PAT" | base64 -w0)
  git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${GITHUB_AUTH_HEADER}" clone --depth 1 "https://github.com/rmorampudi09-arch/Craves-Build-platform.git" "$SRC"
else
  git clone --depth 1 "https://github.com/rmorampudi09-arch/Craves-Build-platform.git" "$SRC"
fi

ACR_LOGIN_SERVER=$(az acr show -n "$ACR" --query loginServer -o tsv)
ACR_ID=$(az acr show -n "$ACR" --query id -o tsv)
PG_FQDN="${PG_SERVER}.postgres.database.azure.com"

if [[ "$RESUME_FROM" != "apim-web" ]]; then
  echo "Resetting PostgreSQL admin password to the pipeline secret so runtime apps use the current credential."
  az postgres flexible-server update \
    --resource-group "$RG" \
    --name "$PG_SERVER" \
    --admin-password "$POSTGRES_ADMIN_PASSWORD" \
    --only-show-errors \
    --output none

  for db in craves_auth_db craves_business_db craves_integration_db; do
    az postgres flexible-server db create \
      --resource-group "$RG" \
      --server-name "$PG_SERVER" \
      --database-name "$db" \
      --only-show-errors \
      --output none || true
  done
fi

WEB_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-web-')].name | [0]" -o tsv)
AUTH_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-auth-service')].name | [0]" -o tsv)
USER_CHEF_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-user-chef-service')].name | [0]" -o tsv)
CATALOG_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-catalog-service')].name | [0]" -o tsv)
ORDER_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-order-service')].name | [0]" -o tsv)
SUBSCRIPTION_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-subscription-service')].name | [0]" -o tsv)
INTEGRATION_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-integration-service')].name | [0]" -o tsv)
NOTIFICATION_APP=$(az containerapp list -g "$RG" --query "[?starts_with(name, 'ca-craves-notification-service')].name | [0]" -o tsv)

for item in WEB_APP AUTH_APP USER_CHEF_APP CATALOG_APP ORDER_APP SUBSCRIPTION_APP INTEGRATION_APP NOTIFICATION_APP; do
  if [[ -z "${!item}" ]]; then
    echo "Could not resolve required Container App $item." >&2
    az containerapp list -g "$RG" --query "[].name" -o table
    exit 1
  fi
done

ensure_acr_pull() {
  local app="$1"
  local principal
  if [[ "${SKIP_ACR_PULL_BINDING:-false}" == "true" ]]; then
    echo "Skipping ACR pull binding refresh for ${app}; existing Container App registry configuration is being reused."
    return 0
  fi
  principal=$(az containerapp show -g "$RG" -n "$app" --query identity.principalId -o tsv)
  az role assignment create \
    --assignee "$principal" \
    --role AcrPull \
    --scope "$ACR_ID" \
    --only-show-errors \
    --output none || true
  containerapp_retry "registry set ${app}" az containerapp registry set \
    -g "$RG" \
    -n "$app" \
    --server "$ACR_LOGIN_SERVER" \
    --identity system \
    --only-show-errors \
    --output none
}

configure_common_secrets() {
  local app="$1"
  containerapp_retry "common secrets ${app}" az containerapp secret set \
    -g "$RG" \
    -n "$app" \
    --secrets "pg-pass=${POSTGRES_ADMIN_PASSWORD}" "svc-secret=${INTERNAL_SERVICE_SECRET}" \
    --only-show-errors \
    --output none
}

set_health_probe() {
  local app="$1"
  containerapp_retry "health probe ${app}" az containerapp update \
    -g "$RG" \
    -n "$app" \
    --min-replicas 1 \
    --set-env-vars "MANAGEMENT_HEALTH_REDIS_ENABLED=false" "CRAVES_REDIS_HEALTH_ENABLED=false" \
    --only-show-errors \
    --output none
}

APIM_NAME=$(az apim list -g "$RG" --query "[?starts_with(name, 'apim-craves-prodlow-')].name | [0]" -o tsv)
if [[ -z "$APIM_NAME" ]]; then
  echo "Could not resolve API Management service." >&2
  exit 1
fi
APIM_GATEWAY_HOST="${APIM_NAME}.azure-api.net"

if [[ "$RESUME_FROM" != "apim-web" ]]; then
JWT_DIR="${PIPELINE_WORKSPACE:-$PWD}/jwt"
mkdir -p "$JWT_DIR"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$JWT_DIR/private.pem" >/dev/null 2>&1
openssl rsa -in "$JWT_DIR/private.pem" -pubout -out "$JWT_DIR/public.pem" >/dev/null 2>&1
JWT_PRIVATE_B64=$(base64 -w0 "$JWT_DIR/private.pem")
JWT_PUBLIC_B64=$(base64 -w0 "$JWT_DIR/public.pem")
INTERNAL_SERVICE_SECRET=$(openssl rand -base64 36 | tr -d '\n')

FIREBASE_DIR="${PIPELINE_WORKSPACE:-$PWD}/firebase"
mkdir -p "$FIREBASE_DIR"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$FIREBASE_DIR/private.pem" >/dev/null 2>&1
FIREBASE_PRIVATE_ESCAPED=$(awk '{printf "%s\\n", $0}' "$FIREBASE_DIR/private.pem")
cat > "$FIREBASE_DIR/service-account.json" <<JSON
{
  "type": "service_account",
  "project_id": "craves-placeholder",
  "private_key_id": "placeholder",
  "private_key": "${FIREBASE_PRIVATE_ESCAPED}",
  "client_email": "placeholder@craves-placeholder.iam.gserviceaccount.com",
  "client_id": "000000000000000000000",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/placeholder%40craves-placeholder.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
JSON
FIREBASE_JSON_B64=$(base64 -w0 "$FIREBASE_DIR/service-account.json")

echo "Building backend service images in ACR."
az acr build -r "$ACR" -t "craves/auth-service:$TAG" "$SRC/services/auth-service" --only-show-errors
az acr build -r "$ACR" -t "craves/user-chef-service:$TAG" "$SRC/services/user-chef-service" --only-show-errors
az acr build -r "$ACR" -t "craves/catalog-service:$TAG" "$SRC/services/catalog-service" --only-show-errors
az acr build -r "$ACR" -t "craves/order-service:$TAG" "$SRC/services/order-service" --only-show-errors
az acr build -r "$ACR" -t "craves/subscription-service:$TAG" "$SRC/services/subscription-service" --only-show-errors
az acr build -r "$ACR" -t "craves/integration-service:$TAG" "$SRC/services/integration-service" --only-show-errors
az acr build -r "$ACR" -t "craves/notification-service:$TAG" "$SRC/services/notification-service" --only-show-errors

echo "Updating backend Container Apps."
update_backend() {
  local app="$1"
  local image="$2"
  local db="$3"
  local service_path="$4"
  ensure_acr_pull "$app"
  configure_common_secrets "$app"
  containerapp_retry "jwt public ${app}" az containerapp secret set \
    -g "$RG" \
    -n "$app" \
    --secrets "jwt-public=${JWT_PUBLIC_B64}" \
    --only-show-errors \
    --output none
  containerapp_retry "ingress ${app}" az containerapp ingress update \
    -g "$RG" \
    -n "$app" \
    --type external \
    --target-port 8080 \
    --transport auto \
    --allow-insecure false \
    --only-show-errors \
    --output none
  containerapp_retry "update ${app}" az containerapp update \
    -g "$RG" \
    -n "$app" \
    --image "$ACR_LOGIN_SERVER/$image" \
    --min-replicas 1 \
    --set-env-vars \
      "SERVER_PORT=8080" \
      "SPRING_PROFILES_ACTIVE=prod" \
      "SPRING_DATASOURCE_URL=jdbc:postgresql://${PG_FQDN}:5432/${db}?sslmode=require" \
      "SPRING_DATASOURCE_USERNAME=${PG_ADMIN}" \
      "SPRING_DATASOURCE_PASSWORD=secretref:pg-pass" \
      "CRAVES_JWT_ISSUER=https://api.craves.in/auth" \
      "CRAVES_JWT_AUDIENCE=craves-api" \
      "CRAVES_JWT_VERIFICATION_PEM_BASE64=secretref:jwt-public" \
      "CRAVES_INTERNAL_SERVICE_SECRET=secretref:svc-secret" \
      "CRAVES_INTERNAL_SERVICE_KEY=secretref:svc-secret" \
      "CRAVES_REDIS_HEALTH_ENABLED=false" \
      "MANAGEMENT_HEALTH_REDIS_ENABLED=false" \
      "CRAVES_CATALOG_BASE_URL=https://${APIM_GATEWAY_HOST}/api/v1/catalog" \
      "CRAVES_AUTH_INTERNAL_BASE_URL=https://${APIM_GATEWAY_HOST}/api/v1/auth" \
      "CRAVES_NOTIFICATION_INTERNAL_BASE_URL=https://${APIM_GATEWAY_HOST}/api/v1/notifications" \
      "CRAVES_SUBSCRIPTION_INTERNAL_BASE_URL=https://${APIM_GATEWAY_HOST}/api/v1/subscriptions" \
      "CRAVES_INTEGRATION_SERVICE_BASE_URL=https://${APIM_GATEWAY_HOST}/api/v1" \
    --only-show-errors \
    --output none
  set_health_probe "$app"
}

ensure_acr_pull "$AUTH_APP"
containerapp_retry "auth secrets ${AUTH_APP}" az containerapp secret set \
  -g "$RG" \
  -n "$AUTH_APP" \
  --secrets "pg-pass=${POSTGRES_ADMIN_PASSWORD}" "svc-secret=${INTERNAL_SERVICE_SECRET}" "jwt-private=${JWT_PRIVATE_B64}" "jwt-public=${JWT_PUBLIC_B64}" "firebase-json=${FIREBASE_JSON_B64}" \
  --only-show-errors \
  --output none
containerapp_retry "auth ingress ${AUTH_APP}" az containerapp ingress update -g "$RG" -n "$AUTH_APP" --type external --target-port 8080 --transport auto --allow-insecure false --only-show-errors --output none
containerapp_retry "auth update ${AUTH_APP}" az containerapp update \
  -g "$RG" \
  -n "$AUTH_APP" \
  --image "$ACR_LOGIN_SERVER/craves/auth-service:$TAG" \
  --min-replicas 1 \
  --set-env-vars \
    "SERVER_PORT=8080" \
    "SPRING_PROFILES_ACTIVE=prod" \
    "SPRING_DATASOURCE_URL=jdbc:postgresql://${PG_FQDN}:5432/craves_auth_db?sslmode=require" \
    "SPRING_DATASOURCE_USERNAME=${PG_ADMIN}" \
    "SPRING_DATASOURCE_PASSWORD=secretref:pg-pass" \
    "CRAVES_JWT_ISSUER=https://api.craves.in/auth" \
    "CRAVES_JWT_AUDIENCE=craves-api" \
    "CRAVES_JWT_PRIVATE_KEY_PEM_BASE64=secretref:jwt-private" \
    "CRAVES_JWT_PUBLIC_KEY_PEM_BASE64=secretref:jwt-public" \
    "CRAVES_INTERNAL_SERVICE_SECRET=secretref:svc-secret" \
    "FIREBASE_PROJECT_ID=craves-placeholder" \
    "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=secretref:firebase-json" \
    "FIREBASE_CHECK_REVOKED=false" \
    "CRAVES_REDIS_HEALTH_ENABLED=false" \
    "MANAGEMENT_HEALTH_REDIS_ENABLED=false" \
  --only-show-errors \
  --output none
set_health_probe "$AUTH_APP"

update_backend "$USER_CHEF_APP" "craves/user-chef-service:$TAG" "craves_business_db" "user-chef"
update_backend "$CATALOG_APP" "craves/catalog-service:$TAG" "craves_business_db" "catalog"
update_backend "$ORDER_APP" "craves/order-service:$TAG" "craves_business_db" "order"
update_backend "$SUBSCRIPTION_APP" "craves/subscription-service:$TAG" "craves_business_db" "subscriptions"
update_backend "$INTEGRATION_APP" "craves/integration-service:$TAG" "craves_integration_db" "integration"
update_backend "$NOTIFICATION_APP" "craves/notification-service:$TAG" "craves_business_db" "notifications"
else
  echo "Resuming from APIM and web deployment; backend build and update steps are skipped."
fi

app_fqdn() {
  az containerapp show -g "$RG" -n "$1" --query properties.configuration.ingress.fqdn -o tsv
}

AUTH_FQDN=$(app_fqdn "$AUTH_APP")
USER_CHEF_FQDN=$(app_fqdn "$USER_CHEF_APP")
CATALOG_FQDN=$(app_fqdn "$CATALOG_APP")
ORDER_FQDN=$(app_fqdn "$ORDER_APP")
SUBSCRIPTION_FQDN=$(app_fqdn "$SUBSCRIPTION_APP")
INTEGRATION_FQDN=$(app_fqdn "$INTEGRATION_APP")
NOTIFICATION_FQDN=$(app_fqdn "$NOTIFICATION_APP")

echo "Configuring API Management routes."
configure_api() {
  local api_id="$1"
  local display="$2"
  local path="$3"
  local service_url="$4"
  local existing_api_id
  local effective_api_id

  existing_api_id=$(az apim api list \
    -g "$RG" \
    --service-name "$APIM_NAME" \
    --query "[?path=='${path}'].name | [0]" \
    -o tsv)
  effective_api_id="${existing_api_id:-$api_id}"

  if [[ -z "$existing_api_id" ]]; then
    az apim api create \
      -g "$RG" \
      --service-name "$APIM_NAME" \
      --api-id "$effective_api_id" \
      --display-name "$display" \
      --path "$path" \
      --api-type http \
      --protocols https \
      --service-url "$service_url" \
      --subscription-required false \
      --only-show-errors \
      --output none || true
  fi

  az apim api update \
    -g "$RG" \
    --service-name "$APIM_NAME" \
    --api-id "$effective_api_id" \
    --set "displayName=$display" "serviceUrl=$service_url" "path=$path" "subscriptionRequired=false" \
    --only-show-errors \
    --output none

  for method in GET POST PUT PATCH DELETE OPTIONS HEAD; do
    local op_id="${effective_api_id}-${method,,}-wildcard"
    az apim api operation create \
      -g "$RG" \
      --service-name "$APIM_NAME" \
      --api-id "$effective_api_id" \
      --operation-id "$op_id" \
      --display-name "${display} ${method}" \
      --method "$method" \
      --url-template "/*" \
      --only-show-errors \
      --output none || true
  done
}

configure_api "craves-auth" "Craves Auth" "api/v1/auth" "https://${AUTH_FQDN}/api/v1/auth"
configure_api "craves-catalog" "Craves Catalog" "api/v1/catalog" "https://${CATALOG_FQDN}/api/v1/catalog"
configure_api "craves-kitchens" "Craves Kitchens" "api/v1/kitchens" "https://${USER_CHEF_FQDN}/api/v1/kitchens"
configure_api "craves-chef-profile" "Craves Chef Profile" "api/v1/chef/application" "https://${USER_CHEF_FQDN}/api/v1/chef/application"
configure_api "craves-chef-menu" "Craves Chef Menu" "api/v1/chef/menu" "https://${USER_CHEF_FQDN}/api/v1/chef/menu"
configure_api "craves-chef-orders" "Craves Chef Orders" "api/v1/chef/orders" "https://${ORDER_FQDN}/api/v1/chef/orders"
configure_api "craves-orders" "Craves Orders" "api/v1/orders" "https://${ORDER_FQDN}/api/v1/orders"
configure_api "craves-cart" "Craves Cart" "api/v1/cart" "https://${ORDER_FQDN}/api/v1/cart"
configure_api "craves-checkout" "Craves Checkout" "api/v1/checkout" "https://${ORDER_FQDN}/api/v1/checkout"
configure_api "craves-reviews" "Craves Reviews" "api/v1/reviews" "https://${ORDER_FQDN}/api/v1/reviews"
configure_api "craves-public" "Craves Public" "api/v1/public" "https://${ORDER_FQDN}/api/v1/public"
configure_api "craves-subscription" "Craves Subscription" "api/v1/subscriptions" "https://${SUBSCRIPTION_FQDN}/api/v1/subscriptions"
configure_api "craves-payments" "Craves Payments" "api/v1/payments" "https://${INTEGRATION_FQDN}/api/v1/payments"
configure_api "craves-webhooks" "Craves Webhooks" "api/v1/webhooks" "https://${INTEGRATION_FQDN}/api/v1/webhooks"
configure_api "craves-finance" "Craves Finance" "api/v1/admin/finance" "https://${INTEGRATION_FQDN}/api/v1/admin/finance"
configure_api "craves-chef-onboarding" "Craves Chef Onboarding" "api/v1/chef-onboarding" "https://${INTEGRATION_FQDN}/api/v1/chef-onboarding"
configure_api "craves-notification" "Craves Notification" "api/v1/notifications" "https://${NOTIFICATION_FQDN}/api/v1/notifications"
configure_api "craves-documents" "Craves Documents" "api/v1/documents" "https://${NOTIFICATION_FQDN}/api/v1/documents"

echo "Building customer web image."
az acr build \
  -r "$ACR" \
  -t "craves/customer-web-next:$TAG" \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=placeholder \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=craves-placeholder.firebaseapp.com \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=craves-placeholder \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:placeholder \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000 \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=craves-placeholder.appspot.com \
  --build-arg NEXT_PUBLIC_RAZORPAY_MODE=sandbox \
  --build-arg NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=true \
  "$SRC/apps/customer-web-next" \
  --only-show-errors

ensure_acr_pull "$WEB_APP"
containerapp_retry "web ingress ${WEB_APP}" az containerapp ingress update -g "$RG" -n "$WEB_APP" --type external --target-port 3000 --transport auto --allow-insecure false --only-show-errors --output none
containerapp_retry "web update ${WEB_APP}" az containerapp update \
  -g "$RG" \
  -n "$WEB_APP" \
  --image "$ACR_LOGIN_SERVER/craves/customer-web-next:$TAG" \
  --min-replicas 1 \
  --set-env-vars \
    "PORT=3000" \
    "HOSTNAME=0.0.0.0" \
    "CRAVES_ENVIRONMENT=prodlow" \
    "CRAVES_API_BASE_URL=https://${APIM_GATEWAY_HOST}/api/v1" \
    "NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=true" \
    "NEXT_PUBLIC_FIREBASE_API_KEY=placeholder" \
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=craves-placeholder.firebaseapp.com" \
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID=craves-placeholder" \
    "NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:placeholder" \
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000" \
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=craves-placeholder.appspot.com" \
  --only-show-errors \
  --output none

echo "Waiting for public web and gateway smoke tests."
sleep 60
curl --retry 20 --retry-delay 15 --retry-all-errors -fsS "$FRONT_DOOR_URL/" >/tmp/craves-frontdoor.html
curl --retry 10 --retry-delay 10 --retry-all-errors -fsS "https://${AUTH_FQDN}/actuator/health" >/tmp/craves-auth-health.json || true

mkdir -p "${BUILD_ARTIFACTSTAGINGDIRECTORY:-$PWD}"
{
  echo "# Craves product activation"
  echo
  echo "- Image tag: $TAG"
  echo "- Front Door: $FRONT_DOOR_URL"
  echo "- API gateway: https://${APIM_GATEWAY_HOST}/api/v1"
  echo "- Web app: $WEB_APP"
  echo "- Auth app: $AUTH_APP"
  echo "- Catalog app: $CATALOG_APP"
  echo "- Order app: $ORDER_APP"
  echo "- Subscription app: $SUBSCRIPTION_APP"
  echo "- Integration app: $INTEGRATION_APP"
  echo "- Notification app: $NOTIFICATION_APP"
  echo
  echo "Firebase production credentials are still placeholders until the real Firebase project values are added."
} > "${BUILD_ARTIFACTSTAGINGDIRECTORY:-$PWD}/craves-product-activation-summary.md"
