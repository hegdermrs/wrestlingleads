"""In-memory score job tracking for long-running bulk uploads."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

_jobs: dict[str, dict[str, Any]] = {}


def create_job(row_count: int, source: str) -> str:
    job_id = str(uuid4())
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "row_count": row_count,
        "source": source,
        "started_at": datetime.now(UTC).isoformat(),
    }
    return job_id


def update_job(job_id: str, **fields: Any) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(fields)


def get_job(job_id: str) -> dict[str, Any] | None:
    return _jobs.get(job_id)
