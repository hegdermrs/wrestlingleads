"""Assign scored leads to sales reps and notify by email."""

from __future__ import annotations

from typing import Any, Literal

import numpy as np
import pandas as pd

from .features import URGENT_DEADLINE_KEYWORDS, _safe_str, has_coaching_signals, is_sparse_subscriber
from .routing_config import load_routing_config, reps_for_bucket
from .scoring_config import get_tier_thresholds
from .routing_log import append_routing_entry, count_rep_this_week, was_lead_routed
from .routing_notify import send_lead_assignment_email, email_configured
from .integrations.hubspot import hubspot_configured, sync_contact_on_route
from .n8n_notify import n8n_configured, send_n8n_assignment_notification

WEST_COAST_NAME_HINTS = (
    "california",
    "oregon",
    "washington",
    "nevada",
    "arizona",
    "hawaii",
    "alaska",
)


def _score(row: pd.Series | dict[str, Any]) -> float:
    get = row.get if isinstance(row, dict) else row.get
    try:
        return float(get("AI Score", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _tier(row: pd.Series | dict[str, Any]) -> str:
    get = row.get if isinstance(row, dict) else row.get
    return _safe_str(get("AI Tier", ""))


def _is_ready_now(row: pd.Series | dict[str, Any]) -> bool:
    get = row.get if isinstance(row, dict) else row.get
    rel = _safe_str(get("Relationship Status", "")).lower()
    if "ready to start" in rel:
        return True
    deadline = _safe_str(get("Deadline for Goal", "")).lower()
    return any(k in deadline for k in URGENT_DEADLINE_KEYWORDS)


def _normalize_state(value: object) -> str:
    text = _safe_str(value).upper()
    if not text:
        return ""
    if len(text) == 2 and text.isalpha():
        return text
    for token in text.replace(",", " ").split():
        if len(token) == 2 and token.isalpha():
            return token.upper()
    return text[:2] if len(text) >= 2 else text


def is_west_coast(row: pd.Series | dict[str, Any], config: dict[str, Any]) -> bool:
    get = row.get if isinstance(row, dict) else row.get
    state = _normalize_state(get("State/Region", ""))
    west = {s.upper() for s in config.get("west_coast_states", [])}
    if state in west:
        return True
    region = _safe_str(get("State/Region", "")).lower()
    return any(hint in region for hint in WEST_COAST_NAME_HINTS)


def is_urgent_red_hot(row: pd.Series | dict[str, Any], config: dict[str, Any]) -> bool:
    """Gene bucket: Priority (Hot) tier, at/above urgent floor, and ready soon."""
    tier = _tier(row)
    score = _score(row)
    if tier != "Hot":
        return False
    hot_floor = float(get_tier_thresholds()["Hot"])
    min_score = float(config.get("urgent_min_score", hot_floor))
    return score >= min_score and _is_ready_now(row)


def is_jake_tier(row: pd.Series | dict[str, Any], config: dict[str, Any]) -> bool:
    tier = _tier(row)
    score = _score(row)
    if tier == "Hot":
        return True
    min_warm = float(config.get("jake_min_warm_score", 70))
    return tier == "Warm" and score >= min_warm


def should_route_lead(row: pd.Series | dict[str, Any]) -> tuple[bool, str]:
    if is_sparse_subscriber(row):
        return False, "Sparse subscriber — no coaching outreach"
    if not has_coaching_signals(row):
        return False, "No coaching form data"
    lifecycle = _safe_str(row.get("Lifecycle Stage", "") if isinstance(row, dict) else row.get("Lifecycle Stage", ""))
    if lifecycle == "Customer":
        return False, "Already a customer"
    tier = _tier(row)
    if tier == "Unqualified":
        return False, "Unqualified tier"
    return True, ""


def _rep_under_cap(rep: dict[str, Any]) -> bool:
    cap = rep.get("weekly_cap")
    if cap is None:
        return True
    try:
        cap_n = int(cap)
    except (TypeError, ValueError):
        return True
    return count_rep_this_week(_safe_str(rep.get("id"))) < cap_n


def _distribution_pcts(config: dict[str, Any]) -> tuple[float, float, float, float]:
    """Gene top %, Jake next %, general next %, automation bottom % (must sum ~100)."""
    gene = float(config.get("distribution_gene_pct", 10))
    jake = float(config.get("distribution_jake_pct", 20))
    general = float(config.get("distribution_general_pct", 50))
    automation = float(config.get("distribution_automation_pct", 20))
    total = gene + jake + general + automation
    if total <= 0:
        return 10.0, 20.0, 50.0, 20.0
    scale = 100.0 / total
    return gene * scale, jake * scale, general * scale, automation * scale


def _routable_scores_from_store() -> list[float]:
    from .store import store

    if not store.loaded:
        return []
    scores: list[float] = []
    try:
        row_count = len(store._df)  # type: ignore[arg-type]
    except Exception:
        return []
    for i in range(row_count):
        row = store.get_row_at(i)
        ok, _ = should_route_lead(row)
        if ok:
            scores.append(_score(row))
    return scores


def _percentile_band(score: float, config: dict[str, Any]) -> Literal["gene", "jake", "general", "automation"]:
    scores = _routable_scores_from_store()
    min_leads = int(config.get("min_leads_for_percentile", 15))
    if len(scores) < min_leads:
        return "general"

    gene_pct, jake_pct, general_pct, automation_pct = _distribution_pcts(config)
    # Cumulative cutoffs from the bottom (automation = lowest scores).
    p_auto = float(np.percentile(scores, automation_pct))
    p_general = float(np.percentile(scores, automation_pct + general_pct))
    p_jake = float(np.percentile(scores, automation_pct + general_pct + jake_pct))

    if score < p_auto:
        return "automation"
    if score < p_general:
        return "general"
    if score < p_jake:
        return "jake"
    return "gene"


def _first_rep_with_cap(
    reps: list[dict[str, Any]],
) -> dict[str, Any] | None:
    for rep in reps:
        if _rep_under_cap(rep):
            return rep
    return None


def _pick_general_rep(row: pd.Series | dict[str, Any], config: dict[str, Any]) -> tuple[dict[str, Any], str]:
    general = reps_for_bucket(config, "general")
    if not general:
        raise ValueError("No general-pool reps configured.")

    west = is_west_coast(row, config)
    eric = next((r for r in general if r.get("west_coast_priority")), None)
    beau = next((r for r in general if not r.get("west_coast_priority")), None)

    if west and eric:
        return eric, "West Coast lead — Eric has priority"

    candidates = [r for r in general if r]
    if len(candidates) == 1:
        return candidates[0], "General pool assignment"

    counts = {r["id"]: count_rep_this_week(_safe_str(r.get("id"))) for r in candidates}
    chosen = min(candidates, key=lambda r: counts.get(r["id"], 0))
    if west and eric and chosen.get("id") != eric.get("id"):
        return eric, "West Coast lead — Eric has priority"
    return chosen, "General pool — balanced weekly volume"


def _assign_rep_percentile(
    row: pd.Series | dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """Route by score rank vs other routable leads in the inbox (10/20/50/20 style split)."""
    score = _score(row)
    band = _percentile_band(score, config)
    gene_pct, jake_pct, general_pct, automation_pct = _distribution_pcts(config)

    bucket_key = {
        "gene": "urgent",
        "jake": "hot_warm",
        "general": "general",
        "automation": "automation",
    }

    fallthrough: list[tuple[str, str, str]] = []
    if band == "gene":
        fallthrough = [
            ("gene", "urgent", f"Top {gene_pct:.0f}% of scored leads"),
            ("jake", "hot_warm", f"Top {gene_pct:.0f}% band — Gene at weekly cap, sent to Jake"),
            ("general", "general", "Top band — Gene and Jake at cap"),
        ]
    elif band == "jake":
        fallthrough = [
            ("jake", "hot_warm", f"Next {jake_pct:.0f}% of scored leads (after top {gene_pct:.0f}%)"),
            ("general", "general", "Jake at weekly cap — general pool"),
        ]
    elif band == "general":
        fallthrough = [
            ("general", "general", f"Middle {general_pct:.0f}% of scored leads"),
        ]
    else:
        fallthrough = [
            ("automation", "automation", f"Bottom {automation_pct:.0f}% — automation / nurture"),
        ]

    for rep_key, route_bucket, reason in fallthrough:
        if rep_key == "general":
            rep, reason = _pick_general_rep(row, config)
            return {
                "assigned": True,
                "rep": rep,
                "route_bucket": route_bucket,
                "route_reason": reason,
                "distribution_band": band,
            }
        reps = reps_for_bucket(config, bucket_key[rep_key])
        rep = _first_rep_with_cap(reps)
        if rep:
            return {
                "assigned": True,
                "rep": rep,
                "route_bucket": route_bucket,
                "route_reason": reason,
                "distribution_band": band,
            }

    if band != "automation":
        rep, reason = _pick_general_rep(row, config)
        return {
            "assigned": True,
            "rep": rep,
            "route_bucket": "general",
            "route_reason": reason,
            "distribution_band": band,
        }

    auto_reps = reps_for_bucket(config, "automation")
    if auto_reps:
        return {
            "assigned": True,
            "rep": auto_reps[0],
            "route_bucket": "automation",
            "route_reason": fallthrough[0][2],
            "distribution_band": band,
        }

    return {
        "assigned": False,
        "skipped_reason": "Automation queue not configured (add a rep with bucket automation)",
        "distribution_band": band,
    }


def _assign_rep_hybrid(
    row: pd.Series | dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """Urgent red-hot → Gene first; everyone else by inbox score percentiles."""
    if is_urgent_red_hot(row, config):
        for rep in reps_for_bucket(config, "urgent"):
            if _rep_under_cap(rep):
                return {
                    "assigned": True,
                    "rep": rep,
                    "route_bucket": "urgent",
                    "route_reason": "Urgent red-hot — Priority tier, ready soon, meets urgent score",
                    "distribution_band": "urgent",
                }
    return _assign_rep_percentile(row, config)


def _assign_rep_tier(
    row: pd.Series | dict[str, Any],
    config: dict[str, Any],
    *,
    ignore_prior: bool = False,
) -> dict[str, Any]:
    if is_urgent_red_hot(row, config):
        for rep in reps_for_bucket(config, "urgent"):
            if _rep_under_cap(rep):
                return {
                    "assigned": True,
                    "rep": rep,
                    "route_bucket": "urgent",
                    "route_reason": "Urgent lead — ready to start soon",
                }
        # Fall through if Gene at cap

    if is_jake_tier(row, config):
        for rep in reps_for_bucket(config, "hot_warm"):
            if _rep_under_cap(rep):
                reason = "Hot lead" if _tier(row) == "Hot" else "Very warm lead"
                return {
                    "assigned": True,
                    "rep": rep,
                    "route_bucket": "hot_warm",
                    "route_reason": reason,
                }

    rep, reason = _pick_general_rep(row, config)
    return {
        "assigned": True,
        "rep": rep,
        "route_bucket": "general",
        "route_reason": reason,
    }


def assign_rep(
    row: pd.Series | dict[str, Any],
    config: dict[str, Any] | None = None,
    *,
    ignore_prior: bool = False,
) -> dict[str, Any]:
    """Pick rep and bucket for a lead without sending email."""
    config = config or load_routing_config()
    ok, skip = should_route_lead(row)
    if not ok:
        return {"assigned": False, "skipped_reason": skip}

    get = row.get if isinstance(row, dict) else row.get
    email = _safe_str(get("Email", ""))
    if email and not ignore_prior and was_lead_routed(email):
        return {"assigned": False, "skipped_reason": "Lead already routed this cycle"}

    mode = _safe_str(config.get("routing_mode", "hybrid")).lower()
    if mode == "hybrid":
        return _assign_rep_hybrid(row, config)
    if mode == "percentile":
        return _assign_rep_percentile(row, config)
    return _assign_rep_tier(row, config, ignore_prior=ignore_prior)


def route_and_notify(
    row: pd.Series | dict[str, Any],
    config: dict[str, Any] | None = None,
    *,
    ignore_prior: bool = False,
) -> dict[str, Any]:
    """Assign rep, log, optionally email, return routing result."""
    config = config or load_routing_config()
    assignment = assign_rep(row, config, ignore_prior=ignore_prior)
    if not assignment.get("assigned"):
        return assignment

    rep = assignment["rep"]
    get = row.get if isinstance(row, dict) else row.get
    lead_email = _safe_str(get("Email", ""))
    email_sent = False
    n8n_sent = False
    hubspot_synced = False
    notify_error: str | None = None
    n8n_error: str | None = None
    hubspot_error: str | None = None
    hubspot_result: dict[str, Any] | None = None

    if config.get("sync_hubspot_on_route", True) and hubspot_configured():
        try:
            hubspot_result = sync_contact_on_route(row, rep, assignment)
            hubspot_synced = True
        except Exception as exc:
            hubspot_error = str(exc)

    skip_notify = assignment.get("route_bucket") == "automation" and config.get(
        "automation_skip_notify", True
    )

    if config.get("send_email_on_route", True) and not skip_notify:
        if n8n_configured():
            try:
                n8n_sent = send_n8n_assignment_notification(row, rep, assignment)
            except Exception as exc:
                n8n_error = str(exc)

        if email_configured():
            try:
                email_sent = send_lead_assignment_email(row, rep, assignment)
            except Exception as exc:
                notify_error = str(exc)
        elif not n8n_configured():
            notify_error = "No notifications configured. Set N8N_WEBHOOK_URL or email on Railway."

    append_routing_entry(
        rep_id=_safe_str(rep.get("id")),
        rep_name=_safe_str(rep.get("name")),
        rep_email=_safe_str(rep.get("email")),
        lead_email=lead_email,
        route_bucket=assignment["route_bucket"],
        route_reason=assignment["route_reason"],
        ai_score=_score(row),
        ai_tier=_tier(row),
        email_sent=email_sent or n8n_sent,
    )

    return {
        **assignment,
        "email_sent": email_sent,
        "n8n_sent": n8n_sent,
        "hubspot_synced": hubspot_synced,
        "hubspot_result": hubspot_result,
        "hubspot_error": hubspot_error,
        "notify_error": notify_error,
        "n8n_error": n8n_error,
    }
