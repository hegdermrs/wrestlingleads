"""Wufoo webhook handlers for live lead scoring."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from .integrations.wufoo import wufoo_payload_to_lead_row
from .store import store

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify_wufoo_secret(request: Request) -> None:
    secret = os.getenv("WUFOO_WEBHOOK_SECRET")
    if not secret:
        return

    provided = (
        request.headers.get("X-Wufoo-Webhook-Secret")
        or request.headers.get("Authorization")
        or request.query_params.get("secret")
    )
    if provided != secret:
        raise HTTPException(status_code=401, detail="Invalid Wufoo webhook secret.")


async def _parse_wufoo_body(request: Request) -> dict[str, Any]:
    content_type = (request.headers.get("content-type") or "").lower()

    if "application/json" in content_type:
        body = await request.json()
        return body if isinstance(body, dict) else {"Fields": body}

    # Wufoo default: application/x-www-form-urlencoded
    form = await request.form()
    return {key: form.get(key) for key in form.keys()}


@router.post("/wufoo")
async def wufoo_webhook(request: Request, use_llm: bool = True) -> dict[str, Any]:
    """
    Receive a Wufoo form submission, score it, and append to dashboard cache.

    Configure in Wufoo: Form → Notifications → Webhooks
    URL: https://your-api/webhooks/wufoo
    Optional header: X-Wufoo-Webhook-Secret (match WUFOO_WEBHOOK_SECRET in .env)
    """
    _verify_wufoo_secret(request)

    try:
        payload = await _parse_wufoo_body(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid webhook payload: {exc}") from exc

    row = wufoo_payload_to_lead_row(payload)
    if not row.get("Email") and not row.get("Message"):
        raise HTTPException(status_code=400, detail="Webhook missing mappable lead fields. Check wufoo_field_map.json.")

    result = await store.append_lead(row, use_llm=use_llm)

    return {
        "success": True,
        "action": result["action"],
        "lead_id": result.get("email") or row.get("Record ID"),
        "ai_tier": result["ai_tier"],
        "ai_score": result["ai_score"],
        "on_dashboard": result["on_dashboard"],
    }
