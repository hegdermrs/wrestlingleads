"""Weekly routing assignment log for cap tracking."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .config import DATA_DIR

ROUTING_LOG_PATH = DATA_DIR / "routing_log.json"


def _week_start(dt: datetime | None = None) -> datetime:
    dt = dt or datetime.now(UTC)
    start = dt - timedelta(days=dt.weekday())
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


def _load_log() -> list[dict[str, Any]]:
    if not ROUTING_LOG_PATH.exists():
        return []
    data = json.loads(ROUTING_LOG_PATH.read_text(encoding="utf-8"))
    return list(data.get("entries", []))


def _save_log(entries: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ROUTING_LOG_PATH.write_text(
        json.dumps({"entries": entries[-5000:]}, indent=2),
        encoding="utf-8",
    )


def count_rep_this_week(rep_id: str) -> int:
    week = _week_start()
    count = 0
    for entry in _load_log():
        if entry.get("rep_id") != rep_id:
            continue
        try:
            at = datetime.fromisoformat(str(entry.get("at", "")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if at >= week:
            count += 1
    return count


def weekly_stats() -> dict[str, Any]:
    week = _week_start()
    stats: dict[str, int] = {}
    bucket_stats: dict[str, int] = {}
    for entry in _load_log():
        try:
            at = datetime.fromisoformat(str(entry.get("at", "")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if at < week:
            continue
        rep_id = str(entry.get("rep_id", ""))
        stats[rep_id] = stats.get(rep_id, 0) + 1
        bucket = str(entry.get("route_bucket", ""))
        bucket_stats[bucket] = bucket_stats.get(bucket, 0) + 1
    return {
        "week_start": week.isoformat(),
        "by_rep": stats,
        "by_bucket": bucket_stats,
        "total": sum(stats.values()),
    }


def was_lead_routed(email: str) -> bool:
    email_key = email.strip().lower()
    if not email_key:
        return False
    for entry in _load_log():
        if str(entry.get("lead_email", "")).strip().lower() == email_key:
            return True
    return False


def append_routing_entry(
    *,
    rep_id: str,
    rep_name: str,
    rep_email: str,
    lead_email: str,
    route_bucket: str,
    route_reason: str,
    ai_score: float,
    ai_tier: str,
    email_sent: bool,
) -> dict[str, Any]:
    entry = {
        "at": datetime.now(UTC).isoformat(),
        "rep_id": rep_id,
        "rep_name": rep_name,
        "rep_email": rep_email,
        "lead_email": lead_email,
        "route_bucket": route_bucket,
        "route_reason": route_reason,
        "ai_score": ai_score,
        "ai_tier": ai_tier,
        "email_sent": email_sent,
    }
    entries = _load_log()
    entries.append(entry)
    _save_log(entries)
    return entry


def recent_entries(limit: int = 20) -> list[dict[str, Any]]:
    return list(reversed(_load_log()[-limit:]))
