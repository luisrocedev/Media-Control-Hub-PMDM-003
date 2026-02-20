# Media Control Hub · PMDM Actividad 003

Reproductor multimedia personalizado (audio / vídeo) con controles HTML5 nativos, backend Flask y persistencia SQLite para telemetría completa de sesiones de reproducción.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML 5 `<video>` / `<audio>`, CSS custom-properties, JavaScript vanilla |
| Backend | Python 3 · Flask 3.0 |
| Base de datos | SQLite 3 (file: `media_control.sqlite3`) |
| Puerto | `5070` |

---

## Arquitectura

```
┌────────────────────┐          ┌─────────────┐
│  Navegador (SPA)   │◄─JSON──►│  Flask API   │
│  index.html        │          │  app.py      │
│  app.js / styles   │          │  SQLite      │
└────────────────────┘          └─────────────┘
```

**4 tablas SQL:** `operators` · `media_items` · `playback_sessions` · `playback_events`

---

## Funcionalidades

- **Registro de operador** (nombre + DNI) con sesión activa.
- **Biblioteca multimedia** dinámica — alta/listado de audio y vídeo por URL.
- **Reproductor personalizado** con controles: ▶ Play · ⏸ Pause · ⏹ Stop · ⏪ −10 s · ⏩ +10 s · 🔊 Volumen · ⚡ Velocidad.
- **Barra de progreso custom** — click-to-seek sobre `div` (no `<input range>`).
- **Telemetría granular** — cada evento (play / pause / seek / speed / volume / ended) se registra con timestamp y posición.
- **Dashboard** con KPIs, leaderboard y historial por operador.
- **14 mejoras Design System v2** (ver sección más abajo).

---

## Puesta en marcha

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Abrir → `http://127.0.0.1:5070`

---

## API REST — Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Página principal (SPA) |
| `POST` | `/api/operators/register` | Registrar operador `{name, dni}` |
| `GET` | `/api/media` | Listar medios (`?kind=audio\|video`) |
| `POST` | `/api/media` | Añadir medio `{title, kind, sourceUrl, durationSeconds, genre}` |
| `POST` | `/api/sessions/start` | Iniciar sesión `{operatorId, mediaItemId}` |
| `POST` | `/api/sessions/event` | Registrar evento `{sessionId, eventType, position, payload}` |
| `POST` | `/api/sessions/end` | Finalizar sesión `{sessionId, lastPosition, completed}` |
| `GET` | `/api/operators/<id>/history` | Historial de sesiones (`?limit=8`) |
| `GET` | `/api/leaderboard` | Top 10 operadores por sesiones/completados |
| `GET` | `/api/stats` | KPIs globales |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/seed` | *v2* — Generar datos demo |
| `POST` | `/api/import` | *v2* — Importar medios desde JSON |

---

## Controles de teclado (v2)

| Tecla | Acción |
|-------|--------|
| `Espacio` | Play / Pause |
| `←` | Retroceder 5 s |
| `→` | Avanzar 5 s |
| `↑` | Subir volumen 5 % |
| `↓` | Bajar volumen 5 % |

---

## 14 Mejoras Design System v2

| # | Mejora | Archivos |
|---|--------|----------|
| 1 | **Custom Properties** — 30+ variables CSS (paleta, radios, sombras, tipografía) | `styles.css` |
| 2 | **Tema claro / oscuro** — toggle persistente con `localStorage` | `styles.css`, `app.js`, `index.html` |
| 3 | **LED de reproducción** — dot animado junto al título activo | `styles.css`, `app.js` |
| 4 | **Barra de progreso custom** — `div` click-to-seek con relleno animado | `styles.css`, `app.js`, `index.html` |
| 5 | **Badges de tipo** — etiquetas `audio` / `video` con color diferenciado | `styles.css`, `app.js` |
| 6 | **Badges de completado** — ✔ Sí / ✘ No en historial | `styles.css`, `app.js` |
| 7 | **Badges de ranking** — oro / plata / bronce en leaderboard | `styles.css`, `app.js` |
| 8 | **Sistema de toasts** — notificaciones ok / info / warning / danger | `styles.css`, `app.js`, `index.html` |
| 9 | **Atajos de teclado** — Space, flechas para control rápido | `app.js` |
| 10 | **Seed de datos demo** — botón + endpoint `/api/seed` | `app.js`, `app.py`, `index.html` |
| 11 | **Exportación JSON** — descarga Blob con medios y stats | `app.js`, `index.html` |
| 12 | **Importación JSON** — carga fichero + endpoint `/api/import` | `app.js`, `app.py`, `index.html` |
| 13 | **Animaciones CSS** — fadeIn, scaleIn, toastUp, pulse | `styles.css` |
| 14 | **Responsive mejorado** — breakpoints 1024 px + 600 px | `styles.css` |

---

## Estructura del proyecto

```
Media-Control-Hub-PMDM-003/
├── app.py                    # Flask backend + SQLite
├── requirements.txt          # flask>=3.0
├── templates/
│   └── index.html            # SPA shell
├── static/
│   ├── app.js                # Lógica frontend completa
│   └── styles.css            # Design System v2
├── docs/
│   └── Actividad_*.md        # Documento de actividad
├── Actividad_ReproductorMultimediaPersonalizado_53945291X.md
├── Plantilla_Examen_Media_Control_Hub.md
└── README.md
```

---

## Autor

| Campo | Valor |
|-------|-------|
| Nombre | Luis Jahir Rodríguez Cedeño |
| DNI | 53945291X |
| Ciclo | DAM2 · 2025/26 |
| Módulo | PMDM · Actividad 003 |
