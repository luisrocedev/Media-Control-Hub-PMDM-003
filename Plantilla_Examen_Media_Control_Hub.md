# Plantilla de Estudio — Examen Media Control Hub (PMDM-003)

> **Alumno:** Luis Jahir Rodríguez Cedeño · DNI: 53945291X · DAM2 2025/26

---

## 1 · HTML5 Media API

**Conceptos clave:**

- `<video>` y `<audio>` — elementos nativos del navegador para reproducción multimedia.
- Atributos principales: `src`, `controls`, `autoplay`, `loop`, `muted`, `preload`.
- API JavaScript: `play()`, `pause()`, `load()`, `currentTime`, `duration`, `volume`, `playbackRate`, `paused`, `ended`.
- Eventos clave: `timeupdate`, `play`, `pause`, `ended`, `loadedmetadata`, `error`.

**Snippet — reproductor custom:**

```javascript
const player = document.getElementById("videoPlayer");

// Controles
await player.play(); // Reproducir
player.pause(); // Pausar
player.currentTime = 0; // Rebobinar
player.currentTime += 10; // Adelantar 10 s
player.volume = 0.8; // Volumen 80 %
player.playbackRate = 1.5; // Velocidad 1.5×

// Progreso
player.addEventListener("timeupdate", () => {
  const pct = (player.currentTime / player.duration) * 100;
  progressFill.style.width = `${pct}%`;
  timeInfo.textContent = `${fmt(player.currentTime)} / ${fmt(player.duration)}`;
});

// Detección de fin
player.addEventListener("ended", () => {
  console.log("Reproducción completada");
});
```

**Diferencia `<video>` vs `<audio>`:**

- Misma API JavaScript; la diferencia es visual (video muestra fotogramas).
- Se puede switchar con `display: none/block` según `item.kind`.

---

## 2 · Controles personalizados (no usar `controls` nativo)

**Patrón:** ocultar controles nativos, crear botones propios y conectar vía JS.

```html
<video id="videoPlayer"></video>
<!-- sin atributo controls -->

<div class="controls">
  <button id="btnPlay">▶</button>
  <button id="btnPause">⏸</button>
  <button id="btnStop">⏹</button>
  <button id="btnBack">⏪ −10s</button>
  <button id="btnForward">⏩ +10s</button>
  <select id="speed">
    <option value="0.5">0.5×</option>
    <option value="1" selected>1×</option>
    <option value="2">2×</option>
  </select>
  <input type="range" id="volume" min="0" max="1" step="0.01" value="1" />
</div>
```

**Barra de progreso custom (click-to-seek con div):**

```javascript
progressBar.addEventListener("click", (e) => {
  const rect = progressBar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  player.currentTime = pct * player.duration;
});
```

---

## 3 · Backend Flask + SQLite

**Esquema de 4 tablas:**

```sql
CREATE TABLE operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dni TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE media_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('audio','video')),
  source_url TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  genre TEXT DEFAULT 'General',
  created_at TEXT NOT NULL
);

CREATE TABLE playback_sessions (
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

CREATE TABLE playback_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  position REAL DEFAULT 0,
  payload_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES playback_sessions(id)
);
```

**Patrón de endpoint Flask:**

```python
@app.post("/api/sessions/event")
def log_event():
    body = request.get_json(silent=True) or {}
    session_id = body.get("sessionId")
    event_type = str(body.get("eventType", "")).strip()
    position = float(body.get("position", 0) or 0)
    payload = body.get("payload", {})

    if not session_id or not event_type:
        return jsonify({"ok": False, "error": "Faltan campos"}), 400

    with get_db() as conn:
        conn.execute(
            "INSERT INTO playback_events (session_id, event_type, position, payload_json, created_at) VALUES (?,?,?,?,?)",
            (session_id, event_type, position, json.dumps(payload), now_iso()),
        )
    return jsonify({"ok": True})
```

**Patrón de conexión SQLite:**

```python
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # ← acceso por nombre de columna
    return conn
```

---

## 4 · Telemetría de eventos

**Flujo completo:**

1. **Registro de operador** → `POST /api/operators/register` → obtiene `operatorId`.
2. **Cargar medio** → `POST /api/sessions/start` → obtiene `sessionId`.
3. **Cada interacción** → `POST /api/sessions/event` con `{sessionId, eventType, position, payload}`.
4. **Fin de sesión** → `POST /api/sessions/end` con `{sessionId, lastPosition, completed}`.

**Tipos de evento registrados:** `load`, `play`, `pause`, `stop`, `seek`, `speed`, `volume`, `ended`.

```javascript
async function pushEvent(eventType, payload = {}) {
  if (!state.currentSessionId) return;
  const player = activePlayer();
  await api("/api/sessions/event", {
    method: "POST",
    body: JSON.stringify({
      sessionId: state.currentSessionId,
      eventType,
      position: player.currentTime || 0,
      payload,
    }),
  });
}
```

---

## 5 · Leaderboard con JOIN + GROUP BY

```sql
SELECT
    o.id, o.name, o.dni,
    COUNT(ps.id) AS total_sessions,
    COALESCE(SUM(ps.completed), 0) AS completions,
    ROUND(COALESCE(AVG(ps.last_position), 0), 2) AS avg_position
FROM operators o
LEFT JOIN playback_sessions ps ON ps.operator_id = o.id
GROUP BY o.id, o.name, o.dni
ORDER BY completions DESC, total_sessions DESC
LIMIT 10
```

**Puntos clave:**

- `LEFT JOIN` para incluir operadores sin sesiones.
- `COALESCE` evita `NULL` en agregaciones vacías.
- `GROUP BY` agrupa por operador para contar sesiones.

---

## 6 · Gestión de estado en el cliente

```javascript
const state = {
  operatorId: null, // ID del operador activo
  operatorName: "", // Nombre mostrado
  currentMedia: null, // Objeto {id, title, kind, source_url, ...}
  currentSessionId: null, // Sesión de reproducción activa
};
```

**Patrón `activePlayer()`:**

```javascript
function activePlayer() {
  return state.currentMedia?.kind === "audio" ? el.audio : el.video;
}
```

**Switch visual audio/video:**

```javascript
function switchTo(kind) {
  if (kind === "audio") {
    el.video.style.display = "none";
    el.audio.style.display = "block";
    el.video.pause();
  } else {
    el.audio.style.display = "none";
    el.video.style.display = "block";
    el.audio.pause();
  }
}
```

---

## 7 · 14 Mejoras Design System v2

| #   | Mejora                | Palabra clave                                             |
| --- | --------------------- | --------------------------------------------------------- |
| 1   | Custom Properties     | `--clr-primary`, `:root`, CSS variables                   |
| 2   | Tema claro/oscuro     | `html.light`, `localStorage`, `.theme-toggle`             |
| 3   | LED de reproducción   | `.playing-dot`, `@keyframes pulse`, `classList.toggle`    |
| 4   | Barra progreso custom | `.progress-bar`, `getBoundingClientRect()`, click-to-seek |
| 5   | Badges de tipo        | `.badge-kind.audio`, `.badge-kind.video`                  |
| 6   | Badges completado     | `.badge-completed.yes`, `.badge-completed.no`             |
| 7   | Badges ranking        | `.rank-badge.gold/.silver/.bronze`                        |
| 8   | Toasts                | `showToast(msg, type)`, `animationend`, auto-remove       |
| 9   | Atajos teclado        | `document.addEventListener('keydown')`, `e.code`          |
| 10  | Seed datos            | `POST /api/seed`, `random.choice`, sesiones demo          |
| 11  | Exportar JSON         | `Blob`, `URL.createObjectURL`, `a.download`               |
| 12  | Importar JSON         | `file.text()`, `JSON.parse`, `POST /api/import`           |
| 13  | Animaciones CSS       | `@keyframes fadeIn/scaleIn/toastUp/pulse`                 |
| 14  | Responsive            | `@media (max-width: 1024px)`, `(max-width: 600px)`        |

---

## 8 · Snippets rápidos para el examen

**Toast system:**

```javascript
function showToast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  toastBox.appendChild(t);
  t.addEventListener("animationend", () => t.remove());
}
```

**Theme toggle con localStorage:**

```javascript
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem("mch-theme", isLight ? "light" : "dark");
}
```

**Keyboard shortcuts:**

```javascript
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  switch (e.code) {
    case "Space":
      e.preventDefault();
      player.paused ? player.play() : player.pause();
      break;
    case "ArrowLeft":
      e.preventDefault();
      player.currentTime -= 5;
      break;
    case "ArrowRight":
      e.preventDefault();
      player.currentTime += 5;
      break;
    case "ArrowUp":
      e.preventDefault();
      player.volume = Math.min(1, player.volume + 0.05);
      break;
    case "ArrowDown":
      e.preventDefault();
      player.volume = Math.max(0, player.volume - 0.05);
      break;
  }
});
```

**Export con Blob:**

```javascript
const blob = new Blob([JSON.stringify(data, null, 2)], {
  type: "application/json",
});
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = `export-${Date.now()}.json`;
a.click();
URL.revokeObjectURL(a.href);
```

**Import con FileReader:**

```javascript
const file = inputEl.files[0];
const text = await file.text();
const json = JSON.parse(text);
await api("/api/import", { method: "POST", body: JSON.stringify(json) });
```

**Seed endpoint Flask:**

```python
@app.post("/api/seed")
def seed_demo():
    with get_db() as conn:
        for name in ["Ana Demo", "Carlos Test"]:
            conn.execute("INSERT INTO operators (name, dni, created_at) VALUES (?,?,?)",
                         (name, f"DEMO-{random.randint(1000,9999)}", now_iso()))
    return jsonify({"ok": True})
```

---

## 9 · Checklist pre-examen

- [ ] Sé crear `<video>` y `<audio>` sin atributo `controls` y conectar botones vía JS.
- [ ] Conozco `play()`, `pause()`, `currentTime`, `duration`, `volume`, `playbackRate`.
- [ ] Sé capturar `timeupdate` para actualizar barra de progreso custom.
- [ ] Puedo escribir un endpoint Flask POST con validación y `jsonify`.
- [ ] Conozco el patrón `sqlite3.connect()` + `row_factory = sqlite3.Row`.
- [ ] Sé hacer `LEFT JOIN` + `GROUP BY` + `COALESCE` para leaderboard.
- [ ] Puedo implementar un sistema de toasts con `animationend`.
- [ ] Conozco `localStorage` para persistir preferencia de tema.
- [ ] Sé manejar `keydown` con `e.code` filtrando inputs.
- [ ] Puedo crear `Blob` + `URL.createObjectURL` para descargar JSON.
- [ ] Sé leer fichero con `file.text()` + `JSON.parse` para importar.
- [ ] Puedo insertar datos demo con `random.choice` en un endpoint `/api/seed`.
