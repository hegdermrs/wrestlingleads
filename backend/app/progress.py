"""Real scoring progress helpers for background jobs."""

from __future__ import annotations

from typing import Any, Callable

ProgressCallback = Callable[[dict[str, Any]], None]

_PHASE_WEIGHTS_WITH_LLM = {
    "ml": (0, 4),
    "llm": (4, 92),
    "blending": (92, 99),
    "saving": (99, 100),
}

_PHASE_WEIGHTS_NO_LLM = {
    "ml": (0, 20),
    "llm": (20, 20),
    "blending": (20, 99),
    "saving": (99, 100),
}


def overall_percent(phase: str, processed: int, total: int, use_llm: bool) -> int:
    weights = _PHASE_WEIGHTS_WITH_LLM if use_llm else _PHASE_WEIGHTS_NO_LLM
    start, end = weights.get(phase, (0, 100))
    if total <= 0:
        return end
    fraction = min(1.0, max(0.0, processed / total))
    return int(start + (end - start) * fraction)


def progress_payload(
    phase: str,
    label: str,
    processed: int,
    total: int,
    use_llm: bool,
) -> dict[str, Any]:
    percent = overall_percent(phase, processed, total, use_llm)
    if total > 0:
        message = f"{label}: {processed:,} / {total:,}"
    else:
        message = label
    return {
        "phase": phase,
        "phase_label": label,
        "processed": processed,
        "total": total,
        "percent": percent,
        "progress_message": message,
    }


def emit_progress(
    callback: ProgressCallback | None,
    phase: str,
    label: str,
    processed: int,
    total: int,
    use_llm: bool,
) -> None:
    if callback is None:
        return
    callback(progress_payload(phase, label, processed, total, use_llm))
