# Media Control Hub · PMDM Actividad 003

Reproductor multimedia personalizado (audio/vídeo) desarrollado a partir de la base vista en clase (`audio/video` HTML5 + controles JS), ampliado con backend Flask y persistencia SQLite para telemetría completa.

## Stack
- Python + Flask
- SQLite
- HTML/CSS/JavaScript

## Funcionalidades destacadas
- Registro de operador (nombre + DNI).
- Biblioteca multimedia dinámica (audio y vídeo) con alta de nuevos medios por URL.
- Reproductor con controles personalizados: play, pause, stop, seek ±10s, volumen, velocidad, barra de progreso.
- Registro de sesiones de reproducción y eventos granulares (play/pause/seek/volumen/velocidad/fin).
- Dashboard con KPIs, leaderboard de uso y historial por operador.

## Puesta en marcha
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Abrir: `http://127.0.0.1:5070`

## Endpoints clave
- `POST /api/operators/register`
- `GET /api/media`
- `POST /api/media`
- `POST /api/sessions/start`
- `POST /api/sessions/event`
- `POST /api/sessions/end`
- `GET /api/operators/<id>/history`
- `GET /api/leaderboard`
- `GET /api/stats`
- `GET /api/health`

## Autor
- Luis Jahir Rodriguez Cedeño
- DNI: 53945291X
