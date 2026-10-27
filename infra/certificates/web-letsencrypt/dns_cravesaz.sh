#!/usr/bin/env sh
# acme.sh DNS-01 hook (used as --dns dns_cravesaz): writes the _acme-challenge TXT values into the Azure DNS zone with
# the pipeline's own `az` sign-in. Replaces acme.sh's dns_azure, whose zone lookup failed on _acme-challenge.www.craves.in
# (run 400, 27 Oct 2026). Needs CRAVES_DNS_ZONE and CRAVES_DNS_RESOURCE_GROUP. POSIX sh: acme.sh runs under sh.

dns_cravesaz_add() {
  _cravesaz_name="$(_cravesaz_record_name "$1")" || return 1
  az network dns record-set txt add-record --resource-group "$CRAVES_DNS_RESOURCE_GROUP" --zone-name "$CRAVES_DNS_ZONE" \
    --record-set-name "$_cravesaz_name" --value "$2" --only-show-errors --output none
}

dns_cravesaz_rm() {
  _cravesaz_name="$(_cravesaz_record_name "$1")" || return 1
  # Removing the last value also removes the record set.
  az network dns record-set txt remove-record --resource-group "$CRAVES_DNS_RESOURCE_GROUP" --zone-name "$CRAVES_DNS_ZONE" \
    --record-set-name "$_cravesaz_name" --value "$2" --only-show-errors --output none
}

_cravesaz_record_name() {
  case "$1" in
    *."$CRAVES_DNS_ZONE") printf '%s' "${1%."$CRAVES_DNS_ZONE"}" ;;
    *) echo "dns_cravesaz: $1 is not inside zone $CRAVES_DNS_ZONE" >&2; return 1 ;;
  esac
}
