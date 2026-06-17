"""US phone formatting for SMS (Wufoo sends 10-digit cell numbers)."""

from __future__ import annotations

import re


def phone_digits(value: object) -> str:
    return re.sub(r"\D", "", str(value or ""))


def format_us_display(value: object) -> str:
    """10-digit US → 201-214-3366"""
    digits = phone_digits(value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return str(value or "").strip()
    return f"{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"


def format_us_e164(value: object) -> str:
    """10-digit US → +12012143366"""
    digits = phone_digits(value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return ""
    return f"+1{digits}"


def rep_first_name(full_name: object) -> str:
    text = str(full_name or "").strip()
    return text.split()[0] if text else "Your coach"
