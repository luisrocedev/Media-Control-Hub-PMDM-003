# Reproductor Multimedia Personalizado - Media Control Hub

**DNI:** 53945291X  
**Curso:** DAM2 — Programación multimedia y dispositivos móviles  
**Actividad:** 003-Reproductor multimedia personalizado  
**Tecnologías:** HTML5 Media API · Flask · SQLite · JavaScript ES6  
**Fecha:** 17 de febrero de 2026

---

## 1. Introducción breve y contextualización (25%)

### Concepto general

**Media Control Hub** es un reproductor multimedia web con persistencia de datos que combina:

- **HTML5 Media API:** Reproducción nativa de audio/vídeo sin plugins
- **Controles personalizados:** UI customizada con control total sobre UX
- **Analytics de reproducción:** Telemetría detallada de eventos de playback
- **Backend Flask:** API REST para gestión de biblioteca y sesiones
- **SQLite:** Persistencia de medios, sesiones y eventos de reproducción

### Arquitectura del sistema

```
┌───────────────────────────────────────┐
│  Frontend (HTML5 Media + Canvas)     │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │  MediaPlayer                    │  │
│  │  - <video>/<audio> elements     │  │
│  │  - Custom controls (play/pause) │  │
│  │  - Volume, seek, fullscreen     │  │
│  │  - Playlist management          │  │
│  └──────────────┬──────────────────┘  │
│                 │                      │
│                 ▼                      │
│  ┌─────────────────────────────────┐  │
│  │  Event Tracker                  │  │
│  │  - play, pause, ended           │  │
│  │  - timeupdate (cada 10s)        │  │
│  │  - volumechange, seeked         │  │
│  └──────────────┬──────────────────┘  │
└─────────────────┼────────────────────┘
                  │ HTTP (Fetch API)
                  ▼
┌───────────────────────────────────────┐
│  Backend (Flask + SQLite)             │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │  API REST                       │  │
│  │  - POST /api/operator          │  │
│  │  - POST /api/media             │  │
│  │  - POST /api/session/start     │  │
│  │  - POST /api/session/end       │  │
│  │  - POST /api/event             │  │
│  │  - GET /api/stats              │  │
│  └──────────────┬──────────────────┘  │
│                 │                      │
│                 ▼                      │
│  ┌─────────────────────────────────┐  │
│  │  Database (SQLite)              │  │
│  │  - operators                    │  │
│  │  - media_items                  │  │
│  │  - playback_sessions            │  │
│  │  - playback_events              │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

### HTML5 Media API vs Flash

| Característica       | HTML5 Media     | Flash                           |
| -------------------- | --------------- | ------------------------------- |
| **Plugin requerido** | No              | Sí (Adobe Flash Player)         |
| **Soporte móvil**    | Universal       | Obsoleto (iOS nunca lo soportó) |
| **Performance**      | Hardware accel. | Software rendering              |
| **Seguridad**        | Sandbox nativo  | Vulnerabilidades históricas     |
| **Desarrollo**       | HTML/JS/CSS     | ActionScript                    |

### Eventos de reproducción

El reproductor captura eventos estándar HTML5:

```javascript
video.addEventListener("play", () => {}); // Reproducción iniciada
video.addEventListener("pause", () => {}); // Pausado
video.addEventListener("ended", () => {}); // Finalizado
video.addEventListener("timeupdate", () => {}); // Progreso (cada ~250ms)
video.addEventListener("volumechange", () => {});
video.addEventListener("seeked", () => {}); // Usuario saltó a otro tiempo
video.addEventListener("error", () => {}); // Error de carga
```

---

## 2. Desarrollo detallado y preciso (25%)

### Backend Flask con SQLite

```python
# app.py - Servidor Flask para Media Control Hub

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
from datetime import datetime
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

DB_PATH = 'media_hub.db'

def init_database():
    """Inicializa esquema de la base de datos"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Operadores
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS operators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Elementos multimedia
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            media_type TEXT CHECK(media_type IN ('audio', 'video')),
            duration_seconds REAL,
            added_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (added_by) REFERENCES operators(id)
        )
    ''')

    # Sesiones de reproducción
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS playback_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operator_id INTEGER NOT NULL,
            media_id INTEGER NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            duration_seconds INTEGER,
            completed BOOLEAN DEFAULT 0,
            watch_percentage REAL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (operator_id) REFERENCES operators(id),
            FOREIGN KEY (media_id) REFERENCES media_items(id)
        )
    ''')

    # Eventos de reproducción
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS playback_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            event_data TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES playback_sessions(id)
        )
    ''')

    # Índices
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_operator ON playback_sessions(operator_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_media ON playback_sessions(media_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_session ON playback_events(session_id)')

    conn.commit()
    conn.close()
    logger.info("✓ Base de datos inicializada")

init_database()

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/operator', methods=['POST'])
def create_operator():
    """Crea o obtiene un operador"""
    data = request.json
    name = data.get('name')

    if not name:
        return jsonify({'error': 'name es requerido'}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute('INSERT INTO operators (name) VALUES (?)', (name,))
        conn.commit()
        operator_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        cursor.execute('SELECT id FROM operators WHERE name = ?', (name,))
        operator_id = cursor.fetchone()[0]

    conn.close()

    return jsonify({'operator_id': operator_id, 'name': name})

@app.route('/api/media', methods=['POST', 'GET'])
def manage_media():
    """Gestiona elementos multimedia"""
    if request.method == 'POST':
        data = request.json

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO media_items (title, url, media_type, duration_seconds, added_by)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            data['title'],
            data['url'],
            data['media_type'],
            data.get('duration_seconds', 0),
            data.get('added_by')
        ))

        media_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({'media_id': media_id})

    else:  # GET
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM media_items ORDER BY created_at DESC')
        items = [dict(row) for row in cursor.fetchall()]

        conn.close()

        return jsonify(items)

@app.route('/api/session/start', methods=['POST'])
def start_session():
    """Inicia sesión de reproducción"""
    data = request.json

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO playback_sessions (operator_id, media_id, start_time)
        VALUES (?, ?, ?)
    ''', (data['operator_id'], data['media_id'], datetime.now().isoformat()))

    session_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'session_id': session_id})

@app.route('/api/session/end', methods=['POST'])
def end_session():
    """Finaliza sesión de reproducción"""
    data = request.json
    session_id = data['session_id']

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('SELECT start_time FROM playback_sessions WHERE id = ?', (session_id,))
    row = cursor.fetchone()

    if row:
        start_time = datetime.fromisoformat(row[0])
        end_time = datetime.now()
        duration = int((end_time - start_time).total_seconds())

        cursor.execute('''
            UPDATE playback_sessions
            SET end_time = ?, duration_seconds = ?, completed = ?, watch_percentage = ?
            WHERE id = ?
        ''', (
            end_time.isoformat(),
            duration,
            1 if data.get('completed') else 0,
            data.get('watch_percentage', 0.0),
            session_id
        ))

        conn.commit()

    conn.close()

    return jsonify({'status': 'session_ended'})

@app.route('/api/event', methods=['POST'])
def log_event():
    """Registra evento de reproducción"""
    data = request.json

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO playback_events (session_id, event_type, event_data)
        VALUES (?, ?, ?)
    ''', (
        data['session_id'],
        data['event_type'],
        json.dumps(data.get('event_data'))
    ))

    conn.commit()
    conn.close()

    return jsonify({'status': 'logged'})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Obtiene estadísticas globales"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) FROM playback_sessions WHERE completed = 1')
    total_completed = cursor.fetchone()[0]

    cursor.execute('SELECT AVG(watch_percentage) FROM playback_sessions')
    avg_completion = cursor.fetchone()[0] or 0.0

    cursor.execute('''
        SELECT o.name, COUNT(s.id) as sessions, AVG(s.watch_percentage) as avg_watch
        FROM operators o
        LEFT JOIN playback_sessions s ON o.id = s.operator_id
        GROUP BY o.id
        ORDER BY sessions DESC
        LIMIT 10
    ''')

    leaderboard = [
        {'name': row[0], 'sessions': row[1], 'avg_watch': round(row[2] or 0.0, 1)}
        for row in cursor.fetchall()
    ]

    conn.close()

    return jsonify({
        'total_completed': total_completed,
        'avg_completion': round(avg_completion, 1),
        'leaderboard': leaderboard
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

### Clase MediaPlayer con controles personalizados

```javascript
// media_player.js - Reproductor multimedia personalizado

class MediaPlayer {
  constructor(containerElement) {
    this.container = containerElement;
    this.mediaElement = null;
    this.currentSession = null;
    this.lastTimeUpdate = 0;

    this.createUI();
  }

  createUI() {
    this.container.innerHTML = `
            <div class="player-wrapper">
                <video id="video-element" class="media-element"></video>
                <audio id="audio-element" class="media-element" style="display:none;"></audio>
                
                <div class="controls">
                    <button id="play-btn">▶️ Play</button>
                    <button id="pause-btn">⏸️ Pause</button>
                    <input type="range" id="seek-bar" min="0" max="100" value="0" />
                    <span id="time-display">00:00 / 00:00</span>
                    <input type="range" id="volume-bar" min="0" max="100" value="100" />
                    <button id="fullscreen-btn">⛶ Fullscreen</button>
                </div>
            </div>
        `;

    this.videoElement = this.container.querySelector("#video-element");
    this.audioElement = this.container.querySelector("#audio-element");

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Play/Pause
    this.container.querySelector("#play-btn").addEventListener("click", () => {
      this.mediaElement?.play();
    });

    this.container.querySelector("#pause-btn").addEventListener("click", () => {
      this.mediaElement?.pause();
    });

    // Seek
    this.container.querySelector("#seek-bar").addEventListener("input", (e) => {
      if (this.mediaElement) {
        const time = (e.target.value / 100) * this.mediaElement.duration;
        this.mediaElement.currentTime = time;
      }
    });

    // Volume
    this.container
      .querySelector("#volume-bar")
      .addEventListener("input", (e) => {
        if (this.mediaElement) {
          this.mediaElement.volume = e.target.value / 100;
        }
      });

    // Fullscreen
    this.container
      .querySelector("#fullscreen-btn")
      .addEventListener("click", () => {
        if (this.mediaElement?.requestFullscreen) {
          this.mediaElement.requestFullscreen();
        }
      });
  }

  async loadMedia(mediaItem, operatorId) {
    // Determinar tipo de media
    const isVideo = mediaItem.media_type === "video";
    this.mediaElement = isVideo ? this.videoElement : this.audioElement;

    // Mostrar elemento correcto
    this.videoElement.style.display = isVideo ? "block" : "none";
    this.audioElement.style.display = isVideo ? "none" : "block";

    // Cargar URL
    this.mediaElement.src = mediaItem.url;

    // Iniciar sesión
    const response = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_id: operatorId,
        media_id: mediaItem.id,
      }),
    });

    const data = await response.json();
    this.currentSession = data.session_id;

    // Eventos de reproducción
    this.setupMediaEvents();
  }

  setupMediaEvents() {
    const media = this.mediaElement;

    media.addEventListener("play", () => {
      this.logEvent("play", { currentTime: media.currentTime });
    });

    media.addEventListener("pause", () => {
      this.logEvent("pause", { currentTime: media.currentTime });
    });

    media.addEventListener("ended", async () => {
      this.logEvent("ended", {});

      await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: this.currentSession,
          completed: true,
          watch_percentage: 100,
        }),
      });
    });

    media.addEventListener("timeupdate", () => {
      const seekBar = this.container.querySelector("#seek-bar");
      const progress = (media.currentTime / media.duration) * 100;
      seekBar.value = progress;

      // Actualizar display de tiempo
      const current = this.formatTime(media.currentTime);
      const total = this.formatTime(media.duration);
      this.container.querySelector("#time-display").textContent =
        `${current} / ${total}`;

      // Log cada 10 segundos
      if (media.currentTime - this.lastTimeUpdate > 10) {
        this.logEvent("progress", {
          currentTime: media.currentTime,
          percentage: progress,
        });
        this.lastTimeUpdate = media.currentTime;
      }
    });

    media.addEventListener("volumechange", () => {
      this.logEvent("volume_change", { volume: media.volume });
    });

    media.addEventListener("seeked", () => {
      this.logEvent("seeked", { currentTime: media.currentTime });
    });
  }

  async logEvent(eventType, eventData) {
    if (!this.currentSession) return;

    await fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: this.currentSession,
        event_type: eventType,
        event_data: eventData,
      }),
    });
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}
```

---

## 3. Aplicación práctica (25%)

### HTML completo del reproductor

```html
<!-- index.html - Media Control Hub -->
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Media Control Hub</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        padding: 20px;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      }

      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 30px;
        text-align: center;
      }

      .header h1 {
        font-size: 2.5rem;
        margin-bottom: 10px;
      }

      .main-content {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 20px;
        padding: 20px;
      }

      .player-section {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
      }

      .player-wrapper {
        background: #000;
        border-radius: 8px;
        overflow: hidden;
        position: relative;
      }

      .media-element {
        width: 100%;
        max-height: 500px;
        display: block;
      }

      .controls {
        background: rgba(0, 0, 0, 0.8);
        padding: 15px;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }

      .controls button {
        padding: 10px 20px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.3s;
      }

      .controls button:hover {
        background: #764ba2;
        transform: scale(1.05);
      }

      .controls input[type="range"] {
        flex: 1;
        min-width: 100px;
      }

      #time-display {
        color: white;
        font-size: 14px;
        white-space: nowrap;
      }

      .sidebar {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .panel {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
      }

      .panel h3 {
        color: #667eea;
        margin-bottom: 15px;
        border-bottom: 2px solid #667eea;
        padding-bottom: 10px;
      }

      .media-item {
        background: white;
        padding: 12px;
        margin: 8px 0;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.3s;
        border-left: 3px solid #667eea;
      }

      .media-item:hover {
        transform: translateX(5px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .media-item.active {
        background: #667eea;
        color: white;
      }

      .stat-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #e0e0e0;
      }

      .stat-value {
        font-weight: bold;
        color: #667eea;
      }

      .login-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }

      .login-box {
        background: white;
        padding: 40px;
        border-radius: 12px;
        text-align: center;
        max-width: 400px;
      }

      .login-box h2 {
        color: #667eea;
        margin-bottom: 20px;
      }

      .login-box input {
        width: 100%;
        padding: 12px;
        margin: 10px 0;
        border: 2px solid #e0e0e0;
        border-radius: 4px;
        font-size: 16px;
      }

      .login-box button {
        width: 100%;
        padding: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 16px;
        cursor: pointer;
        margin-top: 10px;
      }

      @media (max-width: 768px) {
        .main-content {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <!-- Login overlay -->
    <div id="login-overlay" class="login-overlay">
      <div class="login-box">
        <h2>🎬 Media Control Hub</h2>
        <input
          type="text"
          id="operator-name"
          placeholder="Nombre del operador"
        />
        <button id="login-btn">Entrar</button>
      </div>
    </div>

    <div class="container" style="display:none;" id="main-app">
      <div class="header">
        <h1>🎬 Media Control Hub</h1>
        <p>Reproductor multimedia personalizado con analytics</p>
      </div>

      <div class="main-content">
        <!-- Player principal -->
        <div class="player-section">
          <div id="player-container"></div>
        </div>

        <!-- Sidebar -->
        <div class="sidebar">
          <!-- Biblioteca -->
          <div class="panel">
            <h3>📚 Biblioteca</h3>
            <div id="media-library"></div>
          </div>

          <!-- Estadísticas -->
          <div class="panel">
            <h3>📊 Estadísticas</h3>
            <div id="stats-container">
              <div class="stat-item">
                <span>Reproducciones completas:</span>
                <span class="stat-value" id="stat-completed">0</span>
              </div>
              <div class="stat-item">
                <span>Porcentaje promedio:</span>
                <span class="stat-value" id="stat-avg">0%</span>
              </div>
            </div>
          </div>

          <!-- Leaderboard -->
          <div class="panel">
            <h3>🏆 Top Operadores</h3>
            <div id="leaderboard"></div>
          </div>
        </div>
      </div>
    </div>

    <script>
      const API_URL = 'http://localhost:5000';
      let currentOperatorId = null;
      let player = null;

      // Login
      document.getElementById('login-btn').addEventListener('click', async () => {
          const name = document.getElementById('operator-name').value.trim();

          if (!name) {
              alert('Ingresa tu nombre');
              return;
          }

          const response = await fetch(`${API_URL}/api/operator`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({name})
          });

          const data = await response.json();
          currentOperatorId = data.operator_id;

          document.getElementById('login-overlay').style.display = 'none';
          document.getElementById('main-app').style.display = 'block';

          init();
      });

      // Inicializar app
      async function init() {
          // Crear player
          player = new MediaPlayer(document.getElementById('player-container'));

          // Cargar biblioteca
          await loadLibrary();

          // Cargar stats
          await loadStats();
      }

      // Cargar biblioteca de medios
      async function loadLibrary() {
          const response = await fetch(`${API_URL}/api/media`);
          const items = await response.json();

          const container = document.getElementById('media-library');
          container.innerHTML = items.map(item => `
              <div class="media-item" onclick="playMedia(${item.id})">
                  ${item.media_type === 'video' ? '🎥' : '🎵'} ${item.title}
              </div>
          `).join('');
      }

      // Reproducir medio
      async function playMedia(mediaId) {
          const response = await fetch(`${API_URL}/api/media`);
          const items = await response.json();
          const item = items.find(i => i.id === mediaId);

          if (item) {
              await player.loadMedia(item, currentOperatorId);
          }
      }

      // Cargar estadísticas
      async function loadStats() {
          const response = await fetch(`${API_URL}/api/stats`);
          const data = await response.json();

          document.getElementById('stat-completed').textContent = data.total_completed;
          document.getElementById('stat-avg').textContent = data.avg_completion + '%';

          const leaderboard = document.getElementById('leaderboard');
          leaderboard.innerHTML = data.leaderboard.map((entry, i) => `
              <div class="stat-item">
                  <span>${i + 1}. ${entry.name}</span>
                  <span class="stat-value">${entry.sessions} sesiones</span>
              </div>
          `).join('');
      }

      // Clase MediaPlayer inline
      ${includeMediaPlayerClass()}
    </script>
  </body>
</html>
```

---

## 4. Conclusión breve (25%)

### Resumen de puntos clave

Este reproductor multimedia demuestra:

1. **HTML5 Media API:** Uso nativo de `<video>` y `<audio>` sin dependencias externas
2. **Controles personalizados:** UI completamente customizada con JavaScript
3. **Event tracking:** Captura de eventos de reproducción para analytics
4. **Persistencia:** SQLite para biblioteca de medios y telemetría de sesiones
5. **API REST:** Backend Flask para gestión de datos

### Eventos HTML5 Media

Los principales eventos capturados:

| Evento         | Cuándo se dispara   | Uso                               |
| -------------- | ------------------- | --------------------------------- |
| `play`         | Reproducción inicia | Iniciar temporizador de sesión    |
| `pause`        | Usuario pausa       | Registrar punto de pausa          |
| `ended`        | Vídeo termina       | Marcar sesión como completada     |
| `timeupdate`   | Progreso (~4 Hz)    | Actualizar seek bar, log cada 10s |
| `volumechange` | Cambia volumen      | Analytics de preferencias         |
| `seeked`       | Usuario salta       | Detectar skipping de contenido    |

### Fórmula de engagement

El porcentaje de visualización se calcula como:

$$\text{watch\_percentage} = \frac{t_{watched}}{t_{total}} \times 100$$

Donde $t_{watched}$ es el tiempo efectivo reproducido y $t_{total}$ es la duración total del medio.

Para sesiones con múltiples pausas:

$$t_{watched} = \sum_{i=1}^{n} (t_{end_i} - t_{start_i})$$

### Enlace con contenidos de la unidad

Este proyecto integra:

- **Librerías multimedia (Unidad 3):** HTML5 Media API, Canvas API (potencial visualización)
- **Desarrollo de juegos (Unidad 2):** Event-driven programming, game loop concepts
- **Dispositivos móviles (Unidad 4):** Responsive design, touch events support
- **Análisis de motores (Unidad 1):** Comparación HTML5 vs Flash vs frameworks multimedia

### Aplicaciones reales

Reproductores multimedia personalizados se usan en:

**Educación:** Plataformas e-learning (Moodle, Coursera) rastrean visualización de vídeos  
**Streaming:** Netflix, YouTube analytics para recomendaciones  
**Marketing:** Heatmaps de engagement en vídeos corporativos  
**Salud:** Reproductores de ejercicios con tracking de completitud  
**Gaming:** Cutscenes con tracking para achievements

### Comparación de tecnologías

| Tecnología                 | Ventajas                               | Desventajas              |
| -------------------------- | -------------------------------------- | ------------------------ |
| **HTML5 Media**            | Universal, sin plugins, hardware accel | Limitado control DRM     |
| **Video.js**               | Framework completo, plugins            | Overhead adicional       |
| **Plyr**                   | UI moderna, accesibilidad              | Menos control bajo nivel |
| **Custom (este proyecto)** | Control total, lightweight             | Más desarrollo manual    |

### Patrones de diseño aplicados

**Singleton Pattern:** Player instance único por página  
**Observer Pattern:** Event listeners para timeupdate, play, pause  
**Strategy Pattern:** Diferentes controladores según media_type (audio/video)  
**Factory Pattern:** Creación de sesiones de playback

### Futuras mejoras

- **Streaming adaptativo:** HLS/DASH para calidad variable según ancho de banda
- **Subtítulos:** WebVTT tracks con sincronización
- **Picture-in-Picture:** API PiP para multitarea
- **Shortcuts teclado:** Espacio pause/play, flechas seek ±5s
- **Visualización audio:** Canvas API con Web Audio API para waveforms
- **Chromecast:** Google Cast API para streaming a TV
- **Offline playback:** Service Workers + IndexedDB para caché

---

## Anexo — Mejoras implementadas en la interfaz (14 puntos)

A continuación se documentan las catorce mejoras introducidas en los ficheros del _frontend_ (`styles.css`, `index.html`, `app.js`) sin modificar el _backend_ Flask (`app.py`).

### 1. Design-System v2 con tokens CSS

Se creó un catálogo completo de variables CSS en `:root` (colores, radios, sombras, transiciones), garantizando coherencia visual y facilitando futuros cambios de marca sin tocar reglas individuales.

### 2. Barra de progreso personalizada

Se sustituyó el `<input type="range">` por una barra visual `<div>` con relleno animado (`#progressFill`) y _click-to-seek_: el usuario puede pulsar en cualquier punto de la barra para saltar a esa posición del medio.

### 3. Indicador LED de reproducción (_playingDot_)

Un elemento circular verde con animación `pulse` se activa durante la reproducción y se desactiva al pausar o detener, proporcionando _feedback_ visual instantáneo del estado del reproductor.

### 4. Sistema de _toasts_ contextuales

Todas las acciones del usuario (registro, carga de medio, errores, export/import, seed) generan notificaciones emergentes brevísimas con cuatro variantes (`ok`, `info`, `warning`, `danger`), auto-descartables a los 2,8 s.

### 5. Alternancia de tema (_Theme Toggle_)

Un botón de cabecera alterna entre modo oscuro (por defecto) y claro. La preferencia se persiste en `localStorage` y se aplica al instante vía la clase del elemento `<html>`.

### 6. Atajos de teclado

Se implementaron _hotkeys_ globales: **Espacio** (play/pausa), **←/→** (seek ±5 s), **↑/↓** (volumen ±5 %). Los atajos se desactivan automáticamente cuando el foco está en inputs o selects.

### 7. _Badges_ de tipo de medio

En la tabla de biblioteca, cada fila muestra un _badge_ coloreado (`audio` en azul, `video` en púrpura) con icono para identificar visualmente el tipo sin leer texto.

### 8. _Badges_ de completitud en historial

En la tabla de historial, la columna _Completada_ muestra un _badge_ verde (`✅ Sí`) o rojo (`❌ No`) en lugar de texto plano, mejorando la lectura rápida del estado de cada sesión.

### 9. _Rank badges_ en ranking

Las tres primeras posiciones del leaderboard llevan un _badge_ circular con color oro, plata y bronce respectivamente, diferenciando visualmente los puestos de honor.

### 10. Botón _Seed Data_

Un botón en la barra de herramientas inserta automáticamente tres operadores de prueba y crea una sesión aleatoria para cada uno, facilitando la evaluación de la interfaz sin datos manuales.

### 11. Exportación JSON del estado

El botón **Exportar** descarga un fichero `.json` con leaderboard, estadísticas y catálogo de medios, útil como informe o para migración de datos.

### 12. Importación JSON de medios

Se puede subir un fichero `.json` exportado previamente. El sistema recorre la clave `media` y añade automáticamente cada registro nuevo a la biblioteca mediante `POST /api/media`.

### 13. Paneles con cabecera y secciones con iconos

Cada sección (`📂 Biblioteca`, `📊 KPIs`, `🏆 Ranking`, `📜 Historial`) incorpora un título con emoji y separador visual, mejorando la jerarquía de información y la navegación ocular.

### 14. _Layout responsive_ con dos _breakpoints_

A partir de 1024 px las dos columnas colapsan en una sola y a 600 px los controles se re-organizan en columna vertical, asegurando usabilidad correcta en tablets y móviles.
