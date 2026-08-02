#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

mapfile -t FILES < <(git ls-files -z | xargs -0 -n1 printf '%s\n' | grep -Ev '(^|/)(node_modules|target|dist|build|coverage|\.git)/' || true)
((${#FILES[@]} > 0)) || { echo 'ERROR: no tracked files found.' >&2; exit 1; }

# High-confidence signatures that are unsafe regardless of the text-file type.
# A PEM header is anchored to the complete line so parser code such as
# .replace("-----BEGIN PRIVATE KEY-----", "") is not mistaken for a key.
COMMON_PATTERN=$(cat <<'REGEX'
^[[:space:]]*-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[[:space:]]*$|accesskey=[A-Za-z0-9+/=]{20,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._-]{20,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}
REGEX
)

# Hard-coded quoted values are suspicious in source code and configuration.
# Requiring an assignment delimiter and a quoted literal avoids matching Java
# getters/setters such as getConnectionString() or `this.connectionString = connectionString`.
QUOTED_ASSIGNMENT_PATTERN=$(cat <<'REGEX'
["']?(client[_-]?secret|connection[_-]?string|private[_-]?key)["']?[[:space:]]*[:=][[:space:]]*["'][^"'$({][^"']{15,}["']
REGEX
)

# Unquoted values are common in .env/properties/YAML-style configuration, but
# applying this rule to Java/TypeScript would incorrectly flag variable-to-variable assignments.
UNQUOTED_CONFIG_ASSIGNMENT_PATTERN=$(cat <<'REGEX'
["']?(client[_-]?secret|connection[_-]?string|private[_-]?key)["']?[[:space:]]*[:=][[:space:]]*[^$({[:space:]"'][^[:space:]"']{15,}
REGEX
)

MATCH_FILE=$(mktemp)
CURRENT_MATCHES=$(mktemp)
trap 'rm -f "$MATCH_FILE" "$CURRENT_MATCHES"' EXIT

failures=0
for file in "${FILES[@]}"; do
  [[ -f "$file" ]] || continue
  case "$file" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.pdf|*.zip|*.jar|*.keystore|*.jks|*.p12|*.mobileprovision) continue ;;
  esac
  grep -Iq . "$file" || continue

  : >"$MATCH_FILE"
  : >"$CURRENT_MATCHES"

  LC_ALL=C grep -Ein -- "$COMMON_PATTERN" "$file" >>"$CURRENT_MATCHES" 2>/dev/null || true
  LC_ALL=C grep -Ein -- "$QUOTED_ASSIGNMENT_PATTERN" "$file" >>"$CURRENT_MATCHES" 2>/dev/null || true

  case "$file" in
    *.env|*.env.*|*.properties|*.yml|*.yaml|*.json|*.toml|*.tfvars|*.ini|*.conf)
      LC_ALL=C grep -Ein -- "$UNQUOTED_CONFIG_ASSIGNMENT_PATTERN" "$file" >>"$CURRENT_MATCHES" 2>/dev/null || true
      ;;
  esac

  if [[ -s "$CURRENT_MATCHES" ]]; then
    sort -t: -k1,1n -u "$CURRENT_MATCHES" >"$MATCH_FILE"
    echo "ERROR: possible credential material in $file" >&2
    cut -d: -f1 "$MATCH_FILE" | sort -n -u | sed 's/^/  line /' >&2
    failures=$((failures+1))
  fi
done

if (( failures > 0 )); then
  echo "FAILED: $failures file(s) contain possible secret material." >&2
  exit 1
fi

echo "SUCCESS: scanned ${#FILES[@]} tracked files; no obvious credential material found."
