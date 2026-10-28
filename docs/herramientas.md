# Herramientas de MX CAD

La barra vertical del extremo derecho incluye:

El panel izquierdo es una sola ventana de **Capas del plano**. Permite buscar y mostrar u ocultar capas, crear una capa de sesión con nombre y color, y elegir la capa activa para los nuevos trazos. Los nombres duplicados se rechazan sin distinguir mayúsculas. El archivo y su resumen están en Propiedades, a la derecha.

Al ocultar una capa también se ocultan sus trazos de sesión y se excluyen del snap y la selección. El DXF exportado conserva los nombres y la visibilidad de las capas de sesión, incluidas las vacías; los colores se aproximan a la paleta ACI compatible con DXF R12.

- **Seleccionar:** clic en una entidad visible para resaltarla y consultar sus propiedades. También puedes hacer clic dentro de un polígono cerrado. Arrastrar desplaza la vista.
- **Mover:** desplazar la vista arrastrando. La rueda siempre controla el zoom.
- **Medir:** dos clics definen una distancia. El panel muestra longitud XY, longitud 3D y coordenadas.
- **Línea:** dos clics crean un trazo de sesión.
- **Polígono:** clics para los vértices. Enter, Cerrar o un clic cerca del primer vértice cierra el contorno. Se rechazan cruces, vértices repetidos y área nula.
- **Snap Punto:** ajusta a puntos, vértices, extremos y centros dentro de diez píxeles. Conserva la elevación Z del punto.
- **Snap A línea:** proyecta al segmento más cercano e interpola Z. Si ambos snaps están activos, los puntos tienen prioridad.
- **Deshacer:** retira el último vértice pendiente o el último trazo completado.
- **DXF:** descarga únicamente los trazos y mediciones nuevos de la sesión.

Esc cancela el trazo pendiente y vuelve a Seleccionar. Retroceso retira el último vértice pendiente. Los trazos quedan visibles al cambiar de herramienta y se incluyen en la exportación PNG. Abrir otro plano o pulsar Nuevo limpia los trazos de sesión: descarga el DXF antes para conservarlos.

Las longitudes XY, perímetros y áreas se calculan sobre la proyección superior, en las unidades del dibujo. La longitud 3D incorpora Z. Las coordenadas mostradas y exportadas corresponden al espacio de la vista normalizada del visor; pueden diferir del WCS original si el plano tiene una transformación de vista guardada. Los clics sin snap se sitúan en Z=0.

La selección cubre puntos, líneas, polilíneas, círculos y arcos, incluidas entidades dentro de bloques simples. Las curvas se aproximan por segmentos para selección y cálculo; el panel identifica esas medidas como aproximadas. No se seleccionan textos, sombreados, splines ni entidades no compatibles. La visibilidad de capas se respeta.

Los archivos originales DWG/DXF no se modifican. Los trazos no se guardan automáticamente al cerrar la página. El DXF de trazos usa las coordenadas numéricas de la sesión; al importarlo en otro programa, utiliza las mismas unidades del plano de origen. Las mediciones se exportan como segmentos y los polígonos como polilíneas 3D cerradas.
