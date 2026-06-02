"""Email notifications when a lead is routed to a sales rep."""

from __future__ import annotations

import os
import re
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr
from typing import Any

import httpx
import pandas as pd

from .features import _safe_str

RAILWAY_SMTP_HINT = (
    "Railway blocks outbound Gmail SMTP on Free and Hobby plans (Network unreachable). "
    "Fix: upgrade Railway to Pro and redeploy, OR set RESEND_API_KEY to send email over HTTPS instead."
)


def _normalize_app_password(value: str) -> str:
    """Google app passwords are 16 chars — users often paste with spaces."""
    return re.sub(r"\s+", "", value.strip())


def _resend_api_key() -> str:
    return os.getenv("RESEND_API_KEY", "").strip()


def _smtp_settings() -> dict[str, str | int]:
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    password = _normalize_app_password(os.getenv("SMTP_PASSWORD", ""))
    from_raw = os.getenv("ROUTING_FROM_EMAIL", user).strip()
    _, from_addr = parseaddr(from_raw)
    from_email = from_addr or user
    port = int(os.getenv("SMTP_PORT", "587") or "587")
    return {
        "host": host,
        "user": user,
        "password": password,
        "from_raw": from_raw,
        "from_email": from_email,
        "port": port,
    }


def email_transport() -> str | None:
    if _resend_api_key():
        return "resend"
    if smtp_configured():
        return "smtp"
    return None


def smtp_configured() -> bool:
    settings = _smtp_settings()
    return bool(settings["host"] and settings["user"] and settings["password"])


def email_configured() -> bool:
    return email_transport() is not None


def _from_header() -> str:
    settings = _smtp_settings()
    from_raw = str(settings["from_raw"])
    from_email = str(settings["from_email"])
    if from_raw:
        return from_raw
    return formataddr(("Leads Wrestling", from_email))


def _smtp_network_error_hint(exc: Exception) -> str | None:
    msg = str(exc).lower()
    if "101" in msg or "network is unreachable" in msg:
        return RAILWAY_SMTP_HINT
    if "timed out" in msg or "timeout" in msg:
        return (
            f"Could not reach the mail server in time. {RAILWAY_SMTP_HINT}"
        )
    return None


def verify_resend_connection() -> dict[str, Any]:
    api_key = _resend_api_key()
    if not api_key:
        return {"ok": False, "error": "RESEND_API_KEY is not set.", "transport": "resend"}

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(
                "https://api.resend.com/domains",
                headers={"Authorization": f"Bearer {api_key}"},
            )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "transport": "resend"}

    if response.status_code == 401:
        return {
            "ok": False,
            "error": "Invalid RESEND_API_KEY.",
            "transport": "resend",
        }
    if response.status_code >= 400:
        detail = response.text[:200]
        return {
            "ok": False,
            "error": f"Resend API error ({response.status_code}): {detail}",
            "transport": "resend",
        }

    data = response.json()
    domains = data.get("data") or []
    verified = [d for d in domains if d.get("status") == "verified"]
    return {
        "ok": True,
        "transport": "resend",
        "domains_verified": len(verified),
        "from": _from_header(),
    }


def verify_smtp_connection() -> dict[str, Any]:
    """Try SMTP login only — used for diagnostics."""
    settings = _smtp_settings()
    host = str(settings["host"])
    user = str(settings["user"])
    password = str(settings["password"])
    port = int(settings["port"])

    if not all([host, user, password]):
        return {
            "ok": False,
            "error": "SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD on Railway.",
            "user": user or None,
            "transport": "smtp",
        }

    try:
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=10, context=context) as server:
                server.login(user, password)
        else:
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(user, password)
    except smtplib.SMTPAuthenticationError as exc:
        code = exc.smtp_code if hasattr(exc, "smtp_code") else None
        hint = (
            "Google rejected the login. The app password must be created while signed in as "
            f"{user} (with 2-Step Verification on). Delete the old app password and create a new one. "
            "If this is Google Workspace, your admin may need to allow app passwords."
        )
        return {"ok": False, "error": hint, "user": user, "smtp_code": code, "transport": "smtp"}
    except OSError as exc:
        hint = _smtp_network_error_hint(exc) or str(exc)
        return {"ok": False, "error": hint, "user": user, "transport": "smtp"}
    except Exception as exc:
        hint = _smtp_network_error_hint(exc) or str(exc)
        return {"ok": False, "error": hint, "user": user, "transport": "smtp"}

    return {"ok": True, "user": user, "host": host, "port": port, "transport": "smtp"}


def verify_email_connection() -> dict[str, Any]:
    transport = email_transport()
    if transport == "resend":
        return verify_resend_connection()
    if transport == "smtp":
        return verify_smtp_connection()
    return {
        "ok": False,
        "error": "Email not configured. Set RESEND_API_KEY or SMTP_* variables on Railway.",
        "transport": None,
    }


def _send_via_resend(to_email: str, subject: str, text: str, html: str) -> None:
    api_key = _resend_api_key()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not set.")

    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": _from_header(),
                "to": [to_email],
                "subject": subject,
                "html": html,
                "text": text,
            },
        )

    if response.status_code >= 400:
        try:
            detail = response.json().get("message", response.text)
        except Exception:
            detail = response.text
        raise RuntimeError(f"Resend send failed: {detail}")


def _send_via_smtp(to_email: str, subject: str, text: str, html: str) -> None:
    settings = _smtp_settings()
    host = str(settings["host"])
    user = str(settings["user"])
    password = str(settings["password"])
    from_raw = str(settings["from_raw"])
    from_email = str(settings["from_email"])
    port = int(settings["port"])

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_raw if from_raw else formataddr(("Leads Wrestling", from_email))
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=30, context=context) as server:
                server.login(user, password)
                server.sendmail(from_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=30) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(user, password)
                server.sendmail(from_email, [to_email], msg.as_string())
    except OSError as exc:
        hint = _smtp_network_error_hint(exc)
        if hint:
            raise RuntimeError(hint) from exc
        raise


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
    """Send assignment email via Resend (HTTPS) or SMTP."""
    to_email = _safe_str(rep.get("email"))
    transport = email_transport()

    if not transport or not to_email:
        raise RuntimeError(
            "Email not configured. Set RESEND_API_KEY or SMTP_* variables on Railway."
        )

    subject, text, html = build_assignment_email(row, rep, assignment)

    if transport == "resend":
        _send_via_resend(to_email, subject, text, html)
    else:
        _send_via_smtp(to_email, subject, text, html)

    return True
