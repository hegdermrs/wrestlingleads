"""Push scored leads to HubSpot CRM."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[3]
HUBSPOT_MAP_PATH = BASE_DIR / "config" / "hubspot_field_map.json"


def load_hubspot_map() -> dict[str, str]:
    data = json.loads(HUBSPOT_MAP_PATH.read_text(encoding="utf-8"))
    return dict(data.get("source_to_hubspot_field_map", {}))


def lead_row_to_hubspot_properties(row: pd.Series | dict[str, Any]) -> dict[str, Any]:
    """Map a scored lead row to HubSpot contact properties."""
    field_map = load_hubspot_map()
    properties: dict[str, Any] = {}

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


async def create_or_update_contact(properties: dict[str, Any]) -> dict[str, Any]:
    """
    Create or update a HubSpot contact.
    Requires HUBSPOT_ACCESS_TOKEN env var when wired up.
    """
    token = os.getenv("HUBSPOT_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("HUBSPOT_ACCESS_TOKEN is not configured.")

    import httpx

    email = properties.get("email")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30) as client:
        if email:
            search = await client.post(
                "https://api.hubapi.com/crm/v3/objects/contacts/search",
                headers=headers,
                json={
                    "filterGroups": [
                        {
                            "filters": [
                                {"propertyName": "email", "operator": "EQ", "value": email}
                            ]
                        }
                    ]
                },
            )
            search.raise_for_status()
            results = search.json().get("results", [])
            if results:
                contact_id = results[0]["id"]
                response = await client.patch(
                    f"https://api.hubapi.com/crm/v3/objects/contacts/{contact_id}",
                    headers=headers,
                    json={"properties": properties},
                )
                response.raise_for_status()
                return {"action": "updated", "id": contact_id}

        response = await client.post(
            "https://api.hubapi.com/crm/v3/objects/contacts",
            headers=headers,
            json={"properties": properties},
        )
        response.raise_for_status()
        body = response.json()
        return {"action": "created", "id": body.get("id")}
