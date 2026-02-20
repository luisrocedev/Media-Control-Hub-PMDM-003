# 📝 Plantilla Examen PMDM — Media Control Hub
## Actividad 003 · Reproductor Multimedia Personalizado

**Alumno:** Luis Jahir Rodriguez Cedeño
**DNI:** 53945291X
**Módulo:** PMDM — Programación Multimedia y Dispositivos Móviles
**Ciclo:** DAM2 · Curso 2025 / 2026

---

## 1. Descripción del proyecto

Media Control Hub es un reproductor multimedia web con controles personalizados (sin usar el atributo `controls` nativo), backend Flask + SQLite, telemetría de eventos y subida de archivos locales. Usa la HTML5 Media API para reproducir audio y vídeo de forma nativa.

**Puerto:** 5070
**Base de datos:** SQLite (media_control.sqlite3)
**Arquitectura:** SPA con Flask REST API

---

## 2. HTML5 Media API — Conceptos clave

### 2.1 Elementos nativos

```html
<video id="videoPlayer" playsinline preload="metadata"></video>
<audio id="audioPlayer" preload="metadata"></audio>
```

**Explicación:** El navegador proporciona `<video>` y `<audio>` como elementos nativos para reproducción multimedia. NO usamos el atributo `controls` porque creamos controles personalizados con JavaScript. El atributo `playsinline` permite reproducción inline en móviles. `preload="metadata"` carga solo los metadatos (duración, dimensiones) sin descargar todo el archivo.

### 2.2 API JavaScript del reproductor

```javascript
const player = document.getElementById("videoPlayer");

// Propiedades principales
player.currentTime   // Posición actual en segundos
player.duration      // Duración total del medio
player.volume        // Volumen (0.0 a 1.0)
player.playbackRate  // Velocidad (0.5x, 1x, 1.5x, 2x)
player.paused        // Boolean: ¿está pausado?
player.ended         // Boolean: ¿terminó?

// Métodos
await player.play(); // Reproducir (devuelve Promise)
player.pause();      // Pausar
player.load();       // Recargar fuente
```

**Explicación:** Todas las propiedades y métodos son iguales para `<video>` y `<audio>`. La diferencia es solo visual: video muestra fotogramas, audio no. Por eso podemos alternar entre ambos con `display: none/block`.

### 2.3 Eventos de reproducción

```javascript
// Los 6 eventos principales que capturamos:
player.addEventListener("play", () => {});       // Se inicia reproducción
player.addEventListener("pause", () => {});      // Se pausa
player.addEventListener("ended", () => {});      // Llegó al final
player.addEventListener("timeupdate", () => {}); // Progreso (~4 veces/segundo)
player.addEventListener("volumechange", () => {}); // Cambio de volumen
player.addEventListener("seeked", () => {});     // Usuario saltó a otro punto
```

**Explicación:** Estos eventos son la base del tracking. `timeupdate` se dispara constantemente (~250ms) y lo usamos para actualizar la barra de progreso. `ended` lo usamos para marcar la sesión como completada.

---

## 3. Controles personalizados — Código y explicación

### 3.1 Play / Pause / Stop

```javascript
async function play() {
  if (!state.currentMedia) {
    showToast('⚠️ Carga un medio primero', 'warning');
    return;
  }
  const player = activePlayer();
  await player.play();
  setPlayingDot(true);  // Activa el LED verde
  await pushEvent("play", { rate: player.playbackRate, volume: player.volume });
  showToast('▶ Reproduciendo', 'ok');
}

async function pause() {
  const player = activePlayer();
  player.pause();
  setPlayingDot(false);  // Desactiva el LED
  await pushEvent("pause", {});
  showToast('⏸ Pausado', 'info');
}

async function stop() {
  const player = activePlayer();
  player.pause();
  player.currentTime = 0;  // Vuelve al inicio
  setPlayingDot(false);
  el.progressFill.style.width = '0%';
  await pushEvent("stop", {});
  await endSession(false);  // Cierra la sesión (no completada)
  showToast('⏹ Detenido', 'info');
}
```

**Explicación:** `play()` es async porque `player.play()` devuelve una Promise. `stop()` no existe nativamente en HTML5 — lo simulamos con `pause()` + `currentTime = 0`. Cada acción registra un evento de telemetría con `pushEvent()`.

### 3.2 Función activePlayer()

```javascript
function activePlayer() {
  return state.currentMedia?.kind === "audio" ? el.audio : el.video;
}
```

**Explicación:** Patrón Strategy — según el tipo de medio actual, retornamos el elemento `<audio>` o `<video>`. Esto permite que todo el código use `activePlayer()` sin importar qué tipo se está reproduciendo.

### 3.3 Switch visual audio/video

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

**Explicación:** Al cargar un medio, ocultamos el elemento que no corresponde y pausamos al anterior para evitar que suene en segundo plano.

### 3.4 Seek (saltar posición)

```javascript
async function skip(seconds) {
  const player = activePlayer();
  player.currentTime = Math.max(0, (player.currentTime || 0) + seconds);
  await pushEvent("seek", { delta: seconds });
}
```

**Explicación:** `Math.max(0, ...)` evita tiempos negativos. El delta puede ser positivo (+10s) o negativo (-10s).

### 3.5 Barra de progreso custom con click-to-seek

```javascript
// Actualización en tiempo real (evento timeupdate)
player.addEventListener("timeupdate", () => {
  const duration = player.duration || 0;
  const current = player.currentTime || 0;
  const pct = duration > 0 ? (current / duration) * 100 : 0;
  el.progressFill.style.width = `${pct}%`;
  el.timeInfo.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
});

// Click-to-seek: el usuario hace clic en la barra para saltar
el.progressBar.addEventListener("click", async (e) => {
  const player = activePlayer();
  const rect = el.progressBar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  player.currentTime = pct * (player.duration || 0);
  await pushEvent("seek", { absolute: player.currentTime });
});
```

**Explicación:** Usamos un `<div>` en lugar de `<input type="range">` para control total del estilo. `getBoundingClientRect()` nos da la posición del div en pantalla et calculamos el porcentaje de clic relativo al ancho total.

**HTML de la barra:**
```html
<div class="progress-bar" id="progressBar">
  <div class="progress-fill" id="progressFill"></div>
</div>
```

**CSS de la barra:**
```css
.progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  cursor: pointer;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  width: 0%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.25s linear;
}
```

---

## 4. Backend Flask + SQLite

### 4.1 Esquema de 4 tablas

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

**Explicación:** `operators` almacena usuarios. `media_items` es la biblioteca. `playback_sessions` registra cada vez que un usuario carga un medio (inicio, fin, posición, completitud). `playback_events` registra CADA interacción (play, pause, seek, etc.) con la posición exacta.

### 4.2 Patrón de conexión SQLite

```python
def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row  # ← acceso por nombre de columna
    return connection
```

**Explicación:** `row_factory = sqlite3.Row` permite acceder a columnas por nombre (`row["title"]`) en vez de por índice (`row[1]`). Usamos `with get_db() as conn:` para auto-commit y cierre.

### 4.3 Endpoint de registro de operador

```python
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
```

**Explicación:** `request.get_json(silent=True)` lee el body JSON sin lanzar error si no es válido. Usamos parámetros `?` para prevenir SQL injection. `cursor.lastrowid` devuelve el ID auto-generado.

### 4.4 Endpoint de evento de telemetría

```python
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
            "INSERT INTO playback_events (session_id, event_type, position, payload_json, created_at) VALUES (?,?,?,?,?)",
            (session_id, event_type, position, json.dumps(payload, ensure_ascii=False), now_iso()),
        )

    return jsonify({"ok": True})
```

**Explicación:** Registra CADA interacción del usuario. `json.dumps(payload)` serializa el dict de Python a string JSON para guardarlo en SQLite. `ensure_ascii=False` permite caracteres Unicode.

### 4.5 Leaderboard con JOIN + GROUP BY

```sql
SELECT
    o.id, o.name, o.dni,
    COUNT(ps.id) AS total_sessions,
    COALESCE(SUM(ps.completed), 0) AS completions,
    ROUND(COALESCE(AVG(ps.last_position), 0), 2) AS avg_position
FROM operators o
LEFT JOIN playback_sessions ps ON ps.operator_id = o.id
GROUP BY o.id, o.name, o.dni
ORDER BY completions DESC, total_sessions DESC, avg_position DESC
LIMIT 10
```

**Explicación:**
- `LEFT JOIN` incluye operadores SIN sesiones (aparecen con 0)
- `COALESCE(SUM(...), 0)` evita NULL cuando no hay datos
- `GROUP BY` agrupa filas por operador para las funciones de agregación
- `ROUND(..., 2)` redondea a 2 decimales
- `ORDER BY completions DESC` ordena por completados primero

---

## 5. Subida de archivos locales (NUEVA funcionalidad)

### 5.1 Endpoint Flask (backend)

```python
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
ALLOWED_EXTENSIONS = {"mp3", "wav", "ogg", "flac", "aac", "m4a", "mp4", "webm", "mkv", "avi", "mov"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE

def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def _detect_kind(filename: str) -> str:
    ext = filename.rsplit(".", 1)[1].lower()
    audio_exts = {"mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"}
    return "audio" if ext in audio_exts else "video"

@app.post("/api/upload")
def upload_file():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No se envió ningún archivo."}), 400

    file = request.files["file"]
    if not _allowed_file(file.filename):
        return jsonify({"ok": False, "error": "Extensión no permitida."}), 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    safe_name = f"{uuid4().hex[:12]}.{ext}"
    dest = UPLOAD_DIR / safe_name
    file.save(str(dest))

    kind = _detect_kind(file.filename)
    title = request.form.get("title", "") or file.filename.rsplit(".", 1)[0]
    source_url = f"/static/uploads/{safe_name}"

    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO media_items (title, kind, source_url, duration_seconds, genre, created_at) VALUES (?,?,?,?,?,?)",
            (title, kind, source_url, 0, "Local", now_iso()),
        )

    return jsonify({"ok": True, "mediaId": cur.lastrowid, "title": title, "kind": kind, "url": source_url})
```

**Explicación:**
- `request.files["file"]` accede al archivo del formulario multipart
- `uuid4().hex[:12]` genera nombre único seguro para evitar colisiones y path traversal
- `_detect_kind()` detecta automáticamente si es audio o vídeo por la extensión
- `app.config["MAX_CONTENT_LENGTH"]` limita el tamaño a 100 MB (Flask rechaza automáticamente archivos mayores)
- El archivo se sirve como estático desde `/static/uploads/`

### 5.2 Frontend — XMLHttpRequest con progreso

```javascript
function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(/\.[^.]+$/, ""));

    const xhr = new XMLHttpRequest();

    // Evento de progreso: actualiza barra en tiempo real
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        uploadBar.style.width = `${pct}%`;
        uploadStatus.textContent = `Subiendo... ${pct}%`;
      }
    });

    xhr.addEventListener("load", () => {
      const data = JSON.parse(xhr.responseText);
      if (data.ok) resolve(data);
      else reject(new Error(data.error));
    });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);  // Envía como multipart/form-data
  });
}
```

**Explicación:**
- Usamos `XMLHttpRequest` en vez de `fetch()` porque XHR permite `xhr.upload.addEventListener("progress")` para tracking de progreso en tiempo real
- `FormData` construye automáticamente el body `multipart/form-data`
- `e.loaded / e.total` calcula el porcentaje de bytes subidos

**¿Por qué no fetch()?** `fetch()` no soporta eventos de progreso de upload. Para descarga sí (con `response.body.getReader()`), pero para upload necesitamos XHR.

### 5.3 Drag & Drop

```javascript
// Arrastra archivos sobre la zona
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();  // NECESARIO para que funcione drop
  uploadZone.classList.add("drag-over");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-over");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();  // NECESARIO  
  uploadZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files);  // FileList
  }
});
```

**Explicación:**
- `e.preventDefault()` en `dragover` es **obligatorio** — sin él, el navegador no permite el drop
- `e.dataTransfer.files` contiene un `FileList` con los archivos arrastrados
- La clase CSS `drag-over` resalta visualmente la zona cuando se arrastra encima

---

## 6. Telemetría de eventos — Flujo completo

```
1. Usuario se registra → POST /api/operators/register → operatorId
2. Carga un medio → POST /api/sessions/start → sessionId
3. Cada interacción → POST /api/sessions/event {sessionId, eventType, position, payload}
4. Fin de reproducción → POST /api/sessions/end {sessionId, lastPosition, completed}
```

**Tipos de evento registrados:** `load`, `play`, `pause`, `stop`, `seek`, `speed`, `volume`, `ended`

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

**Explicación:** Función centralizada que envía eventos. Se llama desde play(), pause(), stop(), skip(), etc. Registra la posición exacta del reproductor en cada momento.

---

## 7. Estado del cliente

```javascript
const state = {
  operatorId: null,       // ID del operador registrado
  operatorName: "",       // Nombre del operador
  currentMedia: null,     // Objeto {id, title, kind, source_url, ...}
  currentSessionId: null, // Sesión de reproducción activa
};
```

**Explicación:** Todo el estado se mantiene en un objeto global. No usamos frameworks (React, Vue) — vanilla JS con un patrón sencillo de estado centralizado.

---

## 8. Las 14 mejoras — Resumen rápido

| # | Mejora | Snippet clave |
|---|--------|---------------|
| 1 | Custom Properties | `--accent: #4de2c4;` en `:root` |
| 2 | Tema claro/oscuro | `html.light { --bg: #f0f2f5; }` + `localStorage` |
| 3 | LED reproducción | `.playing-dot.active { animation: pulse 1.2s infinite; }` |
| 4 | Barra progreso | `getBoundingClientRect()` + click-to-seek |
| 5 | Badges tipo | `.badge-kind.audio { color: var(--info); }` |
| 6 | Badges completado | `.badge-completed.yes / .no` con colores |
| 7 | Badges ranking | `.rank-badge.gold { background: var(--gold); }` |
| 8 | Toasts | `showToast(msg, type)` + `animationend` auto-remove |
| 9 | Atajos teclado | `e.code === 'Space'` + `preventDefault()` |
| 10 | Seed datos | `POST /api/seed` + operadores demo |
| 11 | Exportar JSON | `new Blob([JSON.stringify(data)])` + `createObjectURL` |
| 12 | Importar JSON | `file.text()` + `JSON.parse()` + `POST /api/import` |
| 13 | Animaciones | `@keyframes fadeIn/scaleIn/toastUp/pulse` |
| 14 | Responsive | `@media (max-width: 1024px)` + `(600px)` |

---

## 9. Snippets clave para el examen

### 9.1 Toast system con animación CSS

```javascript
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  el.toastBox.appendChild(t);
  t.addEventListener('animationend', () => t.remove());
}
```

```css
.toast { animation: toastUp 2.8s var(--ease) forwards; }

@keyframes toastUp {
  0%   { opacity: 0; transform: translateY(16px); }
  12%  { opacity: 1; transform: translateY(0); }
  80%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(-12px); }
}
```

**Explicación:** El toast aparece, se mantiene visible y desaparece todo con UNA sola animación CSS. `animationend` elimina el DOM automáticamente. Sin setTimeout.

### 9.2 Theme toggle con localStorage

```javascript
function initTheme() {
  const saved = localStorage.getItem('mch-theme');
  if (saved === 'light') {
    document.documentElement.classList.add('light');
    el.themeToggle.textContent = '☀️';
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('mch-theme', isLight ? 'light' : 'dark');
  el.themeToggle.textContent = isLight ? '☀️' : '🌙';
}
```

```css
:root { --bg: #0f1222; --text: #e7ebff; }
html.light { --bg: #f0f2f5; --text: #1a1a2e; }
```

**Explicación:** Añadimos la clase `light` al `<html>`. Las CSS custom properties se sobreescriben automáticamente para todo el documento. `localStorage` persiste la preferencia entre recargas.

### 9.3 Keyboard shortcuts

```javascript
document.addEventListener("keydown", (e) => {
  // Ignorar cuando hay un input en foco
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  
  switch (e.code) {
    case 'Space':
      e.preventDefault();  // Evita scroll de página
      activePlayer().paused ? play() : pause();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      skip(-5);
      break;
    case 'ArrowRight':
      e.preventDefault();
      skip(5);
      break;
    case 'ArrowUp':
      e.preventDefault();
      el.volume.value = Math.min(1, Number(el.volume.value) + 0.05).toFixed(2);
      el.volume.dispatchEvent(new Event('input'));
      break;
    case 'ArrowDown':
      e.preventDefault();
      el.volume.value = Math.max(0, Number(el.volume.value) - 0.05).toFixed(2);
      el.volume.dispatchEvent(new Event('input'));
      break;
  }
});
```

**Explicación:** `e.code` identifica teclas de forma universal. `e.preventDefault()` en Space evita que el navegador haga scroll. `dispatchEvent(new Event('input'))` fuerza que el listener del volumen se ejecute.

### 9.4 Export con Blob

```javascript
async function exportData() {
  const data = await api('/api/stats');
  const media = await api('/api/media');
  const blob = new Blob(
    [JSON.stringify({ stats: data.stats, media: media.items }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);  // Liberar memoria
}
```

**Explicación:** `Blob` crea un archivo en memoria. `URL.createObjectURL()` genera una URL temporal para descargarlo. `revokeObjectURL()` libera la memoria del blob.

### 9.5 Import con file.text()

```javascript
async function importData() {
  const file = el.importFile.files[0];
  if (!file) return;
  const text = await file.text();    // Lee el archivo como texto
  const json = JSON.parse(text);     // Parsea el JSON
  if (json.media && Array.isArray(json.media)) {
    await api('/api/import', { method: 'POST', body: JSON.stringify({ media: json.media }) });
    showToast(`📤 ${json.media.length} medios importados`, 'ok');
  }
}
```

**Explicación:** `file.text()` es una API moderna que devuelve una Promise con el contenido del archivo como string. Más limpio que `FileReader`.

### 9.6 Seed endpoint Flask

```python
@app.post("/api/seed")
def seed_demo():
    with get_db() as conn:
        for name in ["Ana Demo", "Carlos Test", "Lucía QA"]:
            cur = conn.execute(
                "INSERT INTO operators (name, dni, created_at) VALUES (?,?,?)",
                (name, f"DEMO-{random.randint(1000,9999)}", now_iso()),
            )
            op_id = cur.lastrowid
            # Crear sesiones aleatorias
            for _ in range(random.randint(2, 5)):
                mid = random.choice(media_ids)
                conn.execute(
                    "INSERT INTO playback_sessions (...) VALUES (?,?,?,?,?,?)",
                    (op_id, mid, now_iso(), now_iso(), round(random.uniform(0, 30), 2), random.choice([0, 1])),
                )
    return jsonify({"ok": True})
```

**Explicación:** Genera datos de prueba para demostrar la app sin entrada manual. `random.randint` y `random.choice` dan variedad a los datos.

### 9.7 LED indicador de reproducción

```javascript
function setPlayingDot(active) {
  el.playingDot.classList.toggle('active', active);
}
```

```css
.playing-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--muted);
}
.playing-dot.active {
  background: var(--ok);
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

**Explicación:** Un punto verde parpadeante que indica visualmente que se está reproduciendo algo. Feedback visual inmediato sin leer texto.

---

## 10. Fórmulas clave

**Porcentaje de progreso:**
$$\text{progress} = \frac{\text{currentTime}}{\text{duration}} \times 100$$

**Click-to-seek (posición absoluta):**
$$\text{position} = \frac{e.\text{clientX} - \text{rect.left}}{\text{rect.width}} \times \text{duration}$$

**Porcentaje de subida:**
$$\text{uploadPct} = \frac{e.\text{loaded}}{e.\text{total}} \times 100$$

---

## 11. Preguntas frecuentes de examen

**P: ¿Por qué no usamos el atributo `controls` nativo?**
R: Para tener control total sobre la UX. Los controles nativos varían entre navegadores y no permiten personalización de estilo ni telemetría granular.

**P: ¿Cuál es la diferencia entre `<video>` y `<audio>` en JS?**
R: Ninguna en cuanto a API JavaScript. Comparten exactamente las mismas propiedades (`currentTime`, `duration`, `volume`...) y eventos. La diferencia es solo visual.

**P: ¿Por qué se usa XHR en vez de fetch para subir archivos?**
R: Porque `XMLHttpRequest` soporta `xhr.upload.addEventListener("progress")` para tracking de progreso de subida en tiempo real. `fetch()` no tiene equivalente para uploads.

**P: ¿Qué hace `e.preventDefault()` en dragover?**
R: Es OBLIGATORIO para que funcione el evento `drop`. Sin él, el navegador maneja el drag con su comportamiento por defecto y no dispara `drop`.

**P: ¿Cómo se previene SQL injection en Flask?**
R: Usando parámetros `?` en las queries: `conn.execute("SELECT * FROM x WHERE id = ?", (id,))`. Nunca concatenar strings.

**P: ¿Por qué usar uuid4() para nombres de archivo subidos?**
R: Para evitar colisiones (dos archivos con el mismo nombre) y ataques de path traversal (nombres maliciosos como `../../etc/passwd`).

**P: ¿Qué es sendBeacon?**
R: `navigator.sendBeacon()` envía datos de forma asíncrona sin bloquear el cierre de pestaña. Ideal para enviar telemetría en `beforeunload`.

---

## 12. Checklist pre-examen

- [x] Crear `<video>`/`<audio>` SIN atributo `controls` y conectar botones JS
- [x] Conocer `play()`, `pause()`, `currentTime`, `duration`, `volume`, `playbackRate`
- [x] Capturar `timeupdate` para barra de progreso custom
- [x] Implementar click-to-seek con `getBoundingClientRect()`
- [x] Escribir endpoint Flask POST con validación y `jsonify`
- [x] Patrón `sqlite3.connect()` + `row_factory = sqlite3.Row`
- [x] `LEFT JOIN` + `GROUP BY` + `COALESCE` para leaderboard
- [x] Sistema de toasts con `animationend`
- [x] `localStorage` para persistir tema
- [x] `keydown` + `e.code` filtrando inputs
- [x] `Blob` + `URL.createObjectURL()` para exportar JSON
- [x] `file.text()` + `JSON.parse()` para importar
- [x] **Upload con XHR** + `xhr.upload.progress` + `FormData`
- [x] **Drag & drop** con `preventDefault()` en dragover
- [x] **UUID para nombres seguros** de archivos subidos

---

*Documento generado para el examen de PMDM — Media Control Hub*
*Luis Jahir Rodriguez Cedeño · 53945291X · DAM2 2025/26*