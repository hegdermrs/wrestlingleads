"""FastAPI application for lead qualification."""

from __future__ import annotations

import io
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .config import DEFAULT_TRAINING_FILE, DEEPSEEK_API_KEY_ENV, METRICS_PATH, MODEL_PATH
from .parser import load_leads_file
from .progress import emit_progress
from .score_jobs import create_job, get_job, list_jobs, update_job
from .scorer import metrics_summary, score_dataframe_async
from .store import store
from .train import train_model
from .webhooks import router as webhooks_router
from .routing_api import router as routing_router
from .routing_notify import smtp_configured
from .scoring_api import router as scoring_router

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

app = FastAPI(title="Leads Qualifier API", version="1.0.0")
app.include_router(webhooks_router)
app.include_router(routing_router)
app.include_router(scoring_router)

def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return ["*"]


_cors = _cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    # credentials=True is incompatible with allow_origins=["*"] and breaks cross-origin uploads
    allow_credentials=_cors != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Return JSON errors so CORS headers are applied (plain 500s are blocked by browsers)."""
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.on_event("startup")
def startup() -> None:
    if not MODEL_PATH.exists() and DEFAULT_TRAINING_FILE.exists():
        train_model()
    store.load_on_startup()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_ready": MODEL_PATH.exists(),
        "training_data": DEFAULT_TRAINING_FILE.exists(),
        "llm_provider": "deepseek",
        "llm_configured": bool(os.getenv(DEEPSEEK_API_KEY_ENV)),
        "cache_loaded": store.loaded,
        "baseline_loaded": store.baseline_loaded,
        "wufoo_secret_configured": bool(os.getenv("WUFOO_WEBHOOK_SECRET")),
        "smtp_configured": smtp_configured(),
        "smtp_user": os.getenv("SMTP_USER", "").strip() or None,
    }


@app.get("/metrics")
def get_metrics() -> dict:
    if not METRICS_PATH.exists():
        if DEFAULT_TRAINING_FILE.exists():
            return train_model()
        raise HTTPException(status_code=404, detail="No trained model metrics found.")
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))


@app.get("/dashboard/stats")
def dashboard_stats() -> dict:
    return store.get_stats()


@app.get("/dashboard/leads")
def dashboard_leads(
    tier: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None),
) -> dict:
    if not store.loaded:
        raise HTTPException(status_code=404, detail="No scored leads loaded. Import or score leads in Settings.")
    return store.get_leads(tier=tier, page=page, limit=limit, search=search)


@app.get("/dashboard/export")
def dashboard_export(tier: str | None = Query(default=None)) -> StreamingResponse:
    if not store.loaded:
        raise HTTPException(status_code=404, detail="No scored leads to export.")

    try:
        export_df = store.export_dataframe(tier=tier)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    buffer = io.BytesIO()
    export_df.to_excel(buffer, index=False, engine="openpyxl")
    buffer.seek(0)

    suffix = "all" if not tier or tier.lower() == "all" else tier.lower()
    filename = f"leads_{suffix}_qualified.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/dashboard/recent")
def dashboard_recent(limit: int = Query(default=10, ge=1, le=50)) -> dict:
    if not store.loaded:
        return {"recent": [], "webhook_recent_counts": {"total": 0, "Hot": 0, "Warm": 0, "Cold": 0, "Unqualified": 0}}
    return {
        "recent": store.get_recent(limit=limit),
        "webhook_recent_counts": store.get_recent_webhook_tier_counts(),
    }


@app.post("/train")
def retrain() -> dict:
    if not DEFAULT_TRAINING_FILE.exists():
        raise HTTPException(status_code=404, detail="Training data not found at data/leads.xlsx")
    metrics = train_model()
    return {"message": "Model retrained successfully", "metrics": metrics}


async def _run_score_job(job_id: str, df: pd.DataFrame, use_llm: bool, filename: str) -> None:
    row_count = len(df)

    def on_progress(data: dict) -> None:
        update_job(job_id, status="running", **data)

    update_job(job_id, status="running", phase="starting", phase_label="Starting", percent=0)
    try:
        scored = await score_dataframe_async(df, use_llm=use_llm, on_progress=on_progress)
        emit_progress(on_progress, "saving", "Saving to dashboard", 1, 1, use_llm)
        store.save(scored, source=filename or "upload.xlsx", note="Scored via Settings")
        update_job(
            job_id,
            status="complete",
            phase="complete",
            phase_label="Complete",
            processed=row_count,
            total=row_count,
            percent=100,
            progress_message=f"Done — {row_count:,} leads scored",
            summary=metrics_summary(scored),
            row_count=row_count,
            finished_at=datetime.now(UTC).isoformat(),
        )
    except Exception as exc:
        update_job(
            job_id,
            status="failed",
            phase="failed",
            phase_label="Failed",
            progress_message=str(exc),
            detail=str(exc),
        )


@app.get("/score/status/{job_id}")
def score_job_status(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Score job not found.")
    return job


@app.get("/score/latest")
def latest_score_job() -> dict:
    jobs = list_jobs(limit=1)
    if not jobs:
        raise HTTPException(status_code=404, detail="No score jobs found.")
    return jobs[0]


@app.post("/score")
async def score_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    use_llm: bool = Query(default=True),
    async_mode: bool = Query(default=True),
) -> dict:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        df = load_leads_file(content, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    if df.empty:
        raise HTTPException(status_code=400, detail="No lead rows found in file.")

    filename = file.filename or "upload.xlsx"

    if async_mode:
        job_id = create_job(len(df), filename, use_llm=use_llm)
        background_tasks.add_task(_run_score_job, job_id, df, use_llm, filename)
        return {
            "message": "Scoring started — poll status or refresh Dashboard when complete",
            "job_id": job_id,
            "row_count": len(df),
            "status": "queued",
        }

    scored = await score_dataframe_async(df, use_llm=use_llm)
    store.save(scored, source=filename, note="Scored via Settings")

    return {
        "message": "Leads scored and saved to dashboard cache",
        "summary": metrics_summary(scored),
        "row_count": len(scored),
    }


@app.get("/dashboard/compare/summary")
def dashboard_compare_summary() -> dict:
    return store.get_compare_summary()


@app.get("/dashboard/export-compare")
def dashboard_export_compare(tier: str | None = Query(default=None)) -> StreamingResponse:
    if not store.loaded:
        raise HTTPException(status_code=404, detail="No scored leads loaded.")
    if not store.baseline_loaded:
        raise HTTPException(
            status_code=404,
            detail="No baseline export loaded. Upload previous qualified.xlsx under Compare in Settings.",
        )

    try:
        export_df = store.export_compare_dataframe(tier=tier)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    buffer = io.BytesIO()
    export_df.to_excel(buffer, index=False, engine="openpyxl")
    buffer.seek(0)

    suffix = "all" if not tier or tier.lower() == "all" else tier.lower()
    filename = f"leads_{suffix}_tier_compare.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/settings/import-baseline")
async def import_baseline(file: UploadFile = File(...)) -> dict:
    """Store previous qualified export for tier comparison (does not replace current cache)."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    if "AI Tier" not in df.columns:
        raise HTTPException(status_code=400, detail="File must include AI Tier column.")

    try:
        store.save_baseline(df, source=file.filename or "baseline.xlsx")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "message": "Baseline export saved for tier comparison and reference scoring",
        "row_count": len(df),
        "summary": store.get_compare_summary(),
    }


@app.post("/settings/run-tier-report")
async def run_tier_report(file: UploadFile = File(...)) -> StreamingResponse:
    """Upload old qualified.xlsx and download full Hot tier comparison report vs current cache."""
    if not store.loaded:
        raise HTTPException(status_code=404, detail="No current scored leads in cache.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        old_df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    from io import BytesIO

    from .tier_compare import export_comparison_report

    result = export_comparison_report(old_df=old_df, new_df=store.get_all_scored_df())
    report_path = Path(result["output_path"])
    return StreamingResponse(
        BytesIO(report_path.read_bytes()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{report_path.name}"'},
    )


@app.post("/settings/purge-test-leads")
def purge_test_leads() -> dict:
    """Remove integration-test rows (@example.com, etc.) from dashboard cache."""
    removed = store.purge_synthetic_test_leads()
    return {
        "removed": removed,
        "cache_row_count": len(store._df) if store._df is not None else 0,
    }


@app.post("/settings/import-qualified")
async def import_qualified(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    if "AI Tier" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="File must be a pre-scored export with AI Tier column.",
        )

    store.save(df, source=file.filename or "qualified.xlsx", note="Imported pre-scored file")

    from .reference_scores import save_reference

    save_reference(df)
    return {
        "message": "Qualified leads imported to dashboard cache",
        "summary": metrics_summary(df),
        "row_count": len(df),
    }


@app.post("/score/download")
async def score_and_download(
    file: UploadFile = File(...),
    use_llm: bool = Query(default=True),
) -> StreamingResponse:
    """Legacy endpoint — prefer /dashboard/export after scoring once."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        df = load_leads_file(content, filename=file.filename)
        scored = await score_dataframe_async(df, use_llm=use_llm)
        store.save(scored, source=file.filename or "upload.xlsx", note="Scored via legacy download")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to score file: {exc}") from exc

    buffer = io.BytesIO()
    scored.to_excel(buffer, index=False, engine="openpyxl")
    buffer.seek(0)

    filename = Path(file.filename or "leads.xlsx").stem + "_qualified.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
