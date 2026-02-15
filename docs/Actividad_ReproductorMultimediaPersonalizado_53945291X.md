# Actividad 003 · Reproductor multimedia personalizado

**Alumno:** Luis Jahir Rodriguez Cedeño  
**DNI:** 53945291X  
**Curso:** DAM2 - Programación multimedia y en dispositivos móviles  
**Unidad:** 301-Actividades final de unidad - Segundo trimestre  
**Actividad:** 003-Reproductor multimedia personalizado

## 1) Base de clase respetada
Se parte del ejercicio trabajado en clase de reproductor HTML5 personalizado (`audio/video` con controles JavaScript).  
Se mantiene la temática y el núcleo técnico: manipulación del elemento multimedia mediante API nativa (`play`, `pause`, `currentTime`, `volume`).

## 2) Modificaciones estéticas y visuales (alto impacto)
- Interfaz transformada a dashboard operativo de dos paneles.
- Panel principal de reproducción con estado en tiempo real.
- Panel de datos con biblioteca, métricas, ranking e historial.
- Estilo completo propio: layout responsive, tarjetas KPI, tablas y controles tematizados.

## 3) Modificaciones funcionales (alto calado, segundo curso)
Se amplía el ejercicio de frontend simple a una arquitectura full-stack:

### Backend y persistencia
- API REST en Flask.
- Base de datos SQLite con 4 tablas:
  - `operators`
  - `media_items`
  - `playback_sessions`
  - `playback_events`

### Lógica avanzada incorporada
- Registro de operador con identidad (nombre + DNI).
- Biblioteca multimedia extensible por formulario (altas dinámicas).
- Inicio y cierre de sesiones de reproducción asociadas a operador y medio.
- Trazabilidad completa de eventos de uso (play/pause/seek/volume/speed/end).
- Cálculo de indicadores:
  - número total de medios
  - operadores activos
  - sesiones acumuladas
  - eventos registrados
- Ranking de operadores por sesiones completadas.
- Historial individual de sesiones por operador.

Estas ampliaciones introducen persistencia relacional, diseño de endpoints y explotación de datos, lo que constituye una modificación funcional de nivel avanzado.

## 4) Evidencia de evaluación (4 puntos de la rúbrica)
1. **Respeto a la base didáctica**: el reproductor nace del ejercicio de clase y conserva su propósito.
2. **Cambio visual significativo**: rediseño integral de UI/UX.
3. **Cambio funcional significativo**: backend + BD + analítica y telemetría.
4. **Entrega completa y documentada**: código ejecutable, README técnico e informe.

## 5) Ejecución
```bash
pip install -r requirements.txt
python app.py
```
URL: `http://127.0.0.1:5070`
