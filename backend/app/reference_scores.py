"""Reference tier anchors from the last trusted qualified export.

Re-scoring with ML + LLM/heuristic drift can demote good coaching leads (especially
Subscribers with form data). Reference stability preserves tier floors for leads
that already qualified as Hot/Warm/Cold while still allowing sparse-subscriber caps.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from .config import MODELS_DIR
from .features import INCOMPLETE_PROFILE_MAX_SCORE, _safe_str, has_coaching_signals, is_sparse_subscriber
from .scoring_config import get_tier_thresholds

REFERENCE_PATH = MODELS_DIR / "reference_scores.parquet"


def tier_floors() -> dict[str, float]:
    thresholds = get_tier_thresholds()
    return {
        "Hot": float(thresholds["Hot"]),
        "Warm": float(thresholds["Warm"]),
        "Cold": float(thresholds["Cold"]),
        "Unqualified": 0.0,
    }

_reference_by_record_id: dict[str, dict[str, Any]] | None = None
_reference_by_email: dict[str, dict[str, Any]] | None = None


def _norm_key(value: object) -> str:
    return _safe_str(value).lower()


def _row_reference(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "record_id": _safe_str(row.get("record_id", "")),
        "email": _safe_str(row.get("email", "")),
        "ai_tier": _safe_str(row.get("ai_tier", "")),
        "ai_score": float(row.get("ai_score", 0) or 0),
    }


def build_reference_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Build minimal reference lookup from a trusted scored export."""
    if "AI Tier" not in df.columns:
        raise ValueError("Reference export must include AI Tier column.")

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        record_id = _safe_str(row.get("Record ID", ""))
        email = _safe_str(row.get("Email", ""))
        tier = _safe_str(row.get("AI Tier", ""))
        if not record_id and not email:
            continue
        if not tier:
            continue
        try:
            score = float(row.get("AI Score", 0) or 0)
        except (TypeError, ValueError):
            score = 0.0
        rows.append(
            {
                "record_id": record_id,
                "email": email,
                "ai_tier": tier,
                "ai_score": score,
            }
        )

    if not rows:
        raise ValueError("No reference rows with Record ID or Email and AI Tier.")

    return pd.DataFrame(rows)


def save_reference(df: pd.DataFrame, path: Path | None = None) -> Path:
    """Persist reference tiers for production scoring."""
    path = path or REFERENCE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    ref_df = build_reference_dataframe(df)
    ref_df.to_parquet(path, index=False)
    clear_reference_cache()
    return path


def load_reference_dataframe(path: Path | None = None) -> pd.DataFrame | None:
    path = path or REFERENCE_PATH
    if not path.exists():
        return None
    return pd.read_parquet(path)


def _build_lookup(df: pd.DataFrame) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_record: dict[str, dict[str, Any]] = {}
    by_email: dict[str, dict[str, Any]] = {}
    for row in df.to_dict(orient="records"):
        ref = _row_reference(row)
        record_id = ref["record_id"]
        email_key = _norm_key(ref["email"])
        if record_id:
            by_record[record_id] = ref
        if email_key:
            by_email[email_key] = ref
    return by_record, by_email


def clear_reference_cache() -> None:
    global _reference_by_record_id, _reference_by_email
    _reference_by_record_id = None
    _reference_by_email = None


def ensure_reference_loaded(path: Path | None = None) -> bool:
    global _reference_by_record_id, _reference_by_email
    if _reference_by_record_id is not None and _reference_by_email is not None:
        return bool(_reference_by_record_id or _reference_by_email)

    df = load_reference_dataframe(path)
    if df is None or df.empty:
        _reference_by_record_id = {}
        _reference_by_email = {}
        return False

    _reference_by_record_id, _reference_by_email = _build_lookup(df)
    return True


def lookup_reference(row: pd.Series | dict[str, Any]) -> dict[str, Any] | None:
    """Find reference tier/score for a lead by Record ID, then Email."""
    ensure_reference_loaded()
    assert _reference_by_record_id is not None and _reference_by_email is not None

    get = row.get if isinstance(row, dict) else row.get
    record_id = _safe_str(get("Record ID", ""))
    if record_id and record_id in _reference_by_record_id:
        return _reference_by_record_id[record_id]

    email_key = _norm_key(get("Email", ""))
    if email_key and email_key in _reference_by_email:
        return _reference_by_email[email_key]

    return None


def apply_reference_stability(
    final: float,
    row: pd.Series | dict[str, Any],
    reference: dict[str, Any] | None = None,
) -> tuple[float, str | None]:
    """Keep trusted coaching tiers stable across re-scores; still cap sparse subscribers."""
    if is_sparse_subscriber(row):
        capped = min(final, INCOMPLETE_PROFILE_MAX_SCORE)
        if capped < final:
            return capped, "Cap: sparse subscriber (email-only)"
        return capped, None

    ref = reference if reference is not None else lookup_reference(row)
    if not ref or not has_coaching_signals(row):
        return final, None

    ref_tier = _safe_str(ref.get("ai_tier", ""))
    floor = tier_floors().get(ref_tier, 0.0)
    if floor and final < floor:
        return floor, f"Reference stability: preserved {ref_tier} tier for coaching lead"

    return final, None
