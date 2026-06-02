"""Email notifications when a lead is routed to a sales rep."""

from __future__ import annotations

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import pandas as pd

from .features import _safe_str


def _lead_field(row: pd.Series | dict[str, Any], key: str) -> str:
    get = row.get if isinstance(row, dict) else row.get
    return _safe_str(get(key, ""))


def _lead_name(row: pd.Series | dict[str, Any]) -> str:
    first = _lead_field(row, "First Name")
    last = _lead_field(row, "Last Name")
    name = f"{first} {last}".strip()
    return name or _lead_field(row, "Email") or "Unknown lead"


def build_assignment_email(
    row: pd.Series | dict[str, Any],
    rep: dict[str, Any],
    assignment: dict[str, Any],
) -> tuple[str, str, str]:
    """Return subject, plain text body, html body."""
    name = _lead_name(row)
    tier = _lead_field(row, "AI Tier")
    score = _lead_field(row, "AI Score")
    bucket = assignment.get("route_bucket", "")
    bucket_label = {
        "urgent": "🔴 Urgent — Red Hot",
        "hot_warm": "🟠 Hot / Very Warm",
        "general": "🔵 General follow-up",
    }.get(bucket, bucket)

    subject = f"[{bucket_label}] New wrestling lead: {name}"

    grade = _lead_field(row, "Wrestler's Grade") or "—"
    goal = _lead_field(row, "Wrestler's Goal") or "—"

    lines = [
        f"Hi {_safe_str(rep.get('name', 'there')).split()[0]},",
        "",
        f"A new lead has been assigned to you ({bucket_label}).",
        f"Reason: {assignment.get('route_reason', '')}",
        "",
        "——— LEAD ———",
        f"Name: {name}",
        f"Email: {_lead_field(row, 'Email')}",
        f"Phone: {_lead_field(row, 'Phone Number') or '—'}",
        f"State: {_lead_field(row, 'State/Region') or '—'}",
        f"Grade: {grade}",
        f"Buyer: {_lead_field(row, 'Job Title') or '—'}",
        f"Readiness: {_lead_field(row, 'Relationship Status') or '—'}",
        f"AI Tier: {tier}  |  Score: {score}",
        "",
        "Goal:",
        goal,
        "",
        "Message:",
        _lead_field(row, "Message") or "—",
        "",
        "Scoring notes:",
        _lead_field(row, "AI Reasons") or "—",
        "",
        "— LeadsWrestling auto-router",
    ]
    text = "\n".join(lines)

    html = f"""<!DOCTYPE html><html><body style="font-family:Segoe UI,sans-serif;line-height:1.5;color:#222;">
<h2>{bucket_label}</h2>
<p><strong>{name}</strong> — {tier} ({score})</p>
<p><em>{assignment.get('route_reason', '')}</em></p>
<table cellpadding="6" style="border-collapse:collapse;">
<tr><td><b>Email</b></td><td>{_lead_field(row, 'Email')}</td></tr>
<tr><td><b>Phone</b></td><td>{_lead_field(row, 'Phone Number') or '—'}</td></tr>
<tr><td><b>State</b></td><td>{_lead_field(row, 'State/Region') or '—'}</td></tr>
<tr><td><b>Grade</b></td><td>{grade}</td></tr>
<tr><td><b>Buyer</b></td><td>{_lead_field(row, 'Job Title') or '—'}</td></tr>
<tr><td><b>Readiness</b></td><td>{_lead_field(row, 'Relationship Status') or '—'}</td></tr>
</table>
<h3>Goal</h3><p>{goal.replace(chr(10), '<br>')}</p>
<h3>Message</h3><p>{(_lead_field(row, 'Message') or '—').replace(chr(10), '<br>')}</p>
<h3>AI notes</h3><p style="color:#555;">{_lead_field(row, 'AI Reasons') or '—'}</p>
</body></html>"""

    return subject, text, html


def send_lead_assignment_email(
    row: pd.Series | dict[str, Any],
    rep: dict[str, Any],
    assignment: dict[str, Any],
) -> bool:
    """Send assignment email via SMTP. Returns True if sent."""
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    from_email = os.getenv("ROUTING_FROM_EMAIL", user).strip()
    to_email = _safe_str(rep.get("email"))

    if not all([host, user, password, from_email, to_email]):
        raise RuntimeError(
            "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, ROUTING_FROM_EMAIL on Railway."
        )

    port = int(os.getenv("SMTP_PORT", "587"))
    subject, text, html = build_assignment_email(row, rep, assignment)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(host, port, timeout=30) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(from_email, [to_email], msg.as_string())

    return True


def smtp_configured() -> bool:
    return bool(
        os.getenv("SMTP_HOST")
        and os.getenv("SMTP_USER")
        and os.getenv("SMTP_PASSWORD")
    )
