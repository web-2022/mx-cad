# Superficies CAD por GPU

La vista CAD 3D usa Three.js 0.180.0 (MIT), ya incluido en el proyecto, y WebGL2 local. El antiguo Canvas 2D alámbrico permanece como referencia de medición en `src/view-3d.ts`; la aplicación usa `src/cad-gpu-view.ts`. No se añaden servicios, licencias de pago ni envío de planos a servidores.

## Capacidades reales

| Datos disponibles | Representación |
|---|---|
| 3DFACE triangular o cuadrilátero convexo plano | Caras, normales planas y modos de superficie |
| DXF POLYLINE polyface | Vértices e índices explícitos 71–74, incluidos índices negativos |
| DXF MESH y malla rectangular POLYLINE | Conectividad explícita; caras triangulares o cuadrangulares planas |
| INSERT con caras/mallas compatibles | Transformaciones anidadas, base, escala, giro, OCS y herencia de capa/color |
| SOLID / TRACE | Cara explícita; espesor no extruido, advertido |
| LINE, polilíneas, curvas compatibles y POINT | Trazos/puntos, sin generar superficies artificiales |
| ACIS, 3DSOLID, BODY, REGION, proxies sin teselación | Avisos con tipo/handle; no se inventan caras |
| N-gons, caras degeneradas, cóncavas o no planas no compatibles | Advertencia concreta; los registros originales permanecen en el archivo |

LibreDWG entrega 3DFACE pero su convertidor JS no contempla POLYLINE_PFACE/MESH. Para mallas detectadas en Model se intenta recuperación local con el escritor DXF nativo y se recupera conectividad cuando es posible; si falla, se advierte. No equivale a soporte completo de todos los DWG ni de mallas de bloques no detectadas por esa sonda. La cobertura de ACIS/objetos propietarios sigue limitada por el lector.

Model con caras explícitas y variación de altura abre sombreado automáticamente; un plano a cota constante no se clasifica como espacial solo por su elevación. Model/Layouts continúan separados. Superior conserva el render GPU cuando hay superficies; los modelos de solo trazos pueden volver al render 2D completo.

## Uso

En **Propiedades → Representación 3D** se elige alámbrico con triangulación, líneas ocultas, sombreado, sombreado con aristas o transparente. **Aspecto** abre ese panel también en ventanas estrechas. Los modos sin caras disponibles se desactivan.

Las aristas características se **estiman** con el ángulo entre normales y los bordes de la malla. No se presentan como una recuperación exacta de todas las marcas de arista invisible del archivo. Sombreado evita dibujar diagonales internas. La transparencia usa mezcla estándar y puede mostrar limitaciones de orden en superficies superpuestas.

Los modos pueden aplicarse a todo el modelo, a la entidad seleccionada o a su conjunto conectado. “Aislar conjunto” y “Ajustar al conjunto” permiten examinarlo. Son filtros visuales: no borran datos. Escape limpia selección e aislamiento temporal; los colores confirmados permanecen.

**Mostrar puntos de referencia** permite consultar los POINT originales. Con superficies, se ocultan inicialmente mediante ese control explícito para no cubrir las caras. Se informa de su cantidad cargada y permanecen en el DXF. En archivos de solo trazos/puntos se muestran inicialmente.

El selector de color de entidad modifica propiedades originales compatibles con deshacer/rehacer y guardado DXF. La **sustitución de color solo en el visor**, la opacidad visual y los modos no cambian el dibujo y no se prometen como propiedades guardadas en DWG/DXF. Editar una definición de bloque afecta a todas sus instancias; se advierte antes del control de edición.

Selección y coordenadas de superficie usan un BVH de triángulos con el punto de intersección más cercano. Se revierte el único origen local común antes de mostrar Norte=Y, Este=X y Elevación=Z. No se deduce un CRS geográfico. Sin intersección se muestra —. Los ejes siguen la cámara; pan central, vistas, encuadre anterior y PNG se mantienen.

## Topología y fidelidad

Se distinguen la cara/entidad seleccionada y su conjunto conectado geométrico. “Cerrado topológicamente” exige dos incidencias por borde y orientación consistente. No verifica autointersecciones ni demuestra que sea un sólido válido. No se calcula volumen. No se tapan huecos ni se modifica automáticamente el archivo para corregir orientaciones; el sombreado de doble cara evita desapariciones por orientación, conservando los datos fuente.

## Rendimiento y recursos

La preparación crea posiciones relativas al origen común, índices, normales, colores, conectividad y BVH. Las caras se agrupan en pocas llamadas de dibujo conservando la asociación con cada entidad original. Orbit/pan/zoom solo actualizan la cámara y solicitan un frame; no reconstruyen mallas, normales, BVH ni el panel de Propiedades. Cambiar representación reconstruye grupos/índices de presentación y aristas; no vuelve a leer el archivo. Editar color actualiza atributos de color y conserva geometría/selección.

La lectura suplementaria DXF recorre líneas sin crear un segundo array de todos los renglones y compacta propiedades redundantes de caras/puntos ya leídos. El índice de selección 2D se prepara al necesitar Model 2D, evitando duplicarlo al abrir directamente un archivo espacial grande. Los recursos GPU, controles y observadores se liberan al sustituir/destruir el visor. No se usa eliminación silenciosa ni simplificación permanente.

PNG fuerza el render de la representación actual con la resolución completa configurada. “Guardar como DXF”, “DXF de trazos” y PNG conservan funciones distintas. Las limitaciones de escritor y versiones DXF se describen en `editing-and-coordinates.md`.

## Prueba local con el archivo proporcionado

`stopes.dxf`: 63.078.751 bytes, 193.088 3DFACE y 120.680 POINT. Se cargaron 193.088 triángulos y todos los puntos. Se encontraron 8.523 conjuntos conectados: 6.679 cerrados topológicamente y 1.844 no verificables por incidencia/orientación de bordes. Esto no certifica volúmenes. El archivo y sus capturas de trabajo se mantienen fuera del repositorio público.

Comparación en el mismo navegador, modelo, encuadre ortográfico y viewport 1400×950: Linux, Intel Xeon Platinum 8573C, 3 CPU lógicas, Chromium 154 con ANGLE/SwiftShader (GPU por software). Se incluyeron los 120.680 puntos en **ambas** mediciones. 12 muestras por comando; medias de trabajo CPU de preparación/envío del dibujo, **no FPS**:

| Comando | Canvas alámbrico anterior ms | GPU sombreado ms |
|---|---:|---:|
| Rotación | 436,22 | 0,66 |
| Pan | 427,84 | 0,43 |
| Zoom | 398,48 | 0,41 |

El BVH tardó aproximadamente 0,2–1,0 ms por consulta medida. Primera preparación GPU: 8,13 s (normales, conectividad y BVH), frente a 1,27 s de preparación alámbrica. Apertura observada del visor nuevo: 30,10 s hasta controles listos, incluyendo lectura y preparación; no se midió una apertura completa equivalente de la versión anterior, por lo que no se atribuye una mejora de apertura. Cambiar representación tomó aproximadamente 151–510 ms en ese equipo. El contador de construcción geométrica permaneció en 1 después de rotar, pan, zoom y cambios de modo. El render final usó 2 draw calls para caras y puntos.

Los intervalos de `requestAnimationFrame` en SwiftShader estuvieron alrededor de 700 ms, con pausas de compilación/procesamiento mucho mayores al principio. No demuestran una mejora de FPS y no permiten prometer fluidez equivalente en una GPU real. La mejora comprobada corresponde al trabajo CPU de proyección/envío. Se necesita comprobar FPS/latencia en el equipo y GPU del usuario.

Pruebas automatizadas: caras abiertas/cerradas/no manifold, transformaciones y coordenadas grandes, polyface/MESH, BVH, color y herencia; interfaz con todos los modos, transparencia, selección/color/deshacer, capas, ejes, coordenadas y regreso a Model/Layout. La suite existente verifica también textos, hatch, guardado DXF, referencias locales, IFC/GLB y PNG.

Para repetir la comparación local: instala dependencias con `npm ci`, ejecuta `npm run build`, sirve `npm run preview -- --port 4173` y `npm run dev -- --port 5173` en terminales separadas. Ejecuta `MX_CAD_BENCH_FILE=/ruta/plano.dxf MX_CAD_BROWSER=/ruta/chromium node scripts/cad-gpu-benchmark.mjs`. El script rechaza URLs externas y deja métricas/captura en `test-results/`; esos archivos no forman parte de la publicación. La muestra de geometría original debe permanecer accesible localmente durante la prueba.
