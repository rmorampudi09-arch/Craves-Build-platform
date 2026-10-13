#!/usr/bin/env python3
"""The services cannot share a Java module (each Docker build only sees its own folder), so a few platform
classes are copied into every service. Fail when a copy drifts from the others (package line excepted)."""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
COPIED = ["InternalCallSignature.java", "InternalCallFilter.java", "InternalCallSigningConfiguration.java"]
errors: list[str] = []
for name in COPIED:
    copies = sorted(ROOT.glob(f"services/*/src/main/java/**/{name}"))
    bodies = {path: re.sub(r"^package [\w.]+;", "package <service>;", path.read_text(encoding="utf-8"), count=1) for path in copies}
    if len(set(bodies.values())) > 1:
        errors.append(f"{name} differs between: " + ", ".join(str(p.relative_to(ROOT)) for p in copies))
    print(f"{name}: {len(copies)} copies")
if errors:
    print("\n".join(f"ERROR: {e}" for e in errors), file=sys.stderr)
    sys.exit(1)
print("SUCCESS: copied platform classes are identical")
