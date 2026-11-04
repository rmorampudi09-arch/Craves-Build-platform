#!/usr/bin/env bash
# Lets catalog-service write dish and kitchen photos to its media storage account.
#
# The account's firewall denies by default and only lists Front Door's IPs. Catalog reaches it from its own
# Container Apps subnet through a Microsoft.Storage service endpoint, the way user-chef reaches the documents
# account. The 29 Oct 2026 move left this out, so every photo upload failed with Azure Storage 403
# AuthorizationFailure; applied by hand on 3 Nov 2026. Safe to run again.
set -euo pipefail

RG="${RG:-rg-craves-catalog-prod}"
VNET="${VNET:-vnet-craves-catalog-prod}"
SUBNET="${SUBNET:-infra}"
ACCOUNT="${ACCOUNT:-stcravesmedia34eefd}"

# Sets the subnet's whole endpoint list; the catalog subnet uses no other service endpoint.
az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --service-endpoints Microsoft.Storage -o none
az storage account network-rule add -g "$RG" --account-name "$ACCOUNT" --vnet-name "$VNET" --subnet "$SUBNET" -o none

state=$(az storage account network-rule list -g "$RG" --account-name "$ACCOUNT" \
  --query "virtualNetworkRules[?ends_with(virtualNetworkResourceId, '/$VNET/subnets/$SUBNET')].state | [0]" -o tsv)
if [ "$state" != "Succeeded" ]; then
  echo "Network rule for $VNET/$SUBNET on $ACCOUNT is '$state'" >&2
  exit 1
fi
echo "Catalog subnet $VNET/$SUBNET can write to $ACCOUNT"
