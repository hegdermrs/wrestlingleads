"""Map Wufoo webhook payloads to qualifier column names."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..features import _safe_str
from ..lead_form_fields import FORM_LABEL_TO_COLUMN, column_for_wufoo_title, normalize_wufoo_title
from .wufoo_fields import merged_wufoo_field_map

BASE_DIR = Path(__file__).resolve().parents[3]
WOOFOO_MAP_PATH = BASE_DIR / "config" / "wufoo_field_map.json"


def load_wufoo_map(form_config: dict[str, Any] | None = None) -> dict[str, str]:
    if form_config and form_config.get("field_map"):
        return dict(form_config["field_map"])
    if not WOOFOO_MAP_PATH.exists():
        return {}
    data = json.loads(WOOFOO_MAP_PATH.read_text(encoding="utf-8"))
    return dict(data.get("wufoo_to_qualifier_map", {}))


def _load_title_map(form_config: dict[str, Any] | None = None) -> dict[str, str]:
    if form_config and form_config.get("title_map"):
        return dict(form_config["title_map"])
    if not WOOFOO_MAP_PATH.exists():
        return {}
    data = json.loads(WOOFOO_MAP_PATH.read_text(encoding="utf-8"))
    return dict(data.get("wufoo_title_to_qualifier_map", {}))


def _field_key(field_id: object) -> str:
    """Normalize Wufoo field IDs to FieldN keys used in webhooks."""
    raw = str(field_id).strip()
    if not raw:
        return ""
    lower = raw.lower()
    if lower.startswith("field"):
        suffix = raw[5:] if raw.startswith("Field") else raw[5:]
        digits = "".join(c for c in suffix if c.isdigit())
        if digits:
            return f"Field{digits}"
    if raw.isdigit():
        return f"Field{raw}"
    return raw


def _normalize_fields_dict(raw: dict[str, Any]) -> dict[str, Any]:
    """Flatten Wufoo Fields array format to FieldN keys and field titles."""
    flat: dict[str, Any] = dict(raw)
    for key, value in raw.items():
        if value is None:
            continue
        fid = _field_key(key)
        if fid.startswith("Field"):
            flat[fid] = value

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


def _apply_label_mappings(
    flat: dict[str, Any], row: dict[str, Any], form_config: dict[str, Any] | None = None
) -> None:
    """Fill qualifier columns from Wufoo field titles when FieldN ids are stale."""
    title_map = dict(FORM_LABEL_TO_COLUMN)
    title_map.update(_load_title_map(form_config))

    for key, value in flat.items():
        if value is None or not str(value).strip():
            continue
        col = column_for_wufoo_title(str(key)) or title_map.get(str(key).strip())
        if not col:
            continue
        current = str(row.get(col, "")).strip()
        if not current or (col == "Source" and current.lower() == "wufoo"):
            row[col] = value


def _apply_field_map(flat: dict[str, Any], row: dict[str, Any], field_map: dict[str, str]) -> None:
    for wufoo_key, qualifier_col in field_map.items():
        if wufoo_key.startswith("_") or not qualifier_col:
            continue
        value = flat.get(wufoo_key)
        if value is None or not str(value).strip():
            continue
        current = str(row.get(qualifier_col, "")).strip()
        if not current or (qualifier_col == "Source" and current.lower() == "wufoo"):
            row[qualifier_col] = value


def _apply_utm_flat_keys(flat: dict[str, Any], row: dict[str, Any]) -> None:
    """Map utm_source-style POST keys (URL prefill) to UTM columns."""
    aliases = {
        "utmsource": "UTM Source",
        "utmmedium": "UTM Medium",
        "utmcampaign": "UTM Campaign",
        "utmterm": "UTM Term",
        "utmcontent": "UTM Content",
    }
    for key, value in flat.items():
        if value is None or not str(value).strip():
            continue
        norm = str(key).lower().replace(" ", "").replace("_", "")
        col = aliases.get(norm)
        if col and not str(row.get(col, "")).strip():
            row[col] = value


def wufoo_payload_to_lead_row(
    payload: dict[str, Any],
    *,
    form_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Convert Wufoo webhook/API payload to a qualifier lead row."""
    static_map = load_wufoo_map(form_config)
    field_map = merged_wufoo_field_map(static_map)
    flat = _normalize_fields_dict(payload)
    row: dict[str, Any] = {
        "Source": "Wufoo",
        "Lifecycle Stage": "Lead",
    }

    if form_config:
        row["Wufoo Form Id"] = _safe_str(form_config.get("id"))
        row["Wufoo Form Label"] = _safe_str(form_config.get("label"))

    entry_id = flat.get("EntryId") or flat.get("EntryID") or flat.get("entryId")
    if entry_id:
        row["Record ID"] = str(entry_id)

    _apply_field_map(flat, row, field_map)
    _apply_utm_flat_keys(flat, row)
    _apply_label_mappings(flat, row, form_config)

    return row


def wufoo_entry_to_lead_row(entry: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible alias."""
    return wufoo_payload_to_lead_row(entry)
