"""Score job tracking persisted to disk for long-running bulk uploads."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .config import DATA_DIR

JOBS_DIR = DATA_DIR / "score_jobs"
_jobs: dict[str, dict[str, Any]] = {}


def _persist(job_id: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    (JOBS_DIR / f"{job_id}.json").write_text(json.dumps(job, indent=2), encoding="utf-8")


def create_job(row_count: int, source: str, use_llm: bool = True) -> str:
    job_id = str(uuid4())
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "row_count": row_count,
        "source": source,
        "use_llm": use_llm,
        "phase": "queued",
        "phase_label": "Queued",
        "processed": 0,
        "total": row_count,
        "percent": 0,
        "progress_message": "Waiting to start…",
        "started_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    _persist(job_id)
    return job_id


def update_job(job_id: str, **fields: Any) -> None:
    if job_id not in _jobs:
        saved = _load_from_disk(job_id)
        if not saved:
            return
    _jobs[job_id].update(fields)
    _jobs[job_id]["updated_at"] = datetime.now(UTC).isoformat()
    _persist(job_id)


def _load_from_disk(job_id: str) -> dict[str, Any] | None:
    path = JOBS_DIR / f"{job_id}.json"
    if not path.exists():
        return None
    job = json.loads(path.read_text(encoding="utf-8"))
    _jobs[job_id] = job
    return job


def get_job(job_id: str) -> dict[str, Any] | None:
    if job_id in _jobs:
        return _jobs[job_id]
    return _load_from_disk(job_id)


def list_jobs(limit: int = 10) -> list[dict[str, Any]]:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    paths = sorted(JOBS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    jobs: list[dict[str, Any]] = []
    for path in paths[:limit]:
        job_id = path.stem
        job = get_job(job_id)
        if job:
            jobs.append(job)
    return jobs
