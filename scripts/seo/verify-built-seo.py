#!/usr/bin/env python3
"""Start the built production server and verify its public SEO contract."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[2]
web = root / "apps/customer-web-next"
subprocess.run(["node", "scripts/prepare-standalone.mjs"], cwd=web, check=True,
               stdout=sys.stderr)
with socket.socket() as port_probe:
    port_probe.bind(("127.0.0.1", 0))
    port = port_probe.getsockname()[1]
server = subprocess.Popen(["node", ".next/standalone/server.js"], cwd=web,
    env={**os.environ, "HOSTNAME": "127.0.0.1", "PORT": str(port)},
    stdout=sys.stderr, stderr=sys.stderr)
try:
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Production server stopped before becoming ready")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                break
        except OSError:
            time.sleep(0.2)
    else:
        raise RuntimeError("Production server did not become ready")
    result = subprocess.run([sys.executable, str(root / "scripts/seo/verify-public-seo.py"),
        "--origin", f"http://127.0.0.1:{port}", "--check-www", "--check-images"])
    raise SystemExit(result.returncode)
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
