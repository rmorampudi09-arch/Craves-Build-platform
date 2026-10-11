#!/usr/bin/env bash
set -euo pipefail

REPO="${1-rmorampudi09-arch/Craves-Build-platform}"
START_PR="${2-25}"
END_PR="${3-68}"

command -v gh >/dev/null 2>&1 || { echo 'ERROR: GitHub CLI (gh) is required.' >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo 'ERROR: jq is required.' >&2; exit 1; }
[[ -n "$REPO" ]] || { echo 'ERROR: repository must not be empty.' >&2; exit 1; }
[[ "$START_PR" =~ ^[1-9][0-9]*$ && "$END_PR" =~ ^[1-9][0-9]*$ && "$START_PR" -le "$END_PR" ]] || { echo 'ERROR: invalid PR range.' >&2; exit 1; }

previous_head=""
previous_head_repo=""
previous_head_sha=""
failures=0
verified=0
printf '%-6s %-8s %-8s %-45s %-45s\n' PR STATE DRAFT BASE HEAD
for pr in $(seq "$START_PR" "$END_PR"); do
  # GitHub computes mergeability asynchronously. Retry only a genuine null;
  # a conflict, malformed response, or API failure is never positive evidence.
  for attempt in 1 2 3; do
    if ! json=$(gh api "repos/$REPO/pulls/$pr"); then
      echo "ERROR: metadata request failed for required PR #$pr." >&2
      exit 1
    fi
    if ! jq -e --argjson number "$pr" --arg repo "$REPO" '
      .number == $number and
      (.base.repo.full_name | type == "string") and
      (.head.repo.full_name | type == "string" and test("[^[:space:]]")) and
      (.base.sha | type == "string" and test("^[0-9a-f]{40}$")) and
      (.head.sha | type == "string" and test("^[0-9a-f]{40}$")) and
      ((.base.repo.full_name | ascii_downcase) == ($repo | ascii_downcase)) and
      type == "object" and
      (.state | type == "string") and (.draft | type == "boolean") and
      (.base.ref | type == "string" and test("[^[:space:]]")) and
      (.head.ref | type == "string" and test("[^[:space:]]")) and
      has("mergeable") and (.mergeable == null or (.mergeable | type == "boolean"))
    ' <<<"$json" >/dev/null; then
      echo "ERROR: incomplete or invalid metadata for required PR #$pr." >&2
      exit 1
    fi
    mergeable=$(jq -r 'if .mergeable == null then "pending" else .mergeable end' <<<"$json")
    [[ "$mergeable" == "pending" && "$attempt" -lt 3 ]] || break
    sleep 2
  done
  verified=$((verified+1))
  state=$(jq -r '.state' <<<"$json")
  draft=$(jq -r '.draft' <<<"$json")
  base=$(jq -r '.base.ref' <<<"$json")
  head=$(jq -r '.head.ref' <<<"$json")
  base_repo=$(jq -r '.base.repo.full_name | ascii_downcase' <<<"$json")
  head_repo=$(jq -r '.head.repo.full_name | ascii_downcase' <<<"$json")
  base_sha=$(jq -r '.base.sha' <<<"$json")
  head_sha=$(jq -r '.head.sha' <<<"$json")
  printf '#%-5s %-8s %-8s %-45s %-45s\n' "$pr" "$state" "$draft" "$base" "$head"

  if [[ "$state" != "open" || "$draft" != "true" ]]; then
    echo "ERROR: PR #$pr must remain open and draft before controlled rollout." >&2
    failures=$((failures+1))
  fi
  if [[ "$mergeable" != "true" ]]; then
    echo "ERROR: PR #$pr is not confirmed mergeable ($mergeable)." >&2
    failures=$((failures+1))
  fi
  if [[ -n "$previous_head" && ( "$base" != "$previous_head" || "$base_repo" != "$previous_head_repo" || "$base_sha" != "$previous_head_sha" ) ]]; then
    echo "ERROR: PR #$pr base '$base_repo:$base@$base_sha' does not match previous head '$previous_head_repo:$previous_head@$previous_head_sha'." >&2
    failures=$((failures+1))
  fi
  previous_head="$head"
  previous_head_repo="$head_repo"
  previous_head_sha="$head_sha"
done

if (( verified != END_PR - START_PR + 1 )); then
  echo "ERROR: not every required PR was verified." >&2
  exit 1
fi

if (( failures > 0 )); then
  echo "FAILED: $failures stacked-PR issue(s) found." >&2
  exit 1
fi

echo 'SUCCESS: stacked PR chain is open, draft, mergeable and correctly ordered.'
