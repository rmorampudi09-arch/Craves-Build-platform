#!/usr/bin/env bash
# One-time production setup for advanced-features-service (new resource group, database, container app, gateway API,
# release pipeline). Paste this single line into Azure Cloud Shell (Bash, signed in as ravitejamm6@gmail.com):
#
#   curl -fsSL https://raw.githubusercontent.com/rmorampudi09-arch/Craves-Build-platform/main/infra/advanced-features/setup-once.sh | bash
#
# It deploys the code that is on GitHub main right now. Safe to run again: every step checks before it creates.
set -euo pipefail
REPO=rmorampudi09-arch/Craves-Build-platform
COMMIT=$(git ls-remote "https://github.com/$REPO.git" refs/heads/main | cut -f1)
DIR=~/advanced-features-setup/$COMMIT
mkdir -p "$DIR"
cd "$DIR"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$COMMIT" | tar -xz --strip-components=1 \
  --wildcards '*/infra/advanced-features/*' '*/infra/apim/advanced-features/*'
echo "Setting up advanced features from main $COMMIT (log: ~/advanced-features-setup.log)"
bash infra/advanced-features/provision.sh all "$COMMIT" 2>&1 | tee ~/advanced-features-setup.log
