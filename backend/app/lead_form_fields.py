"""Wufoo form fields — labels match the live coaching intake form."""

from __future__ import annotations

from typing import Any

import pandas as pd

# (column name in lead row, label shown to reps)
LEAD_FORM_FIELDS: list[tuple[str, str]] = [
    ("Email", "Email"),
    ("Job Title", "Which best describes you"),
    ("Phone Number", "Cell phone number"),
    ("State/Region", "State"),
    ("Wrestler's Grade", "Wrestler's grade"),
    ("Years experience", "Years of experience"),
    ("Wrestler's Goal", "Wrestler's goal"),
    ("Deadline for Goal", "Deadline for this goal"),
    ("Job function", "Reason for inquiry"),
    ("Relationship Status", "How willing to start mindset training"),
    ("Source", "Where did you hear about Wrestling Mindset"),
    ("Investment Level", "Preferred investment level"),
    ("Message", "Additional wrestling information"),
    ("UTM Source", "UTM source"),
    ("UTM Medium", "UTM medium"),
    ("UTM Campaign", "UTM campaign"),
    ("UTM Term", "UTM term"),
    ("UTM Content", "UTM content"),
]

FORM_COLUMN_NAMES = ["First Name", "Last Name", *[k for k, _ in LEAD_FORM_FIELDS]]

# Wufoo webhooks sometimes send field titles instead of (or alongside) FieldN ids.
FORM_LABEL_TO_COLUMN: dict[str, str] = {label: key for key, label in LEAD_FORM_FIELDS}
FORM_LABEL_TO_COLUMN.update(
    {
        "Phone Number": "Phone Number",
        "State/Region": "State/Region",
        "Wrestler's Goal": "Wrestler's Goal",
        "Deadline for Goal": "Deadline for Goal",
        "Job function": "Job function",
        "Job Title": "Job Title",
        "Relationship Status": "Relationship Status",
        "Investment Level": "Investment Level",
        "Message": "Message",
        "Source": "Source",
    }
)


def _safe_str(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def lead_display_name(row: pd.Series | dict[str, Any]) -> str:
    get = row.get if isinstance(row, dict) else row.get
    first = _safe_str(get("First Name", ""))
    last = _safe_str(get("Last Name", ""))
    name = f"{first} {last}".strip()
    return name or _safe_str(get("Email", "")) or "Lead"


def form_entries_for_row(
    row: pd.Series | dict[str, Any],
    *,
    include_empty: bool = False,
) -> list[tuple[str, str]]:
    """Label/value pairs for form submission. Skips empty unless include_empty=True."""
    get = row.get if isinstance(row, dict) else row.get
    out: list[tuple[str, str]] = []
    name = lead_display_name(row)
    if name and name != "Lead":
        out.append(("Name", name))
    for key, label in LEAD_FORM_FIELDS:
        val = _safe_str(get(key, ""))
        if val or include_empty:
            out.append((label, val))
    return out
