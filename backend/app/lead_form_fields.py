"""Wufoo form fields — labels match the live coaching intake form."""

from __future__ import annotations

import re
from typing import Any

import pandas as pd

# (column name in lead row, label shown to reps in email / UI)
LEAD_FORM_FIELDS: list[tuple[str, str]] = [
    ("First Name", "First Name"),
    ("Last Name", "Last Name"),
    ("Email", "Email"),
    ("Phone Number", "Cell Phone Number (Parent)"),
    ("Job Title", "Which best describes you"),
    ("State/Region", "State"),
    ("Wrestler's Grade", "Wrestler's Grade"),
    ("Years experience", "Years of Experience"),
    ("Wrestler's Goal", "Wrestler's Goal"),
    ("Deadline for Goal", "Is there a deadline for this goal?"),
    ("Job function", "Reason for Inquiry"),
    ("Relationship Status", "How willing is your wrestler to start mindset training?"),
    ("Membership Notes", "Where did you hear about Wrestling Mindset?"),
    ("Investment Level", "Preferred investment level"),
    ("Club/Team Promo Code", "Club/Team Promo Code"),
    ("Message", "Additional wrestling information"),
    ("UTM Source", "UTM Source"),
    ("UTM Medium", "UTM Medium"),
    ("UTM Campaign", "UTM Campaign"),
    ("UTM Term", "UTM Term"),
    ("UTM Content", "UTM Content"),
    ("UTM Keyword", "UTM Keyword"),
]

FORM_COLUMN_NAMES = ["First Name", "Last Name", *[k for k, _ in LEAD_FORM_FIELDS]]

# Wufoo webhook/API field titles (and legacy labels) → qualifier column.
WUFOO_TITLE_ALIASES: dict[str, str] = {
    "Which best describes you": "Job Title",
    "Which best describes you...": "Job Title",
    "Cell phone number": "Phone Number",
    "Cell Phone Number (Parent)": "Phone Number",
    "Wrestler's grade": "Wrestler's Grade",
    "Wrestler(s) Grade": "Wrestler's Grade",
    "Years of experience": "Years experience",
    "Wrestler's goal": "Wrestler's Goal",
    "Deadline for this goal": "Deadline for Goal",
    "Is there a deadline for this goal?": "Deadline for Goal",
    "Reason for inquiry": "Job function",
    "Reason for Inquiry": "Job function",
    "Reason for Inquiry (choose one)": "Job function",
    "How willing to start mindset training": "Relationship Status",
    "How willing is your wrestler to start mindset training?": "Relationship Status",
    "Where did you hear about Wrestling Mindset": "Membership Notes",
    "Where did you hear about Winning Mindset?": "Membership Notes",
    "Primary sport involved with...": "Sport",
    "Select a Choice": "Customer Type",
    "Info about your Team(s) or Athlete (i.e. location, size, competitive level, struggles, other teams your work with, etc.)": "Message",
    "Preferred investment level": "Investment Level",
    "Which best describes your preferred investment level?": "Investment Level",
    "What level of investment are you ready to make to achieve your goals?": "Investment Level",
    "Additional wrestling information": "Message",
    "Additional wrestler information": "Message",
    "Additional wrestler/team info (i.e. location, competitive level, struggles, etc.)": "Message",
    "Phone Number": "Phone Number",
    "State/Region": "State/Region",
    "Job Title": "Job Title",
    "Job function": "Job function",
    "Relationship Status": "Relationship Status",
    "Investment Level": "Investment Level",
    "Message": "Message",
    "Source": "Source",
    "UTM source": "UTM Source",
    "UTM medium": "UTM Medium",
    "UTM campaign": "UTM Campaign",
    "UTM term": "UTM Term",
    "UTM content": "UTM Content",
    "UTM keyword": "UTM Keyword",
    "Club/Team Promo Code": "Club/Team Promo Code",
}

FORM_LABEL_TO_COLUMN: dict[str, str] = {label: key for key, label in LEAD_FORM_FIELDS}
FORM_LABEL_TO_COLUMN.update(WUFOO_TITLE_ALIASES)


def normalize_wufoo_title(title: str) -> str:
    """Strip required-field markers and extra whitespace from Wufoo titles."""
    t = str(title).strip().rstrip("*").strip()
    t = re.sub(r"\.{2,}\s*$", "", t).strip()
    return re.sub(r"\s+", " ", t)


def column_for_wufoo_title(title: str) -> str | None:
    """Resolve a Wufoo field title to a qualifier column name."""
    raw = str(title).strip()
    norm = normalize_wufoo_title(raw)
    for key in (raw, norm):
        col = FORM_LABEL_TO_COLUMN.get(key)
        if col:
            return col
    return None


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


def parse_display_fields(raw: object) -> list[tuple[str, str]]:
    """Parse wufoo_forms.json display_fields: [[column, label], ...] or {column, label} objects."""
    if not raw or not isinstance(raw, list):
        return []
    out: list[tuple[str, str]] = []
    for item in raw:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            col, label = _safe_str(item[0]), _safe_str(item[1])
        elif isinstance(item, dict):
            col = _safe_str(item.get("column") or item.get("key") or item.get("field"))
            label = _safe_str(item.get("label") or item.get("title") or col)
        else:
            continue
        if col and label:
            out.append((col, label))
    return out


def default_display_fields() -> list[tuple[str, str]]:
    return list(LEAD_FORM_FIELDS)


def display_fields_for_form(form_config: dict[str, Any] | None) -> list[tuple[str, str]]:
    """Per-form email / n8n field list; falls back to Form 1 defaults."""
    if form_config:
        parsed = parse_display_fields(form_config.get("display_fields"))
        if parsed:
            return parsed
    return default_display_fields()


def resolve_form_config_for_row(
    row: pd.Series | dict[str, Any],
    form_config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Use explicit form config or look up Wufoo Form Id stored on the lead row."""
    if form_config:
        return form_config
    get = row.get if isinstance(row, dict) else row.get
    form_id = _safe_str(get("Wufoo Form Id", ""))
    if not form_id:
        return None
    from .wufoo_forms import get_form

    return get_form(form_id)


def form_entries_for_row(
    row: pd.Series | dict[str, Any],
    *,
    form_config: dict[str, Any] | None = None,
    include_empty: bool = False,
) -> list[tuple[str, str]]:
    """Label/value pairs for form submission. Skips empty unless include_empty=True."""
    get = row.get if isinstance(row, dict) else row.get
    resolved = resolve_form_config_for_row(row, form_config)
    fields = display_fields_for_form(resolved)

    out: list[tuple[str, str]] = []
    has_name_cols = any(key in ("First Name", "Last Name") for key, _ in fields)
    if not has_name_cols:
        name = lead_display_name(row)
        if name and name != "Lead":
            out.append(("Name", name))

    for key, label in fields:
        val = _safe_str(get(key, ""))
        if val or include_empty:
            out.append((label, val))
    return out
