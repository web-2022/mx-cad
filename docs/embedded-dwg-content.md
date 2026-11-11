# Tablas, OLE y estilos de impresión locales

## Contenido recuperado del propio DWG

Cuando el lector principal no recupera una tabla moderna, el visor intenta leer su prefijo de referencia a bloque en un worker auxiliar. Solo se aplica si se obtienen posición, escala y giro válidos, y la referencia exacta apunta a un bloque gráfico existente y no vacío del mismo archivo. No se deducen posiciones por proximidad ni se inventan celdas. El tipo original ACAD_TABLE y sus datos se mantienen; la representación usa el gráfico guardado por AutoCAD.

La lectura auxiliar está limitada al prefijo de referencia: el decodificador experimental completo de tablas no se utiliza. El proceso termina al responder o a los 30 segundos. Si no entrega datos verificables, se conserva un aviso y el visor sigue disponible. No sustituye al lector general. Su JavaScript y WASM son gratuitos, GPL-3.0, se descargan únicamente durante la compilación desde un commit público fijado y se verifican por SHA-256. La página publicada sirve sus copias locales. El DWG nunca se transmite a ese repositorio ni a un servicio de conversión.

La recuperación es **gráfica**: no implica edición de filas, fórmulas o estilos estructurados, ni garantiza que el escritor DXF conserve la tabla editable. Guardar como advierte de esa diferencia.

Los OLE2FRAME con un stream BMP `CONTENTS` dentro de un contenedor CFB se muestran como imágenes embebidas usando sus esquinas originales y las transformaciones del bloque. No se ejecuta OLE ni se abre Office. No se buscan imágenes externas para sustituir logotipos. Otros formatos OLE, vínculos y presentaciones vectoriales no verificadas mantienen su aviso.

## Cargar el CTB y las fuentes

1. Abre el DWG y selecciona su Layout.
2. Abre los avisos para consultar los nombres de fuentes y del estilo de impresión que faltan.
3. Usa **Cargar fuentes, imágenes, Xrefs o CTB** y selecciona los archivos locales. El CTB debe tener el nombre declarado por el Layout; no se aplica arbitrariamente otro estilo.
4. Un CTB se aplica únicamente a las presentaciones que lo referencian. Model conserva sus colores de dibujo. El PNG usa la misma configuración que la presentación.

El lector acepta CTB versión 1 comprimido con zlib. Aplica colores RGB, escala de grises, screening y grosores de línea físicos por ACI, incluyendo herencia BYLAYER/BYBLOCK. No reproduce plumillas físicas, tramado de impresora, extremos/uniones ni todos los patrones de impresión. STB se rechaza con un mensaje explícito: sus asignaciones por nombre no están verificadas. Estas limitaciones no se presentan como compatibilidad completa con AutoCAD.

Las fuentes SHX/TTF/OTF se cargan mediante el mecanismo local existente. Un nombre de fuente dentro del DWG no contiene sus contornos. No se descargan ni redistribuyen fuentes comerciales. Si faltan los archivos exactos, la tipografía sigue siendo aproximada aun cuando el texto y su posición se recuperen correctamente.

## Verificación

Se comprobó localmente la extracción de los dos BMP embebidos del archivo privado y la lectura de los prefijos de sus dos tablas con las mismas funciones de producción. La comparación tipográfica y de impresión exacta requiere las fuentes y el CTB externos del usuario, que no estaban adjuntos. Los modelos, capturas y recursos privados no se incluyen en GitHub.

Las pruebas sintéticas comprueban CFB/FAT, ciclos inválidos, conservación de esquinas, CTB comprimido, colores/screening/grosor, herencia de ACI y correspondencia del CTB con el Layout. También verifican que una tabla solo use un bloque referenciado realmente y que la lectura auxiliar no intente convertir las celdas experimentales.
