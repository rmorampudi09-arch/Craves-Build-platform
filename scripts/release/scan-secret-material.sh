#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

mapfile -t FILES < <(git ls-files -z | xargs -0 -n1 printf '%s\n' | grep -Ev '(^|/)(node_modules|target|dist|build|coverage|\.git)/' || true)
((${#FILES[@]} > 0)) || { echo 'ERROR: no tracked files found.' >&2; exit 1; }

PATTERN='-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|accesskey=[A-Za-z0-9+/=]{20,}|client[_-]?secret["'"'=: ]+[A-Za-z0-9._~+/-]{16,}|connectionString["'"'=: ]+[^$({][^[:space:]]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._-]{20,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}'

failures=0
for file in "${FILES[@]}"; do
  [[ -f "$file" ]] || continue
  case "$file" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.pdf|*.zip|*.jar|*.keystore|*.p12) continue ;;
  esac
  if LC_ALL=C grep -En "$PATTERN" "$file" >/tmp/craves-secret-scan-match 2>/dev/null; then
    echo "ERROR: possible credential material in $file" >&2
    sed 's/=.*/=<redacted>/' /tmp/craves-secret-scan-match >&2 || true
    failures=$((failures+1))
  fi
done
rm -f /tmp/craves-secret-scan-match

if (( failures > 0 )); then
  echo "FAILED: $failures file(s) contain possible secret material." >&2
  exit 1
fi

echo "SUCCESS: scanned ${#FILES[@]} tracked files; no obvious credential material found."
