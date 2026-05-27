"""Parse HubSpot CRM exports from xlsx/csv into a normalized DataFrame."""

from __future__ import annotations

import io
from typing import BinaryIO

import pandas as pd

HUBSPOT_TITLE_MARKERS = ("hubspot-crm-exports", "record id")


def _normalize_column_name(name: object) -> str:
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return ""
    return str(name).strip()


def _looks_like_hubspot_title_row(row: pd.Series) -> bool:
    first = _normalize_column_name(row.iloc[0]).lower()
    return any(marker in first for marker in HUBSPOT_TITLE_MARKERS)


def _looks_like_header_row(row: pd.Series) -> bool:
    values = [_normalize_column_name(v).lower() for v in row.tolist()]
    return "record id" in values and "lifecycle stage" in values


def detect_header_row(raw: pd.DataFrame) -> int:
    """Return the row index to use as column headers."""
    for idx in range(min(5, len(raw))):
        row = raw.iloc[idx]
        if _looks_like_header_row(row):
            return idx
    return 0


def normalize_headers(headers: list[object]) -> list[str]:
    normalized: list[str] = []
    seen: dict[str, int] = {}
    for header in headers:
        name = _normalize_column_name(header) or "Unnamed"
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 0
        normalized.append(name)
    return normalized


def load_leads_file(source: str | BinaryIO | bytes, filename: str | None = None) -> pd.DataFrame:
    """Load and normalize a HubSpot leads export."""
    if isinstance(source, bytes):
        buffer: BinaryIO = io.BytesIO(source)
    elif isinstance(source, str):
        buffer = source  # type: ignore[assignment]
    else:
        buffer = source

    name = (filename or "").lower()
    if name.endswith(".csv"):
        raw = pd.read_csv(buffer, header=None, dtype=str, keep_default_na=False)
    else:
        raw = pd.read_excel(buffer, header=None, dtype=str, engine="openpyxl", keep_default_na=False)

    if raw.empty:
        return pd.DataFrame()

    header_idx = detect_header_row(raw)
    headers = normalize_headers(raw.iloc[header_idx].tolist())
    data = raw.iloc[header_idx + 1 :].copy()
    data.columns = headers
    data = data.reset_index(drop=True)

    # Drop fully empty rows
    data = data.replace({"": pd.NA, "nan": pd.NA, "NaN": pd.NA})
    data = data.dropna(how="all").reset_index(drop=True)

    return data


def is_positive_lifecycle(lifecycle: object) -> bool:
    if lifecycle is None or (isinstance(lifecycle, float) and pd.isna(lifecycle)):
        return False
    return str(lifecycle).strip() in {"Customer", "Subscriber"}


def build_training_label(df: pd.DataFrame) -> pd.Series:
    """Good lead = Customer or Subscriber, excluding conflicting Unqualified rows."""
    lifecycle = df.get("Lifecycle Stage", pd.Series([pd.NA] * len(df)))
    lead_status = df.get("Lead Status", pd.Series([pd.NA] * len(df)))

    positive = lifecycle.apply(is_positive_lifecycle)
    conflicting = positive & lead_status.astype(str).str.strip().eq("Unqualified")
    label = positive.astype(int)
    label.loc[conflicting] = 0
    return label
