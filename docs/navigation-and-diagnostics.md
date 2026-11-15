# Diagnóstico de planos y navegación 3D

En Propiedades, **Avisos del dibujo** conserva los recursos SHX faltantes aunque el lector no los declare como símbolos de tipos de línea. Los avisos se agrupan como recursos pendientes, aproximaciones, contenido no compatible y mensajes del lector. El filtro no elimina avisos y cada entrada incluye una acción recomendada.

**Descargar diagnóstico JSON** genera un informe local con avisos, presentación actual, dimensiones de hojas, número de viewports y tiempos disponibles. No contiene geometría ni adjunta planos o fuentes. Es un diagnóstico del visor, no una certificación de equivalencia con AutoCAD.

En **Representación 3D → Calidad de navegación**:

- Automática reduce temporalmente la resolución a 0,75 píxeles por píxel CSS durante órbita, pan y rueda. Restaura la resolución normal 160 ms después de terminar la interacción.
- Alta conserva la resolución normal, hasta un máximo de 2 según la pantalla.
- Rendimiento mantiene 0,75 durante la visualización.

La exportación PNG restaura siempre la resolución completa. No se eliminan triángulos ni se reconstruye la geometría por cambiar la cámara. Con una pantalla de ratio 1, el raster temporal tiene el 56,25 % de píxeles de Alta; esto reduce trabajo de rasterización, pero no garantiza una mejora proporcional de FPS en escenas limitadas por CPU. Las pruebas registran los tiempos observados, la resolución y el contador de construcciones; los resultados dependen del equipo y del modelo.

La comparación final del DWG privado con AutoCAD sigue necesitando sus fuentes originales, el CTB y una referencia visual equivalente. Estas funciones no sustituyen esa validación. Los proyectos de varios archivos y el guardado completo de sesiones quedan fuera de esta entrega, centrada en las dos prioridades iniciales.
