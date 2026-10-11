#!/usr/bin/env bash
# Brings a branch that started before the web feature folders onto them, so the only conflicts left are your own.
# From the repository root, on your branch:   bash apps/customer-web-next/scripts/features/update-branch.sh [base]
# (base defaults to origin/main). If it stops for conflicts: fix them, commit, and run it again.
set -euo pipefail
BASE="${1:-origin/main}"
APP=apps/customer-web-next
git fetch -q origin
# The commit that moved the files (it removed src/lib/utils.ts), and the base branch just before it.
MOVE=$(git log --format=%H --diff-filter=D -1 "$BASE" -- "$APP/src/lib/utils.ts")
if [ -z "$MOVE" ]; then echo "$BASE has no feature folders yet; nothing to do."; exit 0; fi
PRE=$(git rev-parse "$MOVE^1")

if ! git merge-base --is-ancestor "$MOVE" HEAD; then
  # 1. Catch up with main as it was just before the move. Conflicts here are this branch's own.
  if ! git merge-base --is-ancestor "$PRE" HEAD && ! git merge --no-edit "$PRE"; then
    echo "Step 1 of 3: these conflicts come from this branch being behind main, not from the folders change."
    echo "Fix them, commit, then run this script again."
    exit 1
  fi
  # 2. Move this branch's files exactly the way main's were moved.
  mkdir -p "$APP/scripts/features"
  for f in move-to-features.mjs feature-map.json; do git show "$MOVE:$APP/scripts/features/$f" > "$APP/scripts/features/$f"; done
  (cd "$APP" && node scripts/features/move-to-features.mjs --branch)
  git add -A
  git diff --cached --quiet || git commit -qm "Move this branch onto the web feature folders"
  # 3. Join the move. Both sides moved the same files the same way, so this branch's copy of a moved file is the right one.
  if ! git merge --no-edit -X ours "$MOVE"; then
    left=$(git diff --name-only --diff-filter=U)
    if echo "$left" | grep -qv "^$APP/src/"; then
      git merge --abort
      echo "Step 3 of 3: unexpected conflicts outside $APP/src:"; echo "$left"; exit 1
    fi
    for f in $left; do
      if git cat-file -e ":2:$f" 2>/dev/null; then git checkout --ours -- "$f"; git add -- "$f"; else git rm -q -- "$f"; fi
    done
    git commit -q --no-edit
  fi
fi

# Everything merged into the base branch after the move.
if ! git merge --no-edit "$BASE"; then
  echo "These conflicts are with work merged after the folders change. Fix them, commit, then run this script again."
  exit 1
fi
(cd "$APP" && node scripts/features/move-to-features.mjs --fix-imports && node scripts/features/check-boundaries.mjs --update)
(cd apps/mobile && node scripts/check-feature-boundaries.mjs --update)
git add -A
git diff --cached --quiet || git commit -qm "Rewrite old web paths and record links between features"
echo "Done. In $APP run: npm run lint && npm run typecheck && npm test, then push."
