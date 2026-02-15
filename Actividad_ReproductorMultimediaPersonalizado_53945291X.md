# Actividad y entrega · Reproductor multimedia personalizado

**DNI:** 53945291X  
**Curso:** DAM2 - Programación multimedia y en dispositivos móviles  
**Lección:** `dam2526/Segundo/Programación multimedia y dispositivos móviles/301-Actividades final de unidad - Segundo trimestre/003-Reproductor multimedia personalizado`

## Resumen de la propuesta
He desarrollado un prototipo personal llamado **Media Control Hub**, manteniendo la base del ejercicio de clase (reproductor HTML5 personalizado) y escalándolo a una solución full-stack con almacenamiento en base de datos y analítica de uso.

## 1) Modificaciones estéticas y visuales
- Interfaz rediseñada completamente como panel de control multimedia.
- Distribución en dos zonas: reproducción y analítica.
- Estilos personalizados para controles, biblioteca, ranking e historial.
- Versión responsive para distintos tamaños de pantalla.

## 2) Modificaciones funcionales (calado importante)
- Backend Flask con API REST.
- Persistencia SQLite con múltiples tablas relacionales (`operators`, `media_items`, `playback_sessions`, `playback_events`).
- Alta de operador y alta dinámica de medios (audio/vídeo).
- Registro de sesiones y eventos granulares de reproducción.
- Panel de métricas globales y ranking de operadores.
- Historial detallado por operador.

## 3) Evidencia de nivel de segundo curso
No es solo un frontend con controles de play/pause; incorpora modelado de datos, endpoints, flujo de sesiones, telemetría y explotación de datos, justificando una ampliación funcional de alto nivel.

## 4) Entrega
Proyecto principal en:
`003-Reproductor multimedia personalizado/media_control_hub`

Incluye:
- `app.py`
- `templates/index.html`
- `static/styles.css`
- `static/app.js`
- `README.md`
- `requirements.txt`
- `docs/Actividad_ReproductorMultimediaPersonalizado_53945291X.md`
