# Proyectos locales de MX CAD

## Empezar

1. Abre uno o varios modelos con **Abrir plano**, o arrástralos al visor. Se añaden al proyecto actual y el último queda activo.
2. Abre **Proyecto** para consultar los archivos. Pulsa un nombre para recuperar su sesión. **Añadir archivos** incorpora más modelos y **Quitar** retira uno del proyecto. **Nuevo** cierra el proyecto completo.
3. **Guardar proyecto** descarga `proyecto.mxproject`. **Abrir proyecto** permite recuperarlo en otra sesión o equipo compatible. También puedes arrastrarlo al visor.

El archivo de proyecto es JSON versionado e incluye los bytes originales de los modelos, recursos complementarios y referencias cargadas, con verificación SHA-256. No necesita un servidor ni conversión de pago. Puede contener datos privados y fuentes de uso restringido: contiene copias de los archivos que elegiste, por lo que compartirlo equivale a compartir esos archivos. Admite hasta 100 modelos y 128 MB de archivos incluidos; el JSON ocupa aproximadamente un tercio más por la codificación base64.

## Qué se recupera

- CAD: archivo original, cambios de color por entidad, capas visibles/congeladas, capas y trazos confirmados de sesión, espacio Model o Layout activo, encuadre y aspecto 3D activo.
- Bloques: archivo original, asignación de columnas tabulares, interpretación de campos, filtros, biblioteca de leyendas, leyenda activa, franjas, recortes, ocultación y aislamiento, además de la cámara.
- IFC y GLB/glTF: archivo y recursos locales seleccionados, visibilidad de elementos y cámara.
- Recursos CAD cargados mediante sus controles locales: imágenes, SHX, TTF/OTF, Xrefs y CTB. Solo se vuelven a cargar desde el proyecto local; no se buscan URLs guardadas en los planos.

Se conservan los ajustes activos de cada archivo al cambiar entre modelos. Las mediciones temporales, selección transitoria, comandos incompletos y el historial completo de deshacer no se guardan. Los colores restaurados pueden deshacerse hasta el color del archivo original.

## Vista conjunta CAD

En Proyecto, configura **Vista conjunta**, color visual y opacidad de superficies por archivo, y pulsa **Ver CAD juntos**. Para CAD sin bloques, combina Model de DWG/DXF en coordenadas originales. También existe una escena compartida CAD + modelos de bloques; consulta [CAD y bloques](shared-cad-blocks.md). Cada archivo mantiene un prefijo interno para evitar colisiones de bloques, capas e identificadores. No se desplazan ni se centran archivos por separado, ni se escalan para hacerlos coincidir.

Se rechazan unidades diferentes. Unidades iguales no prueban que los sistemas de coordenadas sean iguales: el usuario debe comprobar esa correspondencia. La vista conjunta no transforma proyecciones geográficas. Los archivos sin unidades conservan sus números sin asumir metros o milímetros.

Los Layouts se consultan seleccionando su archivo original. IFC y GLB/glTF se consultan individualmente. Los modelos de bloques pueden superponerse con CAD mediante Ver juntos. La opacidad por archivo afecta a superficies sombreadas; no modifica la opacidad de los trazos alámbricos. Los cambios de apariencia conjuntos no cambian los archivos originales.

La vista conjunta permite navegar, seleccionar y exportar PNG. Para editar una entidad o guardar DXF, selecciona el archivo individual. Guardar proyecto conserva la vista conjunta activa y su cámara, además de los ajustes individuales.

## Diferencia con Guardar como

`Guardar proyecto` guarda una sesión MX CAD, no escribe DWG/DXF. `Guardar como` sigue exportando un archivo individual con las capacidades y limitaciones del escritor existente. El proyecto conserva el original íntegro, pero eso no certifica que todos sus objetos puedan dibujarse con fidelidad a AutoCAD. Los avisos de compatibilidad y recursos pendientes siguen vigentes.
