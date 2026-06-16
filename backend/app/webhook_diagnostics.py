"""Recent Wufoo webhook accept/reject log for production debugging."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from .config import DATA_DIR

WEBHOOK_DIAG_LOG = DATA_DIR / "webhook_diag_log.json"
_MAX_ENTRIES = 30


def _read() -> list[dict[str, Any]]:
    if not WEBHOOK_DIAG_LOG.exists():
        return []
    try:
        data = json.loads(WEBHOOK_DIAG_LOG.read_text(encoding="utf-8"))
        return list(data.get("entries", []))
    except (json.JSONDecodeError, OSError):
        return []


def _write(entries: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WEBHOOK_DIAG_LOG.write_text(
        json.dumps({"entries": entries[:_MAX_ENTRIES]}, indent=2),
        encoding="utf-8",
    )


def log_webhook_event(
    *,
    outcome: str,
    detail: str = "",
    entry_id: str = "",
    email: str = "",
    form_id: str = "",
    query_form: str = "",
) -> None:
    entries = _read()
    entries.insert(
        0,
        {
            "at": datetime.now(UTC).isoformat(),
            "outcome": outcome,
            "detail": detail,
            "entry_id": str(entry_id or ""),
            "email": str(email or ""),
            "form_id": str(form_id or ""),
            "query_form": str(query_form or ""),
        },
    )
    _write(entries)


def recent_webhook_events(limit: int = 10) -> list[dict[str, Any]]:
    return _read()[:limit]
