"""Load and persist editable lead scoring tier thresholds."""

from __future__ import annotations

import json
import shutil
from typing import Any

from .config import BASE_DIR, DATA_DIR, TIER_THRESHOLDS

DEFAULT_RUBRIC_PATH = BASE_DIR / "config" / "scoring_rubric.json"
SCORING_CONFIG_PATH = DATA_DIR / "scoring_config.json"


def default_rubric() -> dict[str, Any]:
    if DEFAULT_RUBRIC_PATH.exists():
        return json.loads(DEFAULT_RUBRIC_PATH.read_text(encoding="utf-8"))
    return {"tiers": dict(TIER_THRESHOLDS)}


def get_tier_thresholds() -> dict[str, float]:
    config = load_scoring_config()
    tiers = config.get("tiers") or {}
    return {
        "Hot": float(tiers.get("Hot", TIER_THRESHOLDS["Hot"])),
        "Warm": float(tiers.get("Warm", TIER_THRESHOLDS["Warm"])),
        "Cold": float(tiers.get("Cold", TIER_THRESHOLDS["Cold"])),
    }


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
    return json.loads(SCORING_CONFIG_PATH.read_text(encoding="utf-8"))


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


def save_scoring_config(config: dict[str, Any]) -> dict[str, Any]:
    tiers = validate_tiers(config.get("tiers") or {})
    payload = {"tiers": tiers}
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SCORING_CONFIG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
