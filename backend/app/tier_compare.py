"""Compare old vs new AI tier assignments for Hot list accuracy review."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from .features import has_coaching_signals, is_incomplete_profile, is_sparse_subscriber

COMPARE_OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "reports"

REVIEW_COLUMNS = [
    "Client Trusts Hot? (Y/N)",
    "Client Wrong Hot? (Y/N)",
    "Client Notes",
]


def _norm_email(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip().lower()


def _norm_tier(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def _safe_str(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def _is_customer(row: pd.Series) -> bool:
    return _norm_tier(row.get("Lifecycle Stage", "")) == "Customer"


def classify_change_tag(row: pd.Series) -> str:
    """Explain why tier changed between old and new scoring."""
    old_tier = _norm_tier(row.get("Previous AI Tier", ""))
    new_tier = _norm_tier(row.get("AI Tier", ""))
    if old_tier == new_tier:
        return "unchanged"

    lifecycle = _safe_str(row.get("Lifecycle Stage", ""))
    if _is_customer(row):
        return "customer_hidden_from_dashboard"

    if is_sparse_subscriber(row):
        return "intentional_sparse_subscriber_cap"

    reasons = _safe_str(row.get("AI Reasons", ""))
    if "Reference stability:" in reasons:
        return "reference_stability_floor"

    if is_incomplete_profile(row):
        return "incomplete_profile_cap"

    if old_tier == "Hot" and new_tier != "Hot" and has_coaching_signals(row):
        return "investigate_coaching_lead_demoted"

    if old_tier != "Hot" and new_tier == "Hot":
        return "new_hot"

    if "Cap:" in _safe_str(row.get("AI Reasons", "")):
        return "score_cap_applied"

    return "rescored_shift"


def load_old_scores(path: Path | str) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Old scores file not found: {path}")
    df = pd.read_excel(path, engine="openpyxl")
    if "Email" not in df.columns:
        raise ValueError("Old file must include Email column.")
    if "AI Tier" not in df.columns:
        raise ValueError("Old file must include AI Tier column.")
    return df


def load_new_scores(path: Path | str | None = None, df: pd.DataFrame | None = None) -> pd.DataFrame:
    if df is not None:
        return df.copy()
    path = Path(path or Path(__file__).resolve().parents[2] / "data" / "scored_cache.parquet")
    if path.suffix.lower() == ".parquet":
        return pd.read_parquet(path)
    return pd.read_excel(path, engine="openpyxl")


def build_tier_comparison(
    old_df: pd.DataFrame,
    new_df: pd.DataFrame,
    exclude_customers: bool = True,
) -> pd.DataFrame:
    """Join old and new tiers on email; add change tags and review columns."""
    old = old_df.copy()
    new = new_df.copy()

    old["_email_key"] = old["Email"].apply(_norm_email)
    new["_email_key"] = new["Email"].apply(_norm_email)

    old_cols = {
        "AI Tier": "Previous AI Tier",
        "AI Score": "Previous AI Score",
    }
    if "ML Score" in old.columns:
        old_cols["ML Score"] = "Previous ML Score"
    if "LLM Score" in old.columns:
        old_cols["LLM Score"] = "Previous LLM Score"

    old_subset = old[["_email_key", "Email"] + [c for c in old_cols if c in old.columns]].rename(
        columns=old_cols
    )

    merged = new.merge(old_subset, on="_email_key", how="left", suffixes=("", "_old_email"))

    if "Email" in merged.columns and merged["Email"].isna().any():
        merged["Email"] = merged["Email"].fillna(merged.get("Email_old_email"))

    merged["Previous AI Tier"] = merged.get("Previous AI Tier", pd.Series(dtype=object)).fillna("")
    merged["Previous AI Score"] = merged.get("Previous AI Score", pd.Series(dtype=float))

    merged["Tier Change"] = merged.apply(
        lambda r: (
            f"{_norm_tier(r.get('Previous AI Tier'))} → {_norm_tier(r.get('AI Tier'))}"
            if _norm_tier(r.get("Previous AI Tier"))
            else f"new → {_norm_tier(r.get('AI Tier'))}"
        ),
        axis=1,
    )
    merged["Score Delta"] = merged.apply(
        lambda r: (
            round(float(r["AI Score"]) - float(r["Previous AI Score"]), 1)
            if pd.notna(r.get("AI Score")) and pd.notna(r.get("Previous AI Score"))
            else None
        ),
        axis=1,
    )
    merged["Hot Change Bucket"] = merged.apply(_hot_change_bucket, axis=1)
    merged["Change Tag"] = merged.apply(classify_change_tag, axis=1)

    for col in REVIEW_COLUMNS:
        merged[col] = ""

    if exclude_customers:
        merged = merged[~merged.apply(_is_customer, axis=1)].copy()

    merged = merged.drop(columns=[c for c in merged.columns if c.startswith("_")], errors="ignore")
    return merged.reset_index(drop=True)


def _hot_change_bucket(row: pd.Series) -> str:
    old_tier = _norm_tier(row.get("Previous AI Tier", ""))
    new_tier = _norm_tier(row.get("AI Tier", ""))
    if old_tier == "Hot" and new_tier == "Hot":
        return "still_hot"
    if old_tier == "Hot" and new_tier != "Hot":
        return "dropped_from_hot"
    if old_tier != "Hot" and new_tier == "Hot":
        return "new_hot"
    return "other"


def summarize_comparison(compared: pd.DataFrame) -> dict[str, Any]:
    """Summary stats for API and reports."""
    hot = compared[compared["Hot Change Bucket"].isin(["still_hot", "dropped_from_hot", "new_hot"])]
    bucket_counts = compared["Hot Change Bucket"].value_counts().to_dict()
    tag_counts = compared["Hot Change Bucket"].eq("dropped_from_hot").groupby(compared["Change Tag"]).sum()
    tag_counts = {k: int(v) for k, v in tag_counts.items() if v > 0}

    return {
        "total_compared": len(compared),
        "still_hot": int(bucket_counts.get("still_hot", 0)),
        "dropped_from_hot": int(bucket_counts.get("dropped_from_hot", 0)),
        "new_hot": int(bucket_counts.get("new_hot", 0)),
        "dropped_by_tag": tag_counts,
        "investigate_count": int(
            compared.loc[compared["Change Tag"] == "investigate_coaching_lead_demoted"].shape[0]
        ),
        "intentional_sparse_subscriber": int(
            compared.loc[compared["Change Tag"] == "intentional_sparse_subscriber_cap"].shape[0]
        ),
        "previous_hot_tier_counts": int(
            compared.loc[compared["Previous AI Tier"].astype(str).str.strip() == "Hot"].shape[0]
        )
        if "Previous AI Tier" in compared.columns
        else 0,
        "current_hot_tier_counts": int(
            compared.loc[compared["AI Tier"].astype(str).str.strip() == "Hot"].shape[0]
        ),
    }


def export_comparison_report(
    old_path: Path | str | None = None,
    new_path: Path | str | None = None,
    old_df: pd.DataFrame | None = None,
    new_df: pd.DataFrame | None = None,
    output_dir: Path | str | None = None,
) -> dict[str, Any]:
    """Write multi-sheet Excel report and return paths + summary."""
    output_dir = Path(output_dir or COMPARE_OUTPUT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    if old_df is None:
        if old_path is None:
            raise ValueError("Provide old_path or old_df.")
        old_df = load_old_scores(old_path)
    new_df_loaded = load_new_scores(new_path, df=new_df)
    compared = build_tier_comparison(old_df, new_df_loaded)

    summary = summarize_comparison(compared)

    front_cols = [
        "Email",
        "First Name",
        "Last Name",
        "Lifecycle Stage",
        "Previous AI Tier",
        "AI Tier",
        "Tier Change",
        "Previous AI Score",
        "AI Score",
        "Score Delta",
        "ML Score",
        "LLM Score",
        "Hot Change Bucket",
        "Change Tag",
        "AI Reasons",
    ] + REVIEW_COLUMNS

    ordered = [c for c in front_cols if c in compared.columns] + [
        c for c in compared.columns if c not in front_cols
    ]
    compared = compared[ordered]

    out_path = output_dir / "hot_tier_comparison.xlsx"
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        compared.loc[compared["Hot Change Bucket"] == "dropped_from_hot"].to_excel(
            writer, sheet_name="Dropped from Hot", index=False
        )
        compared.loc[compared["Hot Change Bucket"] == "new_hot"].to_excel(
            writer, sheet_name="New Hot", index=False
        )
        compared.loc[compared["Hot Change Bucket"] == "still_hot"].to_excel(
            writer, sheet_name="Still Hot", index=False
        )
        compared.loc[compared["Change Tag"] == "investigate_coaching_lead_demoted"].to_excel(
            writer, sheet_name="Investigate Demotions", index=False
        )
        compared.loc[compared["Change Tag"] == "intentional_sparse_subscriber_cap"].to_excel(
            writer, sheet_name="Intentional Subscriber Caps", index=False
        )
        review_pool = compared[
            compared["Hot Change Bucket"].isin(["still_hot", "new_hot", "dropped_from_hot"])
        ].head(30)
        review_pool.to_excel(writer, sheet_name="Client Review Template", index=False)
        compared.to_excel(writer, sheet_name="All Compared", index=False)

        pd.DataFrame(
            [{"metric": k, "value": v} for k, v in summary.items() if not isinstance(v, dict)]
            + [{"metric": f"dropped_{k}", "value": v} for k, v in summary.get("dropped_by_tag", {}).items()]
        ).to_excel(writer, sheet_name="Summary", index=False)

    return {"output_path": str(out_path), "summary": summary, "row_count": len(compared)}
