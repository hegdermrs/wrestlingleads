"""Sync routed leads to HubSpot CRM (create or update contact by email / Record ID)."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pandas as pd

from ..features import _safe_str

BASE_DIR = Path(__file__).resolve().parents[3]
HUBSPOT_MAP_PATH = BASE_DIR / "config" / "hubspot_field_map.json"
HUBSPOT_API = "https://api.hubapi.com/crm/v3/objects/contacts"


def hubspot_configured() -> bool:
    return bool(os.getenv("HUBSPOT_ACCESS_TOKEN", "").strip())


def load_hubspot_map() -> dict[str, str]:
    data = json.loads(HUBSPOT_MAP_PATH.read_text(encoding="utf-8"))
    return dict(data.get("source_to_hubspot_field_map", {}))


def lead_row_to_hubspot_properties(row: pd.Series | dict[str, Any]) -> dict[str, str]:
    """Map a scored lead row to HubSpot contact properties (string values)."""
    field_map = load_hubspot_map()
    properties: dict[str, str] = {}

    if isinstance(row, pd.Series):
        row = row.to_dict()

    for source_col, hubspot_prop in field_map.items():
        value = row.get(source_col)
        if value is None or (isinstance(value, float) and pd.isna(value)):
            continue
        text = str(value).strip()
        if text:
            properties[hubspot_prop] = text

    return properties


def _assignment_properties(
    rep: dict[str, Any],
    assignment: dict[str, Any],
) -> dict[str, str]:
    props: dict[str, str] = {
        "lw_assigned_rep": _safe_str(rep.get("name")),
        "lw_route_reason": _safe_str(assignment.get("route_reason")),
        "lw_assigned_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    owner_id = _safe_str(rep.get("hubspot_owner_id"))
    if owner_id:
        props["hubspot_owner_id"] = owner_id
    return {k: v for k, v in props.items() if v}


def build_route_sync_properties(
    row: pd.Series | dict[str, Any],
    rep: dict[str, Any],
    assignment: dict[str, Any],
) -> dict[str, str]:
    props = lead_row_to_hubspot_properties(row)
    props.update(_assignment_properties(rep, assignment))
    email = props.get("email") or _lead_email(row)
    if email:
        props["email"] = email
    return props


def _lead_email(row: pd.Series | dict[str, Any]) -> str:
    get = row.get if isinstance(row, dict) else row.get
    return _safe_str(get("Email", ""))


def _hubspot_record_id(row: pd.Series | dict[str, Any]) -> str:
    get = row.get if isinstance(row, dict) else row.get
    raw = _safe_str(get("Record ID", ""))
    return raw if raw.isdigit() else ""


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _api_error(response: httpx.Response) -> str:
    try:
        body = response.json()
        message = body.get("message") or body.get("detail")
        if message:
            return str(message)
    except Exception:
        pass
    return response.text[:300] or f"HTTP {response.status_code}"


def _patch_contact(
    client: httpx.Client,
    *,
    token: str,
    contact_id: str,
    properties: dict[str, str],
) -> dict[str, Any]:
    response = client.patch(
        f"{HUBSPOT_API}/{contact_id}",
        headers=_headers(token),
        json={"properties": properties},
    )
    if response.status_code == 404:
        raise LookupError(contact_id)
    if response.status_code >= 400:
        raise RuntimeError(_api_error(response))
    return {"action": "updated", "id": contact_id}


def _search_contact_by_email(
    client: httpx.Client,
    *,
    token: str,
    email: str,
) -> str | None:
    response = client.post(
        f"{HUBSPOT_API}/search",
        headers=_headers(token),
        json={
            "filterGroups": [
                {
                    "filters": [
                        {"propertyName": "email", "operator": "EQ", "value": email}
                    ]
                }
            ],
            "limit": 1,
        },
    )
    if response.status_code >= 400:
        raise RuntimeError(_api_error(response))
    results = response.json().get("results", [])
    if not results:
        return None
    return str(results[0]["id"])


def create_or_update_contact(properties: dict[str, str]) -> dict[str, Any]:
    """
    Create or update a HubSpot contact.
    Uses Record ID when present, otherwise email search, otherwise create.
    """
    token = os.getenv("HUBSPOT_ACCESS_TOKEN", "").strip()
    if not token:
        raise RuntimeError("HUBSPOT_ACCESS_TOKEN is not configured.")

    email = _safe_str(properties.get("email"))
    record_id = _safe_str(properties.get("_record_id", ""))
    if record_id:
        del properties["_record_id"]

    if not email and not record_id:
        raise RuntimeError("Lead must have an email (or HubSpot Record ID) to sync to HubSpot.")

    with httpx.Client(timeout=30.0) as client:
        if record_id:
            try:
                return _patch_contact(
                    client, token=token, contact_id=record_id, properties=properties
                )
            except LookupError:
                pass

        if email:
            existing_id = _search_contact_by_email(client, token=token, email=email)
            if existing_id:
                return _patch_contact(
                    client, token=token, contact_id=existing_id, properties=properties
                )

        if not email:
            raise RuntimeError(
                "HubSpot contact not found for Record ID and no email to create a new contact."
            )

        response = client.post(
            HUBSPOT_API,
            headers=_headers(token),
            json={"properties": properties},
        )
        if response.status_code >= 400:
            raise RuntimeError(_api_error(response))
        body = response.json()
        return {"action": "created", "id": str(body.get("id", ""))}


def sync_contact_on_route(
    row: pd.Series | dict[str, Any],
    rep: dict[str, Any],
    assignment: dict[str, Any],
) -> dict[str, Any]:
    """Upsert HubSpot contact when a lead is assigned."""
    properties = build_route_sync_properties(row, rep, assignment)
    record_id = _hubspot_record_id(row)
    if record_id:
        properties["_record_id"] = record_id
    return create_or_update_contact(properties)


def verify_hubspot_connection() -> dict[str, Any]:
    if not hubspot_configured():
        return {
            "ok": False,
            "error": "HUBSPOT_ACCESS_TOKEN is not set on the server.",
            "transport": "hubspot",
        }

    token = os.getenv("HUBSPOT_ACCESS_TOKEN", "").strip()
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(
                "https://api.hubapi.com/crm/v3/owners",
                headers=_headers(token),
                params={"limit": 1},
            )
        if response.status_code >= 400:
            return {"ok": False, "error": _api_error(response), "transport": "hubspot"}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "transport": "hubspot"}

    return {
        "ok": True,
        "transport": "hubspot",
        "note": "Token can read HubSpot owners. Contacts sync on each route when enabled in Team rules.",
    }
