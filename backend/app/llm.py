"""LLM-based text scoring for lead qualification."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Callable

import pandas as pd

from .config import (
    DEEPSEEK_API_KEY_ENV,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MAX_CONCURRENCY,
    DEEPSEEK_MAX_RETRIES,
    DEEPSEEK_MODEL,
    DEEPSEEK_RETRY_BASE_DELAY,
    FEW_SHOT_PATH,
)
from .features import build_text_bundle, empty_profile_text_result, heuristic_text_score

ProgressCallback = Callable[[int, int], None] | None

SYSTEM_PROMPT = """You are a lead qualification expert for a 1-on-1 mental performance coaching program for wrestlers.

Score each lead 0-100 based on:
- Fit for 1-on-1 mental coaching (not team-only or wrong sport)
- Specificity of pain points (nerves, choking, confidence, mindset)
- Purchase intent and readiness
- Athlete level appropriateness for middle school and high school wrestlers (core ICP)

IMPORTANT: If the lead has no message, job title, goals, or other coaching context (email-only record),
score 15-25 maximum. Do not infer intent from lifecycle stage alone.

Return ONLY valid JSON with this shape:
{
  "score": <number 0-100>,
  "reasons": ["reason1", "reason2"],
  "red_flags": ["flag1"]
}
"""


def _load_few_shot_examples() -> list[dict]:
    if FEW_SHOT_PATH.exists():
        return json.loads(FEW_SHOT_PATH.read_text(encoding="utf-8"))
    return []


def _build_user_prompt(row: pd.Series, few_shot: list[dict]) -> str:
    examples_text = ""
    for ex in few_shot[:5]:
        examples_text += (
            f"\nExample good lead ({ex.get('lifecycle', 'Customer')}):\n"
            f"Buyer: {ex.get('job_title', '')}\n"
            f"Function: {ex.get('job_function', '')}\n"
            f"Message: {ex.get('message', '')[:400]}\n"
            f"Score: {ex.get('score', 90)}\n"
        )

    lead_text = build_text_bundle(row)
    return (
        f"{examples_text}\n"
        "Now score this lead:\n"
        f"{lead_text}\n"
        "Respond with JSON only."
    )


def _parse_llm_json(content: str) -> dict[str, Any]:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content)


def _heuristic_result(row: pd.Series, note: str | None = None) -> dict[str, Any]:
    score, reasons, red_flags = heuristic_text_score(row)
    if note:
        reasons = [note] + reasons
    return {
        "score": score,
        "reasons": reasons[:3],
        "red_flags": red_flags,
        "source": "heuristic",
    }


def create_llm_client() -> Any | None:
    """Create a sync DeepSeek client (OpenAI-compatible API)."""
    api_key = os.getenv(DEEPSEEK_API_KEY_ENV)
    if not api_key:
        return None

    try:
        from openai import OpenAI

        return OpenAI(api_key=api_key, base_url=os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_BASE_URL))
    except ImportError:
        return None


def create_async_llm_client() -> Any | None:
    """Create an async DeepSeek client (OpenAI-compatible API)."""
    api_key = os.getenv(DEEPSEEK_API_KEY_ENV)
    if not api_key:
        return None

    try:
        from openai import AsyncOpenAI

        return AsyncOpenAI(api_key=api_key, base_url=os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_BASE_URL))
    except ImportError:
        return None


def _max_concurrency() -> int:
    raw = os.getenv("DEEPSEEK_MAX_CONCURRENCY")
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    return DEEPSEEK_MAX_CONCURRENCY


async def _call_deepseek_with_retry(client: Any, model: str, prompt: str) -> dict[str, Any]:
    from openai import APIStatusError, RateLimitError

    last_error: Exception | None = None
    for attempt in range(DEEPSEEK_MAX_RETRIES):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            parsed = _parse_llm_json(response.choices[0].message.content or "{}")
            return {
                "score": float(parsed.get("score", 50)),
                "reasons": list(parsed.get("reasons", []))[:3],
                "red_flags": list(parsed.get("red_flags", []))[:3],
                "source": "deepseek",
            }
        except RateLimitError as exc:
            last_error = exc
        except APIStatusError as exc:
            last_error = exc
            if exc.status_code != 429:
                raise
        except Exception as exc:
            last_error = exc
            break

        delay = DEEPSEEK_RETRY_BASE_DELAY * (2**attempt)
        await asyncio.sleep(delay)

    raise last_error or RuntimeError("DeepSeek request failed")


async def _score_lead_with_llm_async(
    row: pd.Series,
    client: Any,
    semaphore: asyncio.Semaphore,
    few_shot: list[dict],
    model: str,
) -> dict[str, Any]:
    if not build_text_bundle(row).strip():
        return empty_profile_text_result()

    prompt = _build_user_prompt(row, few_shot)
    async with semaphore:
        try:
            return await _call_deepseek_with_retry(client, model, prompt)
        except Exception as exc:
            return _heuristic_result(row, note=f"LLM fallback: {exc}")


async def score_leads_with_llm_async(
    df: pd.DataFrame,
    use_llm: bool = True,
    max_rows: int | None = None,
    on_row_complete: ProgressCallback = None,
) -> list[dict[str, Any]]:
    """Score leads in parallel with DeepSeek (async)."""
    subset = df.head(max_rows) if max_rows else df
    rows = [row for _, row in subset.iterrows()]
    total = len(rows)

    client = create_async_llm_client() if use_llm else None
    if client is None:
        results = [_heuristic_result(row) for row in rows]
        if on_row_complete and total:
            on_row_complete(total, total)
        return results

    few_shot = _load_few_shot_examples()
    model = os.getenv("DEEPSEEK_MODEL", DEEPSEEK_MODEL)
    semaphore = asyncio.Semaphore(_max_concurrency())

    async def score_indexed(idx: int, row: pd.Series) -> tuple[int, dict[str, Any]]:
        result = await _score_lead_with_llm_async(row, client, semaphore, few_shot, model)
        return idx, result

    tasks = [asyncio.create_task(score_indexed(i, row)) for i, row in enumerate(rows)]
    results: list[dict[str, Any] | None] = [None] * total
    completed = 0

    for task in asyncio.as_completed(tasks):
        idx, result = await task
        results[idx] = result
        completed += 1
        if on_row_complete:
            on_row_complete(completed, total)

    return [r if r is not None else _heuristic_result(rows[i]) for i, r in enumerate(results)]


def score_leads_with_llm(
    df: pd.DataFrame,
    use_llm: bool = True,
    max_rows: int | None = None,
) -> list[dict[str, Any]]:
    """Sync wrapper for batch LLM scoring."""
    return asyncio.run(score_leads_with_llm_async(df, use_llm=use_llm, max_rows=max_rows))


def score_lead_with_llm(row: pd.Series, client: Any | None = None) -> dict[str, Any]:
    """Score a single lead with DeepSeek or heuristic fallback."""
    if not build_text_bundle(row).strip():
        return empty_profile_text_result()

    if client is None:
        return _heuristic_result(row)

    few_shot = _load_few_shot_examples()
    prompt = _build_user_prompt(row, few_shot)
    model = os.getenv("DEEPSEEK_MODEL", DEEPSEEK_MODEL)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        parsed = _parse_llm_json(response.choices[0].message.content or "{}")
        return {
            "score": float(parsed.get("score", 50)),
            "reasons": list(parsed.get("reasons", []))[:3],
            "red_flags": list(parsed.get("red_flags", []))[:3],
            "source": "deepseek",
        }
    except Exception as exc:
        return _heuristic_result(row, note=f"LLM fallback: {exc}")
