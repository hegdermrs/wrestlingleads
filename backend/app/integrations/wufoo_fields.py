"""Fetch and cache Wufoo form field IDs (FieldN) mapped to qualifier columns."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from ..config import DATA_DIR
from ..lead_form_fields import column_for_wufoo_title, normalize_wufoo_title

logger = logging.getLogger(__name__)

CACHE_PATH = DATA_DIR / "wufoo_field_cache.json"

# Hidden UTM inputs — match by substring in Wufoo field title when ID is unknown.
UTM_TITLE_HINTS: tuple[tuple[str, str], ...] = (
    ("utm source", "UTM Source"),
    ("utm medium", "UTM Medium"),
    ("utm campaign", "UTM Campaign"),
    ("utm term", "UTM Term"),
    ("utm content", "UTM Content"),
    ("utm keyword", "UTM Keyword"),
)


def wufoo_api_configured() -> bool:
    return bool(os.getenv("WUFOO_API_KEY", "").strip() and os.getenv("WUFOO_SUBDOMAIN", "").strip())


def _field_id_key(field_id: object) -> str:
    raw = str(field_id).strip()
    if raw.lower().startswith("field"):
        return raw if raw.startswith("Field") else f"Field{raw[5:]}"
    if raw.isdigit():
        return f"Field{raw}"
    return raw


def _column_for_title(title: str) -> str | None:
    col = column_for_wufoo_title(title)
    if col:
        return col
    lower = normalize_wufoo_title(title).lower()
    for hint, column in UTM_TITLE_HINTS:
        if hint in lower:
            return column
    return None


def build_field_map_from_api_fields(fields: list[dict[str, Any]]) -> dict[str, str]:
    """FieldN → qualifier column from Wufoo /fields.json entries."""
    out: dict[str, str] = {}
    for field in fields:
        fid = _field_id_key(field.get("ID") or field.get("Id") or "")
        if not fid.startswith("Field"):
            continue
        title = str(field.get("Title") or field.get("title") or "").strip()
        col = _column_for_title(title) if title else None
        if col:
            out[fid] = col
    return out


def fetch_form_fields_from_api(
    *,
    subdomain: str | None = None,
    api_key: str | None = None,
    form_identifier: str | None = None,
) -> list[dict[str, Any]]:
    sub = (subdomain or os.getenv("WUFOO_SUBDOMAIN", "")).strip()
    key = (api_key or os.getenv("WUFOO_API_KEY", "")).strip()
    form = (form_identifier or os.getenv("WUFOO_FORM", "")).strip()
    if not sub or not key or not form:
        raise ValueError("WUFOO_SUBDOMAIN, WUFOO_API_KEY, and WUFOO_FORM are required.")

    url = f"https://{sub}.wufoo.com/api/v3/forms/{form}/fields.json"
    with httpx.Client(timeout=30) as client:
        response = client.get(url, auth=(key, "footoken"))
        response.raise_for_status()
        data = response.json()

    fields = data.get("Fields") or data.get("fields") or []
    if not isinstance(fields, list):
        raise ValueError("Unexpected Wufoo fields API response.")
    return fields


def sync_wufoo_field_cache(
    *,
    subdomain: str | None = None,
    api_key: str | None = None,
    form_identifier: str | None = None,
) -> dict[str, str]:
    """Pull form fields from Wufoo API and persist FieldN → column map."""
    fields = fetch_form_fields_from_api(
        subdomain=subdomain,
        api_key=api_key,
        form_identifier=form_identifier,
    )
    field_map = build_field_map_from_api_fields(fields)
    titles = {
        _field_id_key(f.get("ID")): str(f.get("Title") or "")
        for f in fields
        if f.get("ID") is not None
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(
            {
                "synced_at": datetime.now(UTC).isoformat(),
                "field_map": field_map,
                "titles": titles,
                "field_count": len(fields),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info("Wufoo field cache synced: %s mapped fields", len(field_map))
    return field_map


def load_cached_field_map() -> dict[str, str]:
    if not CACHE_PATH.exists():
        return {}
    try:
        data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        return dict(data.get("field_map", {}))
    except (json.JSONDecodeError, OSError):
        return {}


def merged_wufoo_field_map(static_map: dict[str, str]) -> dict[str, str]:
    """Static config overrides API cache for explicit entries."""
    merged = dict(load_cached_field_map())
    merged.update(static_map)
    return merged


def ensure_wufoo_field_cache() -> None:
    """Refresh cache on startup when API credentials are configured."""
    if not wufoo_api_configured():
        return
    try:
        sync_wufoo_field_cache()
    except Exception:
        logger.exception("Wufoo field cache sync failed (webhooks still use static map).")
