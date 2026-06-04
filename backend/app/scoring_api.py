"""Scoring rubric API — editable tier thresholds."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .icp_profile import load_icp_profile, save_icp_profile
from .scoring_config import load_scoring_config, save_scoring_config
from .store import store

router = APIRouter(prefix="/scoring", tags=["scoring"])


class TierThresholds(BaseModel):
    Hot: float = Field(ge=0, le=100)
    Warm: float = Field(ge=0, le=100)
    Cold: float = Field(ge=0, le=100)


class ScoringRubricUpdate(BaseModel):
    tiers: TierThresholds
    coaching_score_boost: float = Field(default=8, ge=0, le=20)
    icp_llm_min: float = Field(default=68, ge=40, le=95)


class IcpProfileUpdate(BaseModel):
    summary: str = Field(min_length=10)
    positive_signals: list[str] = Field(default_factory=list)
    negative_signals: list[str] = Field(default_factory=list)
    reference_leads: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/rubric")
def get_rubric() -> dict[str, Any]:
    return load_scoring_config()


@router.get("/icp-profile")
def get_icp_profile() -> dict[str, Any]:
    return load_icp_profile()


@router.put("/icp-profile")
def update_icp_profile(body: IcpProfileUpdate) -> dict[str, Any]:
    try:
        return save_icp_profile(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/rubric")
def update_rubric(body: ScoringRubricUpdate) -> dict[str, Any]:
    try:
        saved = save_scoring_config(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    relabeled = store.reapply_tier_labels() if store.loaded else 0
    return {**saved, "leads_relabeled": relabeled}
