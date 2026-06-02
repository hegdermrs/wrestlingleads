"""CLI: compare old qualified.xlsx vs current scored cache."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(BASE / "backend"))

from app.tier_compare import export_comparison_report  # noqa: E402


def main() -> None:
    old = BASE / "qualified.xlsx"
    if not old.exists():
        old = BASE / "data" / "qualified.xlsx"
    new = BASE / "data" / "scored_cache.parquet"

    result = export_comparison_report(old, new)
    print(json.dumps(result, indent=2))
    print(f"\nReport written to: {result['output_path']}")


if __name__ == "__main__":
    main()
