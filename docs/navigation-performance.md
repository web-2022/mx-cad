# Navegación, fidelidad y rendimiento

La barra derecha se adapta al contexto: Model permite seleccionar, desplazar y dibujar; las hojas permiten navegar sin simular selección de entidades dentro de los viewports; CAD 3D permite Pan y órbita; BIM permite también seleccionar elementos. Los comandos no disponibles permanecen desactivados. El botón central desplaza en todos los contextos. El historial de encuadres se limita por archivo y espacio. Zoom por ventana se cancela con Escape.

## Cambios de rendimiento

- Los eventos de movimiento y rueda se agrupan por frame. Exportar fuerza el dibujo final.
- La selección y el snap consultan un índice espacial conservador; las entidades grandes permanecen en una lista de respaldo y no se descartan.
- El movimiento en modo Seleccionar/Pan no busca puntos de ajuste que no se utilizan.
- Las presentaciones reutilizan escenas, transformaciones de bloques y muestreo de curvas. La caché tiene límites por hoja y número de entidades y se invalida al cambiar capas o referencias.
- Se evita ajustar el modelo oculto al alternar hojas y se dibuja cada escena una sola vez por composición.
- Solo se omiten del dibujo líneas o ventanas rectangulares completamente fuera del área visible, con margen para el grosor. No se aplica una reducción permanente de detalle.

## Correcciones verificables de fidelidad

Los objetos de capa 0 en bloques heredan la capa de su inserción y se respeta el grosor BYBLOCK disponible. Los rellenos SOLID/TRACE siguen el orden de esquinas DXF, sin convertir un rectángulo en un lazo cruzado. Se conserva la asociación de una presentación recuperada por `layoutHandle` del registro de bloque.

Esto no verifica todavía las diferencias concretas del usuario: faltan su DWG y las dos capturas. Continúan las limitaciones documentadas de CTB/STB, estilos anotativos, algunos textos y referencias, viewports inclinados y objetos propietarios.

## Medición reproducible

El workflow **Medir navegación CAD** ejecuta ambas versiones en el mismo runner Windows, Node 24 y ventana de 1400 × 900. Utiliza el mismo script, un DXF de dos hojas con 10 000 líneas adicionales y el DWG público `HatchG.dwg` de 59 489 bytes. Registra CPU, tamaño del archivo, apertura, coste CPU de pan y zoom, y cambio de Layout.

El informe antes/después y los percentiles aparecen en el resumen y los registros de GitHub Actions (`MX_BENCHMARK_PAIR`). Se usa una entrega determinista de callbacks de frame durante las muestras de entrada porque el reloj de pantalla del escritorio virtual puede estar limitado. Estas cifras no son FPS ni garantizan la fluidez de un archivo de producción. El tiempo de apertura incluye el controlador y el arranque de WASM en el caso DWG.

La instrumentación solo se activa en el servidor local de pruebas con `MX_CAD_BENCHMARK=1`; no se activa en la web pública. No envía dibujos ni métricas a servicios externos.
