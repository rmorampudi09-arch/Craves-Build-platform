#!/usr/bin/env bash
# Prints the rider app's 11-character hash for Android's SMS Retriever. The rider-only DLT and MSG91 OTP template must end
# with it, so the code fills in with no tap (docs/riders/GO-LIVE.md §11). Google's algorithm: SHA-256 of "<package>
# <signing certificate as lower-case hex>", base64, the first 11 characters. Use the certificate that signs the APK on the
# phone: the rider keystore (GitHub secrets RIDER_KEYSTORE_BASE64, RIDER_KEY_ALIAS) for the APK from the GitHub workflow,
# or Play's app signing certificate (Play Console, App integrity) for an app installed from Google Play.
#   scripts/riders/app-hash.sh <keystore file> <alias>     asks for the password, or set RIDER_KEYSTORE_PASSWORD
#   scripts/riders/app-hash.sh --cert <certificate file>   DER or PEM
set -euo pipefail
package=com.cravesapp.rider
if [[ $# -eq 2 && $1 == --cert ]]; then
  form=DER
  if grep -q -- '-----BEGIN CERTIFICATE-----' "$2"; then form=PEM; fi
  hex=$(openssl x509 -in "$2" -inform "$form" -outform DER | od -An -v -tx1 | tr -d ' \n')
elif [[ $# -eq 2 ]]; then
  # shellcheck disable=SC2086 # two words, -storepass:env NAME, only when the variable is set
  hex=$(keytool -exportcert -keystore "$1" -alias "$2" ${RIDER_KEYSTORE_PASSWORD:+-storepass:env RIDER_KEYSTORE_PASSWORD} \
    | od -An -v -tx1 | tr -d ' \n')
else
  echo "usage: $0 <keystore file> <alias>  |  $0 --cert <certificate file>" >&2
  exit 2
fi
if [[ -z $hex ]]; then echo "No certificate found" >&2; exit 1; fi
printf '%s %s' "$package" "$hex" | openssl dgst -sha256 -binary | base64 | cut -c1-11
