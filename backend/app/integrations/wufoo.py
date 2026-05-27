"""Map Wufoo webhook payloads to qualifier column names."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[3]
WOOFOO_MAP_PATH = BASE_DIR / "config" / "wufoo_field_map.json"


def load_wufoo_map() -> dict[str, str]:
    if not WOOFOO_MAP_PATH.exists():
        return {}
    data = json.loads(WOOFOO_MAP_PATH.read_text(encoding="utf-8"))
    return dict(data.get("wufoo_to_qualifier_map", {}))


def _normalize_fields_dict(raw: dict[str, Any]) -> dict[str, Any]:
    """Flatten Wufoo Fields array format to FieldN keys."""
    flat: dict[str, Any] = dict(raw)

    fields = raw.get("Fields")
    if isinstance(fields, list):
        for item in fields:
            if not isinstance(item, dict):
                continue
            field_id = item.get("ID") or item.get("Id") or item.get("id")
            value = item.get("Value") or item.get("value")
            if field_id:
                flat[str(field_id)] = value
            name = item.get("Name") or item.get("name")
            if name and value is not None:
                flat[str(name)] = value

    return flat


def wufoo_payload_to_lead_row(payload: dict[str, Any]) -> dict[str, Any]:
    """Convert Wufoo webhook/API payload to a qualifier lead row."""
    field_map = load_wufoo_map()
    flat = _normalize_fields_dict(payload)
    row: dict[str, Any] = {
        "Source": "Wufoo",
        "Lifecycle Stage": "Lead",
    }

    entry_id = flat.get("EntryId") or flat.get("EntryID") or flat.get("entryId")
    if entry_id:
        row["Record ID"] = str(entry_id)

    for wufoo_key, qualifier_col in field_map.items():
        if wufoo_key.startswith("_"):
            continue
        value = flat.get(wufoo_key)
        if value is not None and str(value).strip():
            row[qualifier_col] = value

    # Also match by field title if user mapped titles instead of FieldN ids
    for wufoo_key, qualifier_col in field_map.items():
        if qualifier_col in row and row[qualifier_col]:
            continue
        for candidate in (wufoo_key, wufoo_key.replace("_", " ")):
            value = flat.get(candidate)
            if value is not None and str(value).strip():
                row[qualifier_col] = value

    return row


def wufoo_entry_to_lead_row(entry: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible alias."""
    return wufoo_payload_to_lead_row(entry)
