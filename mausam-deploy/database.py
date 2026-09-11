"""
database.py — SQLite persistence for Mausam Next-Gen application.
Stores user authentication, profile preferences, personas, and crowdsourced reports.
"""
import sqlite3
import hashlib
import os
import json
import uuid
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "mausam.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str, salt: str = "mausam_secret_salt_2026") -> str:
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


def init_db():
    conn = get_connection()
    c = conn.cursor()
    
    # Users table
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'User',
        location TEXT DEFAULT 'Bengaluru, KA',
        avatar_url TEXT DEFAULT NULL,
        personas TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Active sessions table
    c.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    # Crowdsourced hazard reports table
    c.execute("""
    CREATE TABLE IF NOT EXISTS flood_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        hazard_type TEXT NOT NULL,
        depth TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()

    # Seed demo users if empty
    c.execute("SELECT COUNT(*) FROM users")
    count = c.fetchone()[0]
    if count == 0:
        seed_users = [
            (
                "vikram",
                "vikram@mausam.in",
                hash_password("password123"),
                "Vikram S.",
                "Farmer & Health Conscious",
                "Bengaluru, KA",
                None,
                json.dumps({
                    "HEALTH": True,
                    "FITNESS": False,
                    "COMMUTER": True,
                    "AGRIMET": True,
                    "COASTAL": True,
                    "TRAVELER": True,
                })
            ),
            (
                "priya",
                "priya@mausam.in",
                hash_password("password123"),
                "Priya Sharma",
                "Agri-Scientist",
                "Manduri, Bengaluru Rural",
                None,
                json.dumps({
                    "HEALTH": True,
                    "FITNESS": True,
                    "COMMUTER": False,
                    "AGRIMET": True,
                    "COASTAL": False,
                    "TRAVELER": False,
                })
            ),
            (
                "arjun",
                "arjun@mausam.in",
                hash_password("password123"),
                "Arjun Patel",
                "Outdoor Fitness Enthusiast",
                "Whitefield, Bengaluru",
                None,
                json.dumps({
                    "HEALTH": True,
                    "FITNESS": True,
                    "COMMUTER": True,
                    "AGRIMET": False,
                    "COASTAL": False,
                    "TRAVELER": True,
                })
            ),

        ]
        c.executemany("""
        INSERT INTO users (username, email, password_hash, full_name, role, location, avatar_url, personas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_users)
        conn.commit()
    
    conn.close()


def register_user(username: str, email: str, password: str, full_name: str, location: str = "Bengaluru, KA") -> dict:
    conn = get_connection()
    c = conn.cursor()
    try:
        pw_hash = hash_password(password)
        default_personas = json.dumps({
            "HEALTH": True,
            "FITNESS": False,
            "COMMUTER": True,
            "AGRIMET": True,
            "COASTAL": True,
            "TRAVELER": True,
        })
        c.execute("""
        INSERT INTO users (username, email, password_hash, full_name, location, personas)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (username.strip().lower(), email.strip().lower(), pw_hash, full_name.strip(), location.strip(), default_personas))
        user_id = c.lastrowid
        conn.commit()

        token = str(uuid.uuid4())
        c.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
        conn.commit()

        c.execute("SELECT id, username, email, full_name, role, location, avatar_url, personas FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        return {
            "ok": True,
            "token": token,
            "user": {
                "id": row["id"],
                "username": row["username"],
                "email": row["email"],
                "full_name": row["full_name"],
                "role": row["role"],
                "location": row["location"],
                "avatar_url": row["avatar_url"],
                "personas": json.loads(row["personas"]),
            }
        }
    except sqlite3.IntegrityError as e:
        return {"ok": False, "error": "Username or email already exists."}
    finally:
        conn.close()


def authenticate_user(username_or_email: str, password: str) -> dict:
    conn = get_connection()
    c = conn.cursor()
    target = username_or_email.strip().lower()
    pw_hash = hash_password(password)

    c.execute("""
    SELECT id, username, email, password_hash, full_name, role, location, avatar_url, personas
    FROM users
    WHERE username = ? OR email = ?
    """, (target, target))
    row = c.fetchone()

    if not row or row["password_hash"] != pw_hash:
        conn.close()
        return {"ok": False, "error": "Invalid username/email or password."}

    user_id = row["id"]
    token = str(uuid.uuid4())
    c.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    conn.commit()

    res = {
        "ok": True,
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "full_name": row["full_name"],
            "role": row["role"],
            "location": row["location"],
            "avatar_url": row["avatar_url"],
            "personas": json.loads(row["personas"]),
        }
    }
    conn.close()
    return res


def get_user_by_token(token: str) -> dict:
    if not token:
        return None
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
    SELECT u.id, u.username, u.email, u.full_name, u.role, u.location, u.avatar_url, u.personas
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
    """, (token,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "location": row["location"],
        "avatar_url": row["avatar_url"],
        "personas": json.loads(row["personas"]),
    }


def update_user_personas(user_id: int, personas: dict):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET personas = ? WHERE id = ?", (json.dumps(personas), user_id))
    conn.commit()
    conn.close()


def list_users() -> list:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, username, email, full_name, role, location, avatar_url, personas FROM users ORDER BY id ASC")
    rows = c.fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "username": r["username"],
            "email": r["email"],
            "full_name": r["full_name"],
            "role": r["role"],
            "location": r["location"],
            "avatar_url": r["avatar_url"],
            "personas": json.loads(r["personas"]),
        }
        for r in rows
    ]


def record_flood_report(user_id: int, lat: float, lon: float, hazard_type: str, depth: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
    INSERT INTO flood_reports (user_id, lat, lon, hazard_type, depth)
    VALUES (?, ?, ?, ?, ?)
    """, (user_id, lat, lon, hazard_type, depth))
    conn.commit()
    conn.close()


# Auto-initialize database on import
init_db()
