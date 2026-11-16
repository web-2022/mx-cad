# CAD y modelos de bloques en una misma escena

Selecciona juntos un DWG/DXF y uno o varios modelos de bloques compatibles con **Abrir plano**: la aplicación prepara una vista conjunta al terminar la carga. También puedes añadirlos por separado y pulsar **Ver juntos** en la barra superior o en **Proyecto**.

La vista utiliza una cámara, una escena GPU y un origen visual común. Los centros, dimensiones y orientación de los bloques, y las coordenadas y elevaciones del CAD se conservan. No se centra cada archivo por separado, no se reproyectan coordenadas y no se reconstruye un terreno sólido a partir de curvas de nivel. La compatibilidad del lector de cada formato sigue siendo la misma que al abrirlo individualmente.

## Controles

- **Mostrar en escena** controla cada archivo sin volver a cargarlo. Opacidad y color uniforme afectan únicamente a su representación visual. Desactiva Color uniforme para recuperar el coloreado original o por atributos.
- **Modelo de bloques activo** elige qué modelo controla el panel de filtros, leyendas, cortes, estadísticas y exportación CSV. Los demás modelos de bloques continúan visibles con sus filtros y leyendas guardados. Sus leyendas pueden consultarse en el panel de archivos.
- Los filtros y recortes del modelo activo no eliminan ni filtran silenciosamente la topografía ni otros modelos. Las estadísticas y CSV corresponden al modelo activo, no a una suma de modelos.
- **Ajustar toda la escena** encuadra los archivos visibles. **Ajustar bloques activos** permite acercarse al modelo sin perder la topografía como contexto.
- PNG captura la escena completa con la opción de incluir la leyenda activa. No exporta un DWG combinado.

**Guardar proyecto** conserva la vista conjunta, el modelo activo, sus filtros y leyendas, la cámara y la apariencia de los archivos. Los ajustes del modelo de bloques activo se conservan también al volver a abrirlo individualmente. Los archivos originales permanecen incluidos en el proyecto local; no se suben a un servicio.

## Unidades y limitaciones

Si dos archivos declaran unidades distintas, la aplicación rechaza la combinación: no cambia sus escalas para hacerlos coincidir. Si un archivo no declara sus unidades, lo indica y conserva sus valores numéricos originales. El usuario debe comprobar que unidades y sistema de coordenadas sean compatibles. Unas coordenadas mineras grandes no permiten deducir por sí solas un CRS.

El CAD superpuesto utiliza líneas, polilíneas y caras explícitas compatibles. Los textos, hatch, imágenes y Layouts se consultan en el archivo individual; no se presenta esta escena como una reproducción del papel de AutoCAD. Las curvas siguen siendo líneas si el archivo no contiene una superficie con conectividad de caras recuperable.

La consulta del cursor y la selección espacial se resuelven sobre bloques y caras disponibles; el visor no inventa una elevación sobre el espacio vacío. La elección del modelo activo reconstruye su contexto de edición; mover la cámara, filtrar ese modelo o cambiar su leyenda no reconstruye la topografía.

IFC y GLB/glTF siguen disponibles individualmente dentro del proyecto. Esta entrega permite la escena compartida CAD + bloques; no declara una federación de todos los formatos.
