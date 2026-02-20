import json
import os
import random
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, render_template, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "media_control.sqlite3"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma",
    "mp4", "webm", "mkv", "avi", "mov", "ogv",
}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE


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


# ─── File upload ───


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _detect_kind(filename: str) -> str:
    ext = filename.rsplit(".", 1)[1].lower()
    audio_exts = {"mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"}
    return "audio" if ext in audio_exts else "video"


@app.post("/api/upload")
def upload_file():
    """Accept a local audio/video file, save it to static/uploads and register in DB."""
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No se envió ningún archivo."}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"ok": False, "error": "Archivo vacío."}), 400

    if not _allowed_file(file.filename):
        return jsonify({"ok": False, "error": f"Extensión no permitida. Usa: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}), 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    safe_name = f"{uuid4().hex[:12]}.{ext}"
    dest = UPLOAD_DIR / safe_name
    file.save(str(dest))

    kind = _detect_kind(file.filename)
    title = request.form.get("title", "").strip() or file.filename.rsplit(".", 1)[0]
    genre = request.form.get("genre", "").strip() or "Local"
    duration = int(request.form.get("durationSeconds", 0) or 0)
    source_url = f"/static/uploads/{safe_name}"

    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO media_items (title, kind, source_url, duration_seconds, genre, created_at) VALUES (?,?,?,?,?,?)",
            (title, kind, source_url, duration, genre, now_iso()),
        )

    return jsonify({"ok": True, "mediaId": cur.lastrowid, "title": title, "kind": kind, "url": source_url})


# ─── v2 endpoints ───


@app.post("/api/seed")
def seed_demo():
    """Generate demo operators, extra media and random sessions."""
    demo_operators = ["Ana Demo", "Carlos Test", "Lucía QA"]
    demo_media = [
        ("Sinfonía Alfa", "audio", "https://samplelib.com/lib/preview/mp3/sample-9s.mp3", 9, "Clásica"),
        ("Clip Beta", "video", "https://samplelib.com/lib/preview/mp4/sample-15s.mp4", 15, "Documental"),
    ]

    with get_db() as conn:
        # Ensure base media exists
        seed_media(conn)

        # Insert demo operators
        op_ids: list[int] = []
        for name in demo_operators:
            cur = conn.execute(
                "INSERT INTO operators (name, dni, created_at) VALUES (?, ?, ?)",
                (name, f"DEMO-{random.randint(1000,9999)}", now_iso()),
            )
            op_ids.append(cur.lastrowid)

        # Extra media
        for title, kind, url, dur, genre in demo_media:
            conn.execute(
                "INSERT INTO media_items (title, kind, source_url, duration_seconds, genre, created_at) VALUES (?,?,?,?,?,?)",
                (title, kind, url, dur, genre, now_iso()),
            )

        # Fetch all media ids
        media_ids = [r["id"] for r in conn.execute("SELECT id FROM media_items").fetchall()]

        # Random sessions
        for op_id in op_ids:
            for _ in range(random.randint(2, 5)):
                mid = random.choice(media_ids)
                completed = random.choice([0, 1])
                pos = round(random.uniform(0, 30), 2)
                cur = conn.execute(
                    "INSERT INTO playback_sessions (operator_id, media_item_id, started_at, ended_at, last_position, completed) VALUES (?,?,?,?,?,?)",
                    (op_id, mid, now_iso(), now_iso(), pos, completed),
                )
                sid = cur.lastrowid
                for evt in ("play", "pause", "stop"):
                    conn.execute(
                        "INSERT INTO playback_events (session_id, event_type, position, payload_json, created_at) VALUES (?,?,?,?,?)",
                        (sid, evt, round(random.uniform(0, pos), 2), "{}", now_iso()),
                    )

    return jsonify({"ok": True, "message": "Demo data seeded."})


@app.post("/api/import")
def import_data():
    """Re-insert media items from a JSON export."""
    body = request.get_json(silent=True) or {}
    items = body.get("media", [])
    if not isinstance(items, list):
        return jsonify({"ok": False, "error": "Se esperaba una lista de medios."}), 400

    inserted = 0
    with get_db() as conn:
        for item in items:
            title = str(item.get("title", "")).strip()
            kind = str(item.get("kind", "")).strip().lower()
            source_url = str(item.get("source_url", "")).strip()
            if not title or kind not in {"audio", "video"} or not source_url:
                continue
            conn.execute(
                "INSERT INTO media_items (title, kind, source_url, duration_seconds, genre, created_at) VALUES (?,?,?,?,?,?)",
                (
                    title,
                    kind,
                    source_url,
                    int(item.get("duration_seconds", 0) or 0),
                    str(item.get("genre", "General")).strip() or "General",
                    now_iso(),
                ),
            )
            inserted += 1

    return jsonify({"ok": True, "imported": inserted})


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5070)
