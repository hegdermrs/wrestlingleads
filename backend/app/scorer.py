"""Blended lead scoring pipeline."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .config import (
    HUBSPOT_10PT_WEIGHT,
    LLM_WEIGHT,
    ML_WEIGHT,
    RULES_WEIGHT,
    TIER_THRESHOLDS,
)
from .features import _normalize_hubspot_score, _safe_str
from .llm import score_leads_with_llm_async
from .parser import is_positive_lifecycle
from .train import load_model, predict_ml_scores


def _score_to_tier(score: float) -> str:
    if score >= TIER_THRESHOLDS["Hot"]:
        return "Hot"
    if score >= TIER_THRESHOLDS["Warm"]:
        return "Warm"
    if score >= TIER_THRESHOLDS["Cold"]:
        return "Cold"
    return "Unqualified"


def _recommended_action(tier: str, lifecycle: str) -> str:
    if lifecycle == "Customer":
        return "Already converted — no outreach needed"
    if tier == "Hot":
        return "Priority outreach"
    if tier == "Warm":
        return "Nurture sequence"
    if tier == "Cold":
        return "Low priority follow-up"
    return "Deprioritize"


def compute_rule_adjustments(row: pd.Series) -> tuple[float, list[str], list[str]]:
    """Return rule score (0-100 scale contribution), reasons, and flags."""
    score = 50.0
    reasons: list[str] = []
    flags: list[str] = []

    lifecycle = _safe_str(row.get("Lifecycle Stage", ""))
    if lifecycle == "Customer":
        return 100.0, ["Already a customer"], []

    relationship = _safe_str(row.get("Relationship Status", ""))
    if relationship == "Ready to start now":
        score += 15
        reasons.append("Ready to start now")

    deadline = _safe_str(row.get("Deadline for Goal", "")).lower()
    if any(k in deadline for k in ("now", "asap", "this week", "next week")):
        score += 10
        reasons.append("Near-term deadline")

    job_title = _safe_str(row.get("Job Title", ""))
    if "Coach Seeking Team Mindset Training" in job_title:
        flags.append("Coach/team track — verify product fit")
        score -= 5

    if not _safe_str(row.get("Email", "")):
        score -= 10
        flags.append("Missing email")
    if not _safe_str(row.get("Phone Number", "")):
        score -= 5
        flags.append("Missing phone")

    lead_status = _safe_str(row.get("Lead Status", ""))
    if lead_status == "Unqualified":
        score = min(score, 30.0)
        flags.append("HubSpot marked Unqualified")

    if is_positive_lifecycle(lifecycle) and lifecycle == "Subscriber":
        score += 10
        reasons.append("Existing subscriber — high intent")

    return max(0.0, min(100.0, score)), reasons, flags


def blend_scores(
    ml_score: float,
    llm_score: float,
    hubspot_score: float | None,
    rule_score: float,
) -> float:
    """Weighted blend on 0-100 scale."""
    hubspot_component = hubspot_score if hubspot_score is not None and not np.isnan(hubspot_score) else rule_score

    total_weight = ML_WEIGHT + LLM_WEIGHT + RULES_WEIGHT
    if hubspot_score is not None and not np.isnan(hubspot_score):
        total_weight += HUBSPOT_10PT_WEIGHT
        return (
            ML_WEIGHT * ml_score
            + LLM_WEIGHT * llm_score
            + HUBSPOT_10PT_WEIGHT * hubspot_component
            + RULES_WEIGHT * rule_score
        )

    # Redistribute hubspot weight to ML/LLM when 10pt score missing
    ml_w = ML_WEIGHT + HUBSPOT_10PT_WEIGHT / 2
    llm_w = LLM_WEIGHT + HUBSPOT_10PT_WEIGHT / 2
    return ml_w * ml_score + llm_w * llm_score + RULES_WEIGHT * rule_score


def score_dataframe(
    df: pd.DataFrame,
    use_llm: bool = True,
    max_llm_rows: int | None = None,
) -> pd.DataFrame:
    """Sync wrapper — use score_dataframe_async from async endpoints."""
    import asyncio

    return asyncio.run(score_dataframe_async(df, use_llm=use_llm, max_llm_rows=max_llm_rows))


async def score_dataframe_async(
    df: pd.DataFrame,
    use_llm: bool = True,
    max_llm_rows: int | None = None,
) -> pd.DataFrame:
    """Score all leads and return enriched DataFrame."""
    if df.empty:
        return df.copy()

    model = load_model()
    _, ml_scores = predict_ml_scores(df, model=model)
    llm_results = await score_leads_with_llm_async(df, use_llm=use_llm, max_rows=max_llm_rows)

    enriched = df.copy()
    ai_scores: list[float] = []
    ai_tiers: list[str] = []
    ai_reasons: list[str] = []
    ai_actions: list[str] = []
    ml_cols: list[float] = []
    llm_cols: list[float] = []
    rule_cols: list[float] = []

    for idx, (_, row) in enumerate(df.iterrows()):
        lifecycle = _safe_str(row.get("Lifecycle Stage", ""))
        llm = llm_results[idx] if idx < len(llm_results) else {"score": 50, "reasons": [], "red_flags": []}

        if lifecycle == "Customer":
            final = 100.0
            tier = "Hot"
            reasons = ["Already converted customer"]
            action = _recommended_action(tier, lifecycle)
            rule_score = 100.0
        else:
            hubspot_raw = row.get("10-Point Lead Score")
            hubspot_norm = _normalize_hubspot_score(hubspot_raw)
            hubspot_val = None if np.isnan(hubspot_norm) else hubspot_norm

            rule_score, rule_reasons, rule_flags = compute_rule_adjustments(row)

            final = blend_scores(
                ml_score=float(ml_scores[idx]),
                llm_score=float(llm["score"]),
                hubspot_score=hubspot_val,
                rule_score=rule_score,
            )
            final = max(0.0, min(100.0, final))
            tier = _score_to_tier(final)

            reason_parts = [
                f"ML: {ml_scores[idx]:.0f}/100",
                f"Text: {llm['score']:.0f}/100",
            ]
            if hubspot_val is not None:
                reason_parts.append(f"HubSpot 10pt: {hubspot_val:.0f}/100")
            reason_parts.extend(llm.get("reasons", [])[:2])
            reason_parts.extend(rule_reasons[:2])
            flags = llm.get("red_flags", []) + rule_flags
            if flags:
                reason_parts.append("Flags: " + "; ".join(flags[:2]))
            reasons = reason_parts
            action = _recommended_action(tier, lifecycle)

        ai_scores.append(round(final, 1))
        ai_tiers.append(tier)
        ai_reasons.append(" | ".join(reasons))
        ai_actions.append(action)
        ml_cols.append(round(float(ml_scores[idx]), 1))
        llm_cols.append(round(float(llm["score"]), 1))
        rule_cols.append(round(float(rule_score), 1))

    enriched["AI Score"] = ai_scores
    enriched["AI Tier"] = ai_tiers
    enriched["AI Reasons"] = ai_reasons
    enriched["Recommended Action"] = ai_actions
    enriched["ML Score"] = ml_cols
    enriched["LLM Score"] = llm_cols
    enriched["Rule Score"] = rule_cols

    return enriched.sort_values("AI Score", ascending=False).reset_index(drop=True)


def metrics_summary(scored: pd.DataFrame) -> dict[str, Any]:
    tier_counts = scored["AI Tier"].value_counts().to_dict() if "AI Tier" in scored.columns else {}
    return {
        "total_leads": len(scored),
        "tier_counts": tier_counts,
        "average_score": round(float(scored["AI Score"].mean()), 1) if len(scored) else 0,
    }
