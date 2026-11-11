#!/usr/bin/env bash
# Handbook 108: move all of one production app's traffic back to an earlier revision (subscription 34eefd95 only).
#
#   bash scripts/release/rollback-revision.sh ca-craves-<feature>-prod [revision]                    dry run, changes nothing
#   CONFIRM_ROLLBACK=true bash scripts/release/rollback-revision.sh ca-craves-<feature>-prod [revision]
#
# The resource group is rg-craves-<feature>-prod (RESOURCE_GROUP=rg-craves-<other>-prod for an app kept elsewhere). Without a revision, the target is the newest revision created before the
# one serving now that is still active and Healthy. Only traffic moves: no image, setting or revision is created, changed
# or deleted, so going forward again is the same command naming the newer revision. It refuses while traffic is split
# (a release canary may be running) and never activates a revision: activate one first if you need it.
set -euo pipefail
set +x
EXPECTED_SUBSCRIPTION=34eefd95-1a19-416f-b9df-92b326500615
APP="${1:-}"
TARGET="${2:-}"
fail() { echo "ERROR: $*" >&2; exit 1; }

[[ "$APP" =~ ^ca-craves-([a-z0-9]+(-[a-z0-9]+)*)-prod$ ]] || fail "usage: $0 ca-craves-<feature>-prod [revision]"
RG="${RESOURCE_GROUP:-rg-craves-${BASH_REMATCH[1]}-prod}"
[[ "$RG" =~ ^rg-craves-[a-z0-9]+(-[a-z0-9]+)*-prod$ ]] || fail "RESOURCE_GROUP must be rg-craves-<feature>-prod"
for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done

[[ $(az account show --query id -o tsv) == "$EXPECTED_SUBSCRIPTION" ]] || fail 'Wrong Azure subscription; nothing changed.'
[[ $(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.activeRevisionsMode -o tsv) == Multiple ]] ||
  fail "$APP is not in multiple-revision mode; nothing changed."
REVISIONS=$(az containerapp revision list -g "$RG" -n "$APP" --all -o json)
CURRENT=$(jq -r '[.[] | select((.properties.trafficWeight // 0) > 0)] | if length == 1 then .[0].name else "" end' <<<"$REVISIONS")
[[ -n "$CURRENT" ]] || fail "$APP has no single revision taking all traffic (a release may be running); nothing changed."

usable='select(.properties.active == true and .properties.healthState == "Healthy")'
if [[ -z "$TARGET" ]]; then
  CREATED=$(jq -r --arg c "$CURRENT" '.[] | select(.name == $c) | .properties.createdTime' <<<"$REVISIONS")
  TARGET=$(jq -r --arg c "$CREATED" "[.[] | select(.properties.createdTime < \$c) | $usable] | sort_by(.properties.createdTime) | last | .name // \"\"" <<<"$REVISIONS")
  [[ -n "$TARGET" ]] || fail "No active, Healthy revision older than $CURRENT; activate one (az containerapp revision activate -g $RG -n $APP --revision <name>) and name it."
fi
[[ "$TARGET" != "$CURRENT" ]] || fail "$TARGET already takes all traffic; nothing changed."
[[ -n $(jq -r --arg t "$TARGET" ".[] | select(.name == \$t) | $usable | .name" <<<"$REVISIONS") ]] ||
  fail "$TARGET is not an active, Healthy revision of $APP; nothing changed."

echo "$APP ($RG): all traffic on $CURRENT; rollback target $TARGET."
if [[ "${CONFIRM_ROLLBACK:-false}" != true ]]; then
  echo 'Dry run: nothing changed. Set CONFIRM_ROLLBACK=true to move all traffic to the target.'
  exit 0
fi
az containerapp ingress traffic set -g "$RG" -n "$APP" --revision-weight "$TARGET=100" -o none
AFTER=$(az containerapp revision list -g "$RG" -n "$APP" --all -o json)
[[ $(jq -r '[.[] | select((.properties.trafficWeight // 0) > 0) | "\(.name)=\(.properties.trafficWeight)"] | join(",")' <<<"$AFTER") == "$TARGET=100" ]] ||
  fail "Read-back does not show $TARGET at 100 %; check the app now."
echo "Moved all traffic of $APP to $TARGET. Undo: CONFIRM_ROLLBACK=true bash $0 $APP $CURRENT"
