#!/usr/bin/env python3
"""Validate review JSON files against .claude/shared/review-findings.schema.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--schema",
        default=".claude/shared/review-findings.schema.json",
        help="Path to JSON schema file.",
    )
    parser.add_argument(
        "--reviews-dir",
        default=".agent-team/reviews",
        help="Directory containing review JSON files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    schema_path = Path(args.schema)
    reviews_dir = Path(args.reviews_dir)

    if not schema_path.exists():
        print(f"Schema file not found: {schema_path}")
        return 1

    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    if not reviews_dir.exists():
        print(f"Reviews directory not found: {reviews_dir} (skipped)")
        return 0

    json_files = sorted(reviews_dir.rglob("*.json"))
    if not json_files:
        print(f"No JSON review files found in {reviews_dir} (skipped)")
        return 0

    has_error = False
    for path in json_files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover
            has_error = True
            print(f"[INVALID JSON] {path}: {exc}")
            continue

        errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
        if not errors:
            print(f"[OK] {path}")
            continue

        has_error = True
        print(f"[SCHEMA ERROR] {path}")
        for err in errors:
            loc = ".".join(str(p) for p in err.path) or "<root>"
            print(f"  - {loc}: {err.message}")

    return 1 if has_error else 0


if __name__ == "__main__":
    sys.exit(main())
