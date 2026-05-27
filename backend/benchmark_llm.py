"""Benchmark parallel LLM scoring throughput."""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.llm import score_leads_with_llm_async
from app.parser import load_leads_file


async def main() -> None:
    path = os.getenv("BENCHMARK_FILE", str(Path(__file__).resolve().parents[1] / "data" / "leads.xlsx"))
    sample_size = int(os.getenv("BENCHMARK_ROWS", "100"))
    use_llm = bool(os.getenv("DEEPSEEK_API_KEY"))

    df = load_leads_file(path, filename="leads.xlsx")
    subset = df.head(sample_size)

    mode = "DeepSeek parallel" if use_llm else "heuristic"
    concurrency = os.getenv("DEEPSEEK_MAX_CONCURRENCY", "15")
    print(f"Benchmark: {len(subset)} leads | mode={mode} | concurrency={concurrency}")

    start = time.perf_counter()
    results = await score_leads_with_llm_async(subset, use_llm=use_llm)
    elapsed = time.perf_counter() - start

    deepseek_count = sum(1 for r in results if r.get("source") == "deepseek")
    print(f"Done in {elapsed:.1f}s ({elapsed / len(subset):.2f}s per lead)")
    print(f"DeepSeek scored: {deepseek_count}/{len(subset)}")
    if use_llm and len(subset) > 0:
        projected_full = elapsed / len(subset) * 2144
        print(f"Projected full file (~2144 leads): {projected_full / 60:.1f} min")


if __name__ == "__main__":
    asyncio.run(main())
