"""Multi-form Wufoo registry — field maps and per-form routing policy."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import BASE_DIR

FORMS_CONFIG_PATH = BASE_DIR / "config" / "wufoo_forms.json"
LEGACY_MAP_PATH = BASE_DIR / "config" / "wufoo_field_map.json"


def _safe_str(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def default_forms_config() -> dict[str, Any]:
    return {"default_form_id": "form-1", "forms": []}


def load_forms_config() -> dict[str, Any]:
    if FORMS_CONFIG_PATH.exists():
        return json.loads(FORMS_CONFIG_PATH.read_text(encoding="utf-8"))
    if LEGACY_MAP_PATH.exists():
        legacy = json.loads(LEGACY_MAP_PATH.read_text(encoding="utf-8"))
        return {
            "default_form_id": "form-1",
            "forms": [
                {
                    "id": "form-1",
                    "label": legacy.get("form", "Form 1"),
                    "wufoo_name": legacy.get("form", ""),
                    "wufoo_hash": legacy.get("form_hash", ""),
                    "webhook_query_form": "form-1",
                    "routing": {
                        "policy": "ai",
                        "score_with_ai": True,
                        "auto_route": True,
                        "send_to_n8n": True,
                        "require_coaching_signals": True,
                    },
                    "field_map": dict(legacy.get("wufoo_to_qualifier_map", {})),
                    "title_map": dict(legacy.get("wufoo_title_to_qualifier_map", {})),
                }
            ],
        }
    return default_forms_config()


def forms_by_id() -> dict[str, dict[str, Any]]:
    config = load_forms_config()
    out: dict[str, dict[str, Any]] = {}
    for form in config.get("forms", []):
        if isinstance(form, dict) and _safe_str(form.get("id")):
            out[_safe_str(form["id"])] = form
    return out


def get_form(form_id: str) -> dict[str, Any] | None:
    return forms_by_id().get(_safe_str(form_id))


def default_form() -> dict[str, Any]:
    config = load_forms_config()
    fid = _safe_str(config.get("default_form_id")) or "form-1"
    return get_form(fid) or next(iter(forms_by_id().values()), {})


def _payload_form_identifiers(payload: dict[str, Any]) -> list[str]:
    """Collect Wufoo form hash / name / url tokens from webhook POST keys."""
    ids: list[str] = []

    def add(value: object) -> None:
        text = _safe_str(value)
        if text and text not in ids:
            ids.append(text)

    for key in ("FormHash", "Hash", "formHash", "FormName", "FormUrl", "Url"):
        add(payload.get(key))

    form_structure = payload.get("FormStructure")
    if form_structure:
        parsed: dict[str, Any] | None = None
        if isinstance(form_structure, dict):
            parsed = form_structure
        elif isinstance(form_structure, str):
            try:
                raw = json.loads(form_structure)
                if isinstance(raw, dict):
                    parsed = raw
            except json.JSONDecodeError:
                pass
        if parsed:
            for key in ("Hash", "Url", "Name"):
                add(parsed.get(key))

    return ids


def _form_from_payload_identifiers(
    payload: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    for token in _payload_form_identifiers(payload):
        for form in by_id.values():
            if token == _safe_str(form.get("wufoo_hash")):
                return form
            if token == _safe_str(form.get("wufoo_name")):
                return form
    return None


def resolve_form(*, query_form: str | None = None, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Pick form config from webhook ?form= id, payload hash/name, or default."""
    by_id = forms_by_id()
    if not by_id:
        return {}

    q = _safe_str(query_form)
    if q and q in by_id:
        return by_id[q]

    payload = payload or {}
    matched = _form_from_payload_identifiers(payload, by_id)
    if matched:
        return matched

    for form in by_id.values():
        qid = _safe_str(form.get("webhook_query_form"))
        if qid and qid in by_id and q == qid:
            return form

    return default_form()


def list_forms_public() -> list[dict[str, Any]]:
    """Summary for UI / docs (no secrets)."""
    rows: list[dict[str, Any]] = []
    for form in load_forms_config().get("forms", []):
        if not isinstance(form, dict):
            continue
        routing = form.get("routing") or {}
        rows.append(
            {
                "id": form.get("id"),
                "label": form.get("label"),
                "wufoo_name": form.get("wufoo_name"),
                "wufoo_hash": form.get("wufoo_hash"),
                "webhook_query_form": form.get("webhook_query_form") or form.get("id"),
                "routing_policy": routing.get("policy", "ai"),
                "fixed_rep_ids": routing.get("fixed_rep_ids") or routing.get("rep_ids") or [],
                "score_with_ai": routing.get("score_with_ai", True),
                "auto_route": routing.get("auto_route", True),
                "send_to_n8n": routing.get("send_to_n8n", True),
                "field_count": len(form.get("field_map") or {}),
                "display_field_count": len(form.get("display_fields") or []),
            }
        )
    return rows


def webhook_url_hint(base_url: str, form: dict[str, Any], secret: str = "") -> str:
    form_key = _safe_str(form.get("webhook_query_form")) or _safe_str(form.get("id"))
    url = f"{base_url.rstrip('/')}/webhooks/wufoo"
    if form_key:
        url += f"?form={form_key}"
    return url
