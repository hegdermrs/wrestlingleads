"""Scoring rubric API — editable tier thresholds."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .scoring_config import load_scoring_config, save_scoring_config
from .store import store

router = APIRouter(prefix="/scoring", tags=["scoring"])


class TierThresholds(BaseModel):
    Hot: float = Field(ge=0, le=100)
    Warm: float = Field(ge=0, le=100)
    Cold: float = Field(ge=0, le=100)


class ScoringRubricUpdate(BaseModel):
    tiers: TierThresholds


@router.get("/rubric")
def get_rubric() -> dict[str, Any]:
    return load_scoring_config()


@router.put("/rubric")
def update_rubric(body: ScoringRubricUpdate) -> dict[str, Any]:
    try:
        saved = save_scoring_config(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    relabeled = store.reapply_tier_labels() if store.loaded else 0
    return {**saved, "leads_relabeled": relabeled}
