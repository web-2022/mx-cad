# Propiedades, coordenadas y guardado local

Se mantiene el lector LibreDWG WASM gratuito ya distribuido (GPL), el motor CAD bajo AGPL y las bibliotecas Three.js MIT/web-ifc MPL. Sin servicios ni pagos nuevos. GitHub Pages sirve los workers y WASM del mismo sitio.

## Inspección y correcciones

La normalización conservaba propiedades que no se exponían a selección. Los trazos de selección ahora enlazan con la entidad original por handle y muestran propiedades y coordenadas WCS compatibles. Editar una entidad dentro de una definición de bloque afecta a todas sus instancias, indicado en el panel. No hay edición de instancia aislada. Selección en Model superior: líneas, polilíneas, puntos, arcos/círculos y anclas de texto; no hit testing completo de hatch/cotas. La selección de Layout y alámbrica sigue pendiente.

Dos errores de representación: MTEXT DXF interpretaba group 41 (ancho de caja) como factor de ancho de letras y group 72 como alineación TEXT; la altura de texto estaba limitada artificialmente a 4–256 píxeles. Se corrigen sin escalar el contenido para esconder desbordamientos. MTEXT usa ancho de caja, attachment y espaciado; se mantiene aproximación en formato enriquecido, columnas, anotativos y fuentes faltantes. La dirección de MTEXT DWG se toma de su vector X cuando existe. CTB/STB y viewports inclinados/perspectiva siguen sin representación exacta.

Cada clic de Layout reajusta a la hoja usando su formato real cuando se conoce; si falta se declara encuadre por contenido. Maximizar despeja los paneles laterales.

## Coordenadas y navegación

Sin selector 2D/3D: abre en superior completa; Orbitar/frontal/lateral/isométrica pasa a la representación alámbrica compatible. Superior vuelve al render completo. No se eleva geometría Z=0 ni se cambia su WCS. La vista alámbrica sigue sin sólidos ACIS/proxies y tiene aviso explícito; no constituye un render completo del DWG.

El indicador XYZ sigue cámara en CAD y BIM. Barra inferior: Este=X, Norte=Y, Elevación=Z en unidades originales sin atribuir CRS. Elevación 2D solo cuando los trazos compatibles tienen cota constante; si no se puede determinar aparece —. Layout muestra coordenadas de papel, sin inventar correspondencia con Model. Alámbrica toma un punto cercano a segmento proyectado, no una intersección de sólido; BIM usa raycast y revierte el centrado de visualización. No transforma ejes Y-up/Z-up del archivo BIM sin metadatos.

Escape limpia selección, comandos, medidas y etiquetas, y avisos transitorios; los errores permanecen consultables. No elimina trazos confirmados ni color editado. Ángulos XY o espaciales entre dos líneas (ángulo menor no orientado) o tres puntos (segundo vértice), con snap. No hay medición interactiva en alámbrica/Layouts.

## Guardar

Guardar como ofrece DXF real. DXF ASCII se modifica en su flujo original: bloques, OBJECTS, Layouts, registros desconocidos y referencias permanecen; se aplican colores por handle y se añaden trazos confirmados. No reconstruye desde geometría renderizada. Normaliza saltos de línea; conserva bytes de texto existentes. Si falta handle o tabla necesaria se cancela en vez de omitir cambios. No admite DXF binario. Nuevos nombres de capa son UTF-8; archivos antiguos con otra página de códigos requieren comprobar caracteres nuevos.

DWG se convierte a DXF con `dwg_write_dxf` en worker local, usando el original y aplicando cambios después. La conversión puede perder objetos propietarios y datos no compatibles: se informa antes de descargar. El motor no expone escritura de DWG editado; no se ofrece falsa extensión DWG. Referencias y fuentes se mantienen enlazadas, no incrustadas. El botón DXF lateral sigue exportando solo trazos confirmados; PNG guarda imagen. Las medidas temporales no se guardan como geometría.

## Validación pendiente del archivo del usuario

La captura no permite comprobar fuentes, formato de hoja ni viewports almacenados. Se requiere DWG y PDF/referencia de AutoCAD para validar ese caso. No se declara corregida su fidelidad exacta.
