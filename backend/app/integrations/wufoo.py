"""Map Wufoo webhook payloads to qualifier column names."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..lead_form_fields import FORM_LABEL_TO_COLUMN, column_for_wufoo_title, normalize_wufoo_title

BASE_DIR = Path(__file__).resolve().parents[3]
WOOFOO_MAP_PATH = BASE_DIR / "config" / "wufoo_field_map.json"


def load_wufoo_map() -> dict[str, str]:
    if not WOOFOO_MAP_PATH.exists():
        return {}
    data = json.loads(WOOFOO_MAP_PATH.read_text(encoding="utf-8"))
    return dict(data.get("wufoo_to_qualifier_map", {}))


def _load_title_map() -> dict[str, str]:
    if not WOOFOO_MAP_PATH.exists():
        return {}
    data = json.loads(WOOFOO_MAP_PATH.read_text(encoding="utf-8"))
    return dict(data.get("wufoo_title_to_qualifier_map", {}))


def _field_key(field_id: object) -> str:
    """Normalize Wufoo field IDs to FieldN keys used in webhooks."""
    raw = str(field_id).strip()
    if not raw:
        return ""
    if raw.startswith("Field"):
        return raw
    if raw.isdigit():
        return f"Field{raw}"
    return raw


def _normalize_fields_dict(raw: dict[str, Any]) -> dict[str, Any]:
    """Flatten Wufoo Fields array format to FieldN keys and field titles."""
    flat: dict[str, Any] = dict(raw)

    fields = raw.get("Fields")
    if isinstance(fields, list):
        for item in fields:
            if not isinstance(item, dict):
                continue
            field_id = item.get("ID") or item.get("Id") or item.get("id")
            value = item.get("Value") or item.get("value")
            if field_id:
                flat[_field_key(field_id)] = value
                flat[str(field_id)] = value
            name = item.get("Name") or item.get("name")
            if name and value is not None:
                flat[str(name)] = value
            title = item.get("Title") or item.get("title")
            if title and value is not None:
                t = str(title).strip()
                flat[t] = value
                flat[normalize_wufoo_title(t)] = value

    return flat


def _apply_label_mappings(flat: dict[str, Any], row: dict[str, Any]) -> None:
    """Fill qualifier columns from Wufoo field titles when FieldN ids are stale."""
    title_map = dict(FORM_LABEL_TO_COLUMN)
    title_map.update(_load_title_map())

    for key, value in flat.items():
        if value is None or not str(value).strip():
            continue
        col = column_for_wufoo_title(str(key)) or title_map.get(str(key).strip())
        if col and not str(row.get(col, "")).strip():
            row[col] = value


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

    _apply_label_mappings(flat, row)

    return row


def wufoo_entry_to_lead_row(entry: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible alias."""
    return wufoo_payload_to_lead_row(entry)
