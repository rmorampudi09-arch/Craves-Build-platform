#!/usr/bin/env python3
"""Recover a PDF source package; never execute the package or deploy anything.

Accepted layouts: repository-relative files, repository/<path>, or one JSON
manifest containing {"files": [{"path": ..., "content": ..., "encoding":
"utf-8"|"base64"}]}. content_base64 is also accepted explicitly.
Only the four PDF-owning services, customer web, document scripts and docs are
in scope. Workflows, infrastructure, secrets, fonts and generated outputs are
not imported. Existing SQL migrations cannot be changed.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

MAX_ARCHIVE = 20 * 1024 * 1024
MAX_TOTAL = 32 * 1024 * 1024
MAX_FILE = 2 * 1024 * 1024
MAX_FILES = 600
PREFIXES = (
    "services/notification-service/", "services/order-service/",
    "services/integration-service/", "services/subscription-service/",
    "apps/customer-web-next/", "scripts/documents/", "docs/",
)
TEXT_SUFFIXES = {".java", ".xml", ".sql", ".yaml", ".yml", ".properties",
                 ".md", ".json", ".ts", ".tsx", ".js", ".mjs", ".cjs",
                 ".css", ".sh", ".py", ".txt", ".svg"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}
PROTECTED = {
    "scripts/documents/recover_pdf_source.py",
    "scripts/documents/test_recover_pdf_source.py",
    "docs/handover/2026-09-11-pdf-github-recovery.md",
}
FORBIDDEN_PARTS = {".git", ".github", "node_modules", "target", ".next",
                   "__pycache__", "secrets", "credentials"}
SECRET = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}")


class PackageError(ValueError):
    """The package is unsafe, out of scope, or incompatible."""


def clean_path(raw: str) -> str:
    if not isinstance(raw, str) or not raw or len(raw) > 500:
        raise PackageError("Invalid package path")
    if "\\" in raw or any(ord(c) < 32 or ord(c) > 126 for c in raw):
        raise PackageError("Non-canonical package path")
    parts = raw.split("/")
    if any(p in {"", ".", ".."} for p in parts):
        raise PackageError("Unsafe path segments")
    if raw.startswith("repository/"):
        raw = raw[len("repository/"):]
    path = PurePosixPath(raw)
    if path.is_absolute() or any(p.casefold() in FORBIDDEN_PARTS for p in path.parts):
        raise PackageError("Forbidden package path")
    if any(p.startswith(".") and p != ".env.example" for p in path.parts):
        raise PackageError("Hidden files are not allowed except .env.example")
    if ":" in raw or raw in PROTECTED or not raw.startswith(PREFIXES):
        raise PackageError("File is outside PDF source scope: " + raw)
    if path.name != ".env.example" and path.suffix.lower() not in TEXT_SUFFIXES | IMAGE_SUFFIXES:
        raise PackageError("Unsupported source file type: " + raw)
    return raw


def validate_bytes(path: str, content: bytes) -> None:
    if len(content) > MAX_FILE:
        raise PackageError("Source file exceeds size limit: " + path)
    suffix = PurePosixPath(path).suffix.lower()
    if suffix not in IMAGE_SUFFIXES:
        try:
            content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise PackageError("Source text is not UTF-8: " + path) from exc
        if b"\x00" in content:
            raise PackageError("NUL in source text: " + path)
        if SECRET.search(content):
            raise PackageError("Potential credential detected; content not printed")
    elif suffix == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise PackageError("Invalid PNG signature")
    elif suffix in {".jpg", ".jpeg"} and not content.startswith(b"\xff\xd8\xff"):
        raise PackageError("Invalid JPEG signature")


def add_file(files: dict[str, bytes], raw: str, content: bytes) -> None:
    path = clean_path(raw)
    if path.casefold() in {p.casefold() for p in files}:
        raise PackageError("Duplicate or case-colliding file: " + path)
    validate_bytes(path, content)
    if len(files) >= MAX_FILES or sum(map(len, files.values())) + len(content) > MAX_TOTAL:
        raise PackageError("Expanded package exceeds limits")
    files[path] = content


def from_manifest(data: dict) -> dict[str, bytes]:
    entries = data.get("files")
    if not isinstance(entries, list) or not entries or len(entries) > MAX_FILES:
        raise PackageError("Manifest must contain a bounded, nonempty files list")
    files: dict[str, bytes] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise PackageError("Invalid manifest entry")
        if entry.get("type", "blob") != "blob" or str(entry.get("mode", "100644")) not in {"100644", "100755"}:
            raise PackageError("Only regular source files are accepted")
        if "content_base64" in entry:
            if "content" in entry:
                raise PackageError("Ambiguous file content encoding")
            content = entry["content_base64"]
            encoding = "base64"
        else:
            content = entry.get("content")
            encoding = entry.get("encoding", "utf-8")
        if not isinstance(content, str):
            raise PackageError("Manifest entry lacks complete file contents")
        try:
            if encoding == "base64":
                payload = base64.b64decode(content, validate=True)
            elif encoding == "utf-8":
                payload = content.encode("utf-8")
            else:
                raise PackageError("Unknown source encoding")
        except (ValueError, UnicodeError) as exc:
            raise PackageError("Invalid encoded source") from exc
        expected = entry.get("sha256")
        if expected is not None and expected != hashlib.sha256(payload).hexdigest():
            raise PackageError("Source checksum mismatch")
        add_file(files, entry.get("path"), payload)
    return files


def load_package(archive: Path) -> dict[str, bytes]:
    if not archive.is_file() or archive.stat().st_size > MAX_ARCHIVE:
        raise PackageError("Missing or oversized source ZIP")
    try:
        with zipfile.ZipFile(archive) as bundle:
            entries = bundle.infolist()
            if len(entries) > MAX_FILES * 2:
                raise PackageError("Too many ZIP entries")
            total = 0
            regular = []
            names = set()
            for entry in entries:
                raw = entry.filename
                if raw in names:
                    raise PackageError("Duplicate archive entry")
                names.add(raw)
                if "\\" in raw or raw.startswith("/") or any(p in {".", ".."} for p in raw.split("/")):
                    raise PackageError("Unsafe archive member")
                mode = entry.external_attr >> 16
                if stat.S_IFMT(mode) not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise PackageError("ZIP links and special files are forbidden")
                if entry.flag_bits & 1:
                    raise PackageError("Encrypted ZIP is unsupported")
                total += entry.file_size
                if total > MAX_TOTAL or entry.file_size > MAX_TOTAL:
                    raise PackageError("Expanded archive exceeds limits")
                if not entry.is_dir():
                    regular.append(entry)
            if len(regular) == 1 and regular[0].filename.endswith(".json"):
                data = json.loads(bundle.read(regular[0]))
                if isinstance(data, dict) and "files" in data:
                    return from_manifest(data)
            files: dict[str, bytes] = {}
            for entry in regular:
                add_file(files, entry.filename, bundle.read(entry))
            if not files:
                raise PackageError("Empty source package")
            return files
    except (zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise PackageError("Invalid ZIP or JSON manifest") from exc


def check_destinations(root: Path, files: dict[str, bytes]) -> None:
    root = root.resolve(strict=True)
    for path, content in files.items():
        destination = root / path
        current = root
        for part in PurePosixPath(path).parts:
            current /= part
            if current.is_symlink():
                raise PackageError("Refusing to write through a symlink")
        if not destination.resolve().is_relative_to(root):
            raise PackageError("Destination escapes repository")
        if destination.exists() and not destination.is_file():
            raise PackageError("Source destination is not a regular file")
        if destination.exists() and "/db/migration/" in path and destination.read_bytes() != content:
            raise PackageError("Existing database migrations cannot be overwritten: " + path)
    paths = set(files)
    for path in paths:
        if any(str(parent) in paths for parent in PurePosixPath(path).parents):
            raise PackageError("File/directory path collision")


def recover(archive: Path, root: Path, report: Path, apply: bool = False) -> dict:
    files = load_package(archive)
    check_destinations(root, files)
    result = {
        "schemaVersion": 1,
        "archiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "fileCount": len(files),
        "sourceAcceptance": "NOT_VALIDATED",
        "productionChanges": False,
        "files": [{"path": p, "bytes": len(v), "sha256": hashlib.sha256(v).hexdigest()}
                  for p, v in sorted(files.items())],
    }
    if apply:
        for path, content in sorted(files.items()):
            destination = root / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
            # Never carry executable/suid bits supplied by the archive.
            destination.chmod(0o644)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        result = recover(args.archive, args.root, args.report, args.apply)
        print(f"Recovered {result['fileCount']} source files; module validation and deployment remain separate.")
        return 0
    except (PackageError, OSError) as exc:
        print("Source recovery stopped: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
