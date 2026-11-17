# Organización del proyecto local

- **Cargar archivos** añade archivos consecutivos o varios a la vez. Model de CAD y modelos de bloques compatibles se incorporan automáticamente a una escena común. Las coordenadas originales se conservan; no hay alineación ni reproyección automática. Las unidades declaradas incompatibles impiden combinar y el archivo queda disponible para consulta individual.
- El panel izquierdo contiene los archivos. El triángulo despliega sus capas, espacios o herramientas. El nombre selecciona sus propiedades sin volver a leer ni reconstruir la escena. La casilla cambia su visibilidad. Ocultar conserva los ajustes.
- En Propiedades puedes cambiar el nombre mostrado, ajustar al archivo o a toda la escena y quitarlo del proyecto. El archivo original nunca se borra. En escenas de CAD y bloques, el color uniforme y la opacidad son cambios de apariencia, no ediciones del archivo fuente.
- Las capas CAD tienen casillas propias. Los Layouts se abren individualmente como hojas; no forman parte de la escena espacial.
- Los modelos de bloques muestran los atributos como una lista de campos, no una fila por bloque. **Editar este modelo** abre su contexto de filtros, leyendas y cortes a la derecha. Los controles pertenecen únicamente al modelo activo seleccionado; cambiar el contexto de edición reconstruye la escena conservando sus ajustes y cámara. La selección del archivo y el despliegue del árbol no lo hacen.
- IFC, GLB y glTF permanecen en el árbol para consulta individual y muestran los elementos recuperados. No comparten escena con CAD y bloques. En árboles BIM de más de 500 elementos, utiliza la búsqueda del archivo individual para consultar los restantes.
- **Abrir individualmente** permite las herramientas propias del archivo. **Volver a la escena del proyecto** recupera la escena común después de una consulta individual; no es un paso requerido al importar.
- Los botones junto a Archivos y Propiedades contraen cada panel; Paneles oculta ambos. El visor aprovecha el ancho disponible.
- **Proyecto** conserva Guardar proyecto y Abrir proyecto. `.mxproject` versión 2 guarda los originales, los nombres mostrados, ramas principales, visibilidad, selección y ajustes. Se leen también proyectos de versión 1; el nombre original y las ramas contraídas son sus valores iniciales. Guardar descarga una copia local; no sube datos.
- **Nuevo proyecto** y Abrir proyecto ofrecen guardar, descartar o cancelar cuando hay cambios pendientes. Guardar inicia la descarga antes de sustituir el proyecto.

## Límites

La superposición CAD utiliza los trazos y caras explícitas compatibles. Textos, hatch, imágenes y las presentaciones se consultan en el archivo individual; no se promete equivalencia con AutoCAD en la escena compartida. La edición de datos CAD se realiza en el archivo individual. Los trazos de sesión se conservan en su archivo individual y en el proyecto; no se añaden a la superposición espacial. La opacidad de la escena afecta superficies y trazos compatibles; los Layouts mantienen su representación propia. Las unidades desconocidas se avisan; nunca se asigna una proyección geográfica por suposición. Los límites de modelos de bloques incluyen sus dimensiones y orientación; BIM muestra los límites originales recuperados. La consulta individual de un archivo y el cambio del contexto de edición pueden volver a preparar sus recursos; seleccionar un archivo en el árbol no los reconstruye.

Las pruebas utilizan exclusivamente archivos sintéticos y fixtures públicos del repositorio. Los archivos del usuario no se publican.
