#!/usr/bin/env python3
"""Reject edits/deletions/renames of any baseline file. No network or production access."""
import subprocess
from pathlib import Path

BASE = "870f5293884888aa28f0c069b91a86d06492c9a2"
ALLOWED = (
    "services/referral-service/", "docs/referrals/", "scripts/referrals/", "tests/referrals/",
    "apps/customer-web-next/src/components/referrals/", "apps/customer-web-next/src/lib/referrals/",
    "apps/mobile/src/features/referralsV2/", ".github/workflows/chef-referral-v2-ci.yml",
)

def main():
    root = Path(__file__).resolve().parents[2]
    lines = subprocess.check_output(["git", "diff", "--name-status", "--no-renames", BASE, "HEAD"], cwd=root, text=True).splitlines()
    if not lines:
        raise SystemExit("No referral changes found")
    for line in lines:
        status, path = line.split("\t", 1)
        if status != "A" or not path.startswith(ALLOWED):
            raise SystemExit(f"Non-additive or out-of-scope change refused: {line}")
    print(f"PASS: {len(lines)} added files; no baseline edits, deletions or renames. Base {BASE}")

if __name__ == "__main__":
    main()
