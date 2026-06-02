"""Wufoo webhook handlers for live lead scoring."""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from .integrations.wufoo import wufoo_payload_to_lead_row
from .store import is_synthetic_test_lead, store

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


def _verify_wufoo_secret(request: Request, payload: dict[str, Any] | None = None) -> None:
    secret = os.getenv("WUFOO_WEBHOOK_SECRET")
    if not secret:
        return

    provided = (
        request.headers.get("X-Wufoo-Webhook-Secret")
        or request.headers.get("Authorization")
        or request.query_params.get("secret")
    )
    if payload:
        provided = provided or payload.get("HandshakeKey") or payload.get("handshakeKey")

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


async def _score_wufoo_lead(row: dict[str, Any], use_llm: bool) -> None:
    """Score in background — Wufoo expects a 2xx response within a few seconds."""
    try:
        result = await store.append_lead(row, use_llm=use_llm)
        logger.info(
            "Wufoo lead scored email=%s tier=%s routed=%s",
            result.get("email"),
            result.get("ai_tier"),
            (result.get("routing") or {}).get("assigned"),
        )
    except Exception:
        logger.exception("Wufoo background scoring failed for email=%s", row.get("Email"))


@router.get("/wufoo/status")
def wufoo_webhook_status() -> dict[str, Any]:
    """Diagnostics for Wufoo integration (does not expose secrets)."""
    from .integrations.wufoo import WOOFOO_MAP_PATH, load_wufoo_map

    field_map = load_wufoo_map()
    secret = os.getenv("WUFOO_WEBHOOK_SECRET")
    return {
        "webhook_path": "/webhooks/wufoo",
        "secret_configured": bool(secret),
        "field_map_loaded": bool(field_map),
        "field_map_path": str(WOOFOO_MAP_PATH),
        "mapped_field_count": len(field_map),
        "cache_loaded": store.loaded,
        "cache_row_count": int(store._meta.get("row_count", 0)) if store.loaded else 0,
        "last_scored_at": store._meta.get("last_append") or store._meta.get("scored_at") if store.loaded else None,
    }


@router.post("/wufoo")
async def wufoo_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    use_llm: bool = True,
) -> dict[str, Any]:
    """
    Receive a Wufoo form submission, score it, and append to dashboard cache.

    Configure in Wufoo: Form → More → Integrations → WebHook (paid plans only)
    URL: https://your-api/webhooks/wufoo
    Handshake Key: match WUFOO_WEBHOOK_SECRET in Railway/.env
    """
    try:
        payload = await _parse_wufoo_body(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid webhook payload: {exc}") from exc

    _verify_wufoo_secret(request, payload)

    row = wufoo_payload_to_lead_row(payload)
    if is_synthetic_test_lead(row):
        raise HTTPException(status_code=400, detail="Synthetic test submissions are not stored.")

    if not row.get("Email") and not row.get("Message"):
        from .integrations.wufoo import WOOFOO_MAP_PATH, load_wufoo_map

        if not load_wufoo_map():
            raise HTTPException(
                status_code=500,
                detail=f"Wufoo field map missing on server ({WOOFOO_MAP_PATH}). Redeploy latest Docker image.",
            )
        raise HTTPException(
            status_code=400,
            detail="Webhook missing mappable lead fields. Check wufoo_field_map.json.",
        )

    entry_id = payload.get("EntryId") or payload.get("EntryID") or row.get("Record ID")
    logger.info("Wufoo webhook accepted entry=%s email=%s", entry_id, row.get("Email"))

    # Reply immediately — Wufoo times out if DeepSeek scoring blocks the HTTP response.
    background_tasks.add_task(_score_wufoo_lead, row, use_llm)

    return {
        "success": True,
        "status": "accepted",
        "entry_id": entry_id,
        "email": row.get("Email"),
        "message": "Lead queued for scoring — check dashboard in ~30 seconds",
    }
