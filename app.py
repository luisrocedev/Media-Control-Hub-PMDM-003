import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "media_control.sqlite3"

app = Flask(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def seed_media(connection: sqlite3.Connection) -> None:
    existing = connection.execute("SELECT COUNT(*) as total FROM media_items").fetchone()["total"]
    if existing:
        return

    samples = [
        ("Muestra MP3 3s", "audio", "https://samplelib.com/lib/preview/mp3/sample-3s.mp3", 3, "Demo"),
        ("Muestra MP3 6s", "audio", "https://samplelib.com/lib/preview/mp3/sample-6s.mp3", 6, "Demo"),
        ("Muestra MP4 5s", "video", "https://samplelib.com/lib/preview/mp4/sample-5s.mp4", 5, "Demo"),
        ("Muestra MP4 10s", "video", "https://samplelib.com/lib/preview/mp4/sample-10s.mp4", 10, "Demo"),
    ]
    connection.executemany(
        """
        INSERT INTO media_items (title, kind, source_url, duration_seconds, genre, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [(title, kind, source, duration, genre, now_iso()) for title, kind, source, duration, genre in samples],
    )


def init_db() -> None:
    with get_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS operators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                dni TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS media_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('audio', 'video')),
                source_url TEXT NOT NULL,
                duration_seconds INTEGER DEFAULT 0,
                genre TEXT DEFAULT 'General',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playback_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operator_id INTEGER NOT NULL,
                media_item_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                last_position REAL DEFAULT 0,
                completed INTEGER DEFAULT 0,
                FOREIGN KEY(operator_id) REFERENCES operators(id),
                FOREIGN KEY(media_item_id) REFERENCES media_items(id)
            );

            CREATE TABLE IF NOT EXISTS playback_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                position REAL DEFAULT 0,
                payload_json TEXT DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES playback_sessions(id)
            );
            """
        )
        seed_media(connection)


@app.get("/")
def home():
    return render_template("index.html")


@app.post("/api/operators/register")
def register_operator():
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()
    dni = str(body.get("dni", "")).strip().upper()

    if not name or not dni:
        return jsonify({"ok": False, "error": "Nombre y DNI son obligatorios."}), 400

    with get_db() as connection:
        cursor = connection.execute(
            "INSERT INTO operators (name, dni, created_at) VALUES (?, ?, ?)",
            (name, dni, now_iso()),
        )
        operator_id = cursor.lastrowid

    return jsonify({"ok": True, "operatorId": operator_id, "name": name, "dni": dni})


@app.get("/api/media")
def media_library():
    kind = request.args.get("kind")

    query = "SELECT * FROM media_items"
    params: list[str] = []
    if kind in {"audio", "video"}:
        query += " WHERE kind = ?"
        params.append(kind)
    query += " ORDER BY id DESC"

    with get_db() as connection:
        rows = connection.execute(query, params).fetchall()

    return jsonify({"ok": True, "items": [dict(row) for row in rows]})


@app.post("/api/media")
def add_media():
    body = request.get_json(silent=True) or {}
    title = str(body.get("title", "")).strip()
    kind = str(body.get("kind", "")).strip().lower()
    source_url = str(body.get("sourceUrl", "")).strip()
    duration_seconds = int(body.get("durationSeconds", 0) or 0)
    genre = str(body.get("genre", "General")).strip() or "General"

    if not title or kind not in {"audio", "video"} or not source_url:
        return jsonify({"ok": False, "error": "Datos de medio incompletos."}), 400

    with get_db() as connection:
        cursor = connection.execute(
            """
            INSERT INTO media_items (title, kind, source_url, duration_seconds, genre, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (title, kind, source_url, duration_seconds, genre, now_iso()),
        )

    return jsonify({"ok": True, "mediaId": cursor.lastrowid})


@app.post("/api/sessions/start")
def start_session():
    body = request.get_json(silent=True) or {}
    operator_id = body.get("operatorId")
    media_item_id = body.get("mediaItemId")

    if not operator_id or not media_item_id:
        return jsonify({"ok": False, "error": "operatorId y mediaItemId son obligatorios."}), 400

    with get_db() as connection:
        cursor = connection.execute(
            """
            INSERT INTO playback_sessions (operator_id, media_item_id, started_at)
            VALUES (?, ?, ?)
            """,
            (operator_id, media_item_id, now_iso()),
        )

    return jsonify({"ok": True, "sessionId": cursor.lastrowid})


@app.post("/api/sessions/event")
def log_event():
    body = request.get_json(silent=True) or {}
    session_id = body.get("sessionId")
    event_type = str(body.get("eventType", "")).strip()
    position = float(body.get("position", 0) or 0)
    payload = body.get("payload", {})

    if not session_id or not event_type:
        return jsonify({"ok": False, "error": "sessionId y eventType son obligatorios."}), 400

    with get_db() as connection:
        connection.execute(
            """
            INSERT INTO playback_events (session_id, event_type, position, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, event_type, position, json.dumps(payload, ensure_ascii=False), now_iso()),
        )

    return jsonify({"ok": True})


@app.post("/api/sessions/end")
def end_session():
    body = request.get_json(silent=True) or {}
    session_id = body.get("sessionId")
    last_position = float(body.get("lastPosition", 0) or 0)
    completed = 1 if body.get("completed") else 0

    if not session_id:
        return jsonify({"ok": False, "error": "sessionId es obligatorio."}), 400

    with get_db() as connection:
        connection.execute(
            """
            UPDATE playback_sessions
            SET ended_at = ?, last_position = ?, completed = ?
            WHERE id = ?
            """,
            (now_iso(), last_position, completed, session_id),
        )

    return jsonify({"ok": True})


@app.get("/api/operators/<int:operator_id>/history")
def operator_history(operator_id: int):
    limit = int(request.args.get("limit", 8) or 8)

    with get_db() as connection:
        sessions = connection.execute(
            """
            SELECT ps.id, ps.started_at, ps.ended_at, ps.last_position, ps.completed,
                   mi.title, mi.kind, mi.genre
            FROM playback_sessions ps
            JOIN media_items mi ON mi.id = ps.media_item_id
            WHERE ps.operator_id = ?
            ORDER BY ps.id DESC
            LIMIT ?
            """,
            (operator_id, limit),
        ).fetchall()

    return jsonify({"ok": True, "sessions": [dict(row) for row in sessions]})


@app.get("/api/leaderboard")
def leaderboard():
    with get_db() as connection:
        rows = connection.execute(
            """
            SELECT
                o.id,
                o.name,
                o.dni,
                COUNT(ps.id) AS total_sessions,
                COALESCE(SUM(ps.completed), 0) AS completions,
                ROUND(COALESCE(AVG(ps.last_position), 0), 2) AS avg_position
            FROM operators o
            LEFT JOIN playback_sessions ps ON ps.operator_id = o.id
            GROUP BY o.id, o.name, o.dni
            ORDER BY completions DESC, total_sessions DESC, avg_position DESC
            LIMIT 10
            """
        ).fetchall()

    return jsonify({"ok": True, "leaders": [dict(row) for row in rows]})


@app.get("/api/stats")
def stats():
    with get_db() as connection:
        totals = connection.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM media_items) AS media_total,
                (SELECT COUNT(*) FROM operators) AS operators_total,
                (SELECT COUNT(*) FROM playback_sessions) AS sessions_total,
                (SELECT COUNT(*) FROM playback_events) AS events_total
            """
        ).fetchone()

    return jsonify({"ok": True, "stats": dict(totals)})


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "db": DB_PATH.name, "utc": now_iso()})


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5070)
