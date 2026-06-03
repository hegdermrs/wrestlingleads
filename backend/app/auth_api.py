"""App authentication API — login and password management."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .auth_store import change_password, init_auth_db, verify_login

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)
    confirm_password: str = Field(min_length=6)


@router.post("/login")
def login(body: LoginRequest) -> dict[str, Any]:
    if verify_login(body.password):
        return {"ok": True}
    raise HTTPException(status_code=401, detail="Incorrect password.")


@router.post("/change-password")
def change_password_route(body: ChangePasswordRequest) -> dict[str, Any]:
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match.")

    try:
        change_password(body.current_password, body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True, "message": "Password updated. Sign in with your new password."}


@router.get("/status")
def auth_status() -> dict[str, Any]:
    from .auth_store import get_password_hash

    return {"password_configured": bool(get_password_hash())}
