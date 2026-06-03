"""App login password — stored as bcrypt hash in SQLite on the data volume."""

from __future__ import annotations

import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import bcrypt

from .config import DATA_DIR

AUTH_DB_PATH = DATA_DIR / "app_auth.db"
DEFAULT_SEED_PASSWORD = "admin123"


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(AUTH_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db() -> None:
    """Create tables and seed password from APP_PASSWORD if missing."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_auth (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                password_hash TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        row = conn.execute("SELECT password_hash FROM app_auth WHERE id = 1").fetchone()
        if row is None:
            seed = os.getenv("APP_PASSWORD", DEFAULT_SEED_PASSWORD).strip() or DEFAULT_SEED_PASSWORD
            set_password_hash(seed, conn=conn)
        conn.commit()


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def get_password_hash() -> str | None:
    with _connect() as conn:
        row = conn.execute("SELECT password_hash FROM app_auth WHERE id = 1").fetchone()
        return str(row["password_hash"]) if row else None


def set_password_hash(password: str, *, conn: sqlite3.Connection | None = None) -> None:
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    hashed = _hash_password(password)
    now = datetime.now(UTC).isoformat()

    if conn is not None:
        conn.execute(
            """
            INSERT INTO app_auth (id, password_hash, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at
            """,
            (hashed, now),
        )
        return

    with _connect() as conn:
        set_password_hash(password, conn=conn)
        conn.commit()


def verify_login(password: str) -> bool:
    stored = get_password_hash()
    if not stored:
        return False
    return _verify_password(password, stored)


def change_password(current_password: str, new_password: str) -> None:
    if new_password != new_password.strip():
        raise ValueError("New password cannot have leading or trailing spaces.")
    if len(new_password) < 6:
        raise ValueError("New password must be at least 6 characters.")
    if current_password == new_password:
        raise ValueError("New password must be different from the current password.")

    stored = get_password_hash()
    if not stored or not _verify_password(current_password, stored):
        raise ValueError("Current password is incorrect.")

    set_password_hash(new_password)
