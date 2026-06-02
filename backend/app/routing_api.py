"""Sales routing API — rules, assignment, and email delivery."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .routing import assign_rep, route_and_notify, should_route_lead
from .routing_config import load_routing_config, save_routing_config
from .routing_log import recent_entries, weekly_stats
from .routing_notify import smtp_configured
from .store import store

router = APIRouter(prefix="/routing", tags=["routing"])


class RoutingRulesUpdate(BaseModel):
    auto_route_enabled: bool = True
    send_email_on_route: bool = True
    urgent_min_score: float = 80
    jake_min_warm_score: float = 70
    west_coast_states: list[str] = Field(default_factory=list)
    reps: list[dict[str, Any]]


class RouteRequest(BaseModel):
    email: str
    force: bool = False
    send_email: bool | None = None


def _row_by_email(email: str):
    if not store.loaded:
        raise HTTPException(status_code=404, detail="No leads loaded.")
    idx = store.find_lead_index(email=email)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Lead not found: {email}")
    return store.get_row_at(idx)


@router.get("/rules")
def get_routing_rules() -> dict[str, Any]:
    config = load_routing_config()
    return {
        **config,
        "smtp_configured": smtp_configured(),
    }


@router.put("/rules")
def update_routing_rules(body: RoutingRulesUpdate) -> dict[str, Any]:
    try:
        saved = save_routing_config(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {**saved, "smtp_configured": smtp_configured()}


@router.get("/stats")
def routing_stats() -> dict[str, Any]:
    config = load_routing_config()
    return {
        "weekly": weekly_stats(),
        "recent": recent_entries(15),
        "smtp_configured": smtp_configured(),
        "auto_route_enabled": config.get("auto_route_enabled", False),
    }


@router.post("/preview")
def preview_route(body: RouteRequest) -> dict[str, Any]:
    row = _row_by_email(body.email)
    config = load_routing_config()
    ok, skip = should_route_lead(row)
    if not ok:
        return {"assigned": False, "skipped_reason": skip}
    return assign_rep(row, config)


@router.post("/send")
def send_route(body: RouteRequest) -> dict[str, Any]:
    row = _row_by_email(body.email)
    config = load_routing_config()
    if body.send_email is not None:
        config = {**config, "send_email_on_route": body.send_email}

    if not body.force:
        ok, skip = should_route_lead(row)
        if not ok:
            return {"assigned": False, "skipped_reason": skip}

    result = route_and_notify(row, config, ignore_prior=body.force)
    if result.get("assigned"):
        store.apply_routing_result(body.email, result)
    return result


@router.post("/send-unrouted")
def send_unrouted(limit: int = 25) -> dict[str, Any]:
    """Route up to N scored leads that have not been routed yet."""
    if not store.loaded:
        raise HTTPException(status_code=404, detail="No leads loaded.")
    config = load_routing_config()
    if not config.get("auto_route_enabled", True):
        raise HTTPException(status_code=400, detail="Auto-route is disabled in rules.")

    results: list[dict[str, Any]] = []
    for row in store.iter_unrouted_leads(limit=limit):
        email = str(row.get("Email", ""))
        outcome = route_and_notify(row, config)
        if outcome.get("assigned"):
            store.apply_routing_result(email, outcome)
        results.append({"email": email, **outcome})

    return {"processed": len(results), "results": results}
