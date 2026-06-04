"""Load and persist editable lead scoring tier thresholds and leniency knobs."""

from __future__ import annotations

import json
import shutil
from typing import Any

from .config import BASE_DIR, DATA_DIR, TIER_THRESHOLDS

DEFAULT_RUBRIC_PATH = BASE_DIR / "config" / "scoring_rubric.json"
SCORING_CONFIG_PATH = DATA_DIR / "scoring_config.json"

LENIENCY_DEFAULTS = {
    "coaching_score_boost": 8.0,
    "icp_llm_min": 68.0,
}


def default_rubric() -> dict[str, Any]:
    if DEFAULT_RUBRIC_PATH.exists():
        return json.loads(DEFAULT_RUBRIC_PATH.read_text(encoding="utf-8"))
    return {"tiers": dict(TIER_THRESHOLDS), **LENIENCY_DEFAULTS}


def _merge_config(raw: dict[str, Any]) -> dict[str, Any]:
    base = default_rubric()
    merged = {**base, **raw}
    merged["tiers"] = {
        "Hot": float((raw.get("tiers") or base.get("tiers") or {}).get("Hot", TIER_THRESHOLDS["Hot"])),
        "Warm": float((raw.get("tiers") or base.get("tiers") or {}).get("Warm", TIER_THRESHOLDS["Warm"])),
        "Cold": float((raw.get("tiers") or base.get("tiers") or {}).get("Cold", TIER_THRESHOLDS["Cold"])),
    }
    merged["coaching_score_boost"] = float(
        merged.get("coaching_score_boost", LENIENCY_DEFAULTS["coaching_score_boost"])
    )
    merged["icp_llm_min"] = float(merged.get("icp_llm_min", LENIENCY_DEFAULTS["icp_llm_min"]))
    return merged


def get_tier_thresholds() -> dict[str, float]:
    config = load_scoring_config()
    tiers = config.get("tiers") or {}
    return {
        "Hot": float(tiers.get("Hot", TIER_THRESHOLDS["Hot"])),
        "Warm": float(tiers.get("Warm", TIER_THRESHOLDS["Warm"])),
        "Cold": float(tiers.get("Cold", TIER_THRESHOLDS["Cold"])),
    }


def get_coaching_score_boost() -> float:
    return float(load_scoring_config().get("coaching_score_boost", LENIENCY_DEFAULTS["coaching_score_boost"]))


def get_icp_llm_min() -> float:
    return float(load_scoring_config().get("icp_llm_min", LENIENCY_DEFAULTS["icp_llm_min"]))


def load_scoring_config() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not SCORING_CONFIG_PATH.exists():
        if DEFAULT_RUBRIC_PATH.exists():
            shutil.copy2(DEFAULT_RUBRIC_PATH, SCORING_CONFIG_PATH)
        else:
            SCORING_CONFIG_PATH.write_text(
                json.dumps(default_rubric(), indent=2),
                encoding="utf-8",
            )
    raw = json.loads(SCORING_CONFIG_PATH.read_text(encoding="utf-8"))
    return _merge_config(raw)


def validate_tiers(tiers: dict[str, Any]) -> dict[str, float]:
    try:
        hot = float(tiers["Hot"])
        warm = float(tiers["Warm"])
        cold = float(tiers["Cold"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Rubric must include numeric Hot, Warm, and Cold minimum scores.") from exc

    if not (100 >= hot > warm > cold >= 0):
        raise ValueError("Thresholds must satisfy 100 ≥ Hot > Warm > Cold ≥ 0.")

    return {"Hot": hot, "Warm": warm, "Cold": cold}


def _validate_leniency(config: dict[str, Any]) -> dict[str, float]:
    boost = float(config.get("coaching_score_boost", LENIENCY_DEFAULTS["coaching_score_boost"]))
    icp_min = float(config.get("icp_llm_min", LENIENCY_DEFAULTS["icp_llm_min"]))
    if not (0 <= boost <= 20):
        raise ValueError("coaching_score_boost must be between 0 and 20.")
    if not (40 <= icp_min <= 95):
        raise ValueError("icp_llm_min must be between 40 and 95.")
    return {"coaching_score_boost": boost, "icp_llm_min": icp_min}


def save_scoring_config(config: dict[str, Any]) -> dict[str, Any]:
    tiers = validate_tiers(config.get("tiers") or {})
    leniency = _validate_leniency(config)
    payload = {"tiers": tiers, **leniency}
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SCORING_CONFIG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload

