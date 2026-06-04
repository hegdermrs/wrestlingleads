"""Ideal customer profile (ICP) — fed into LLM scoring prompts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import BASE_DIR
from .features import _safe_str

ICP_PROFILE_PATH = BASE_DIR / "config" / "icp_profile.json"
DATA_ICP_PATH = BASE_DIR / "data" / "icp_profile.json"


def default_icp_profile() -> dict[str, Any]:
    if ICP_PROFILE_PATH.exists():
        return json.loads(ICP_PROFILE_PATH.read_text(encoding="utf-8"))
    return {
        "summary": "1-on-1 mental performance coaching for motivated middle school and high school wrestlers.",
        "positive_signals": [],
        "negative_signals": [],
        "reference_leads": [],
    }


def load_icp_profile() -> dict[str, Any]:
    path = DATA_ICP_PATH if DATA_ICP_PATH.exists() else ICP_PROFILE_PATH
    if not path.exists():
        return default_icp_profile()
    return json.loads(path.read_text(encoding="utf-8"))


def save_icp_profile(profile: dict[str, Any]) -> dict[str, Any]:
    summary = _safe_str(profile.get("summary"))
    if not summary:
        raise ValueError("ICP summary is required.")

    positive = profile.get("positive_signals") or []
    negative = profile.get("negative_signals") or []
    references = profile.get("reference_leads") or []

    if not isinstance(positive, list) or not isinstance(negative, list):
        raise ValueError("positive_signals and negative_signals must be lists.")
    if not isinstance(references, list):
        raise ValueError("reference_leads must be a list.")

    payload = {
        "summary": summary,
        "positive_signals": [_safe_str(s) for s in positive if _safe_str(s)],
        "negative_signals": [_safe_str(s) for s in negative if _safe_str(s)],
        "reference_leads": references,
    }

    DATA_ICP_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_ICP_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def format_icp_for_llm(profile: dict[str, Any] | None = None) -> str:
    """Text block injected into the LLM system prompt."""
    profile = profile or load_icp_profile()
    lines = [
        "IDEAL CUSTOMER PROFILE (ICP) — score leads against this definition:",
        profile.get("summary", ""),
        "",
        "Strong ICP signals (increase score when present):",
    ]
    for signal in profile.get("positive_signals", [])[:12]:
        lines.append(f"- {signal}")

    negatives = profile.get("negative_signals", [])
    if negatives:
        lines.append("")
        lines.append("Weak / non-ICP signals (decrease score):")
        for signal in negatives[:8]:
            lines.append(f"- {signal}")

    refs = profile.get("reference_leads", [])
    if refs:
        lines.append("")
        lines.append("Reference ICP leads (match similar intent and score near their target_score):")
        for ref in refs[:3]:
            label = _safe_str(ref.get("label", "ICP example"))
            target = ref.get("target_score", 90)
            lines.append(f"\n### {label} (target score ~{target})")
            for key, col in (
                ("job_title", "Buyer"),
                ("job_function", "Inquiry reason"),
                ("relationship_status", "Readiness"),
                ("wrestler_goal", "Goal"),
                ("deadline", "Deadline"),
                ("investment", "Investment"),
                ("message", "Message"),
            ):
                val = _safe_str(ref.get(key, ""))
                if val:
                    lines.append(f"{col}: {val[:400]}")
            for reason in ref.get("reasons", [])[:2]:
                lines.append(f"Why ICP: {reason}")

    return "\n".join(lines)


def icp_reference_few_shot(profile: dict[str, Any] | None = None) -> list[dict]:
    """Map ICP reference leads into few-shot shape for the user prompt."""
    profile = profile or load_icp_profile()
    out: list[dict] = []
    for ref in profile.get("reference_leads", [])[:3]:
        message = _safe_str(ref.get("message", ""))
        if not message:
            continue
        out.append(
            {
                "name": _safe_str(ref.get("label", "ICP reference")),
                "job_title": _safe_str(ref.get("job_title", "")),
                "job_function": _safe_str(ref.get("job_function", "")),
                "message": message[:500],
                "lifecycle": "ICP archetype",
                "score": float(ref.get("target_score", 90)),
            }
        )
    return out
