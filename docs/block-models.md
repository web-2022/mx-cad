# Modelos de bloques locales

## Uso

1. **Abrir plano** acepta también `.dm`, `.csv`, `.txt` y `.tsv`. Arrastrar un único modelo al visor funciona igual. Los RAR se descomprimen previamente en el equipo del usuario.
2. DM compatible se lee en un worker local. Las tablas abren un asistente de separador, decimal, encabezados, unidades, nulos, centroides/esquinas, columnas y dimensiones constantes explícitas. Las tablas no se anuncian como Datamine nativo.
3. La barra derecha permite seleccionar, orbitar, pan con botón central, zoom, ventana, encuadre anterior y vistas. El panel del modelo permite sólido o wireframe. Selecciona un bloque para consultar registro, coordenadas mundiales, dimensiones, volumen individual y atributos; Escape limpia la selección.
4. **Filtros por atributos** permite condiciones, grupos AND/OR anidados, desactivación, edición, eliminación, categorías múltiples y nulos. Usa dos condiciones para un rango numérico. Pulsa Aplicar. Los filtros no modifican registros originales.
5. **Leyendas guardadas** conserva las leyendas de la sesión, permite aplicar, duplicar, crear y eliminar. En **Editor de leyenda** configura nombre, campo, modo, unidades, opacidad, colores, límites, etiquetas y orden. Pulsa Guardar y aplicar. Escalas: uniforme, continua, intervalos, categorías. Los límites permanecen fijos al filtrar.
6. Los intervalos son `[mínimo, máximo)`, salvo la marca incluir máximo. Se rechazan límites inválidos, intervalos superpuestos/desordenados y categorías repetidas. Huecos, categorías sin correspondencia y valores fuera de escala tienen un color explícito, distinto del color de nulos. Las entradas del editor se paginan y la leyenda del visor permite desplazamiento y carga de más entradas.
7. **Interpretación de campos** permite tratar códigos numéricos como categorías. Se mantienen los datos de origen. Cambiar la interpretación restablece filtros y leyendas de la sesión: guarda el JSON antes de hacerlo.
8. **Cortes y ocultación** distingue franjas por centroide en Este/X, Norte/Y y Elevación/Z; planos de recorte gráfico sin tapas; aislamiento; ocultación manual; y restablecimiento completo. El estado indica por qué un bloque puede quedar oculto. Los recuentos visibles y CSV no aplican el recorte gráfico; lo indican expresamente.
9. Exporta registros coincidentes por atributos o visibles por filtros/franjas/ocultación a CSV. PNG puede incluir la leyenda. Si no cabe completa en la imagen, se identifica como parcial; el JSON conserva todas las entradas. Estas exportaciones no escriben DM ni DMX.

## Compatibilidad real

| Formato o geometría | Estado |
|---|---|
| DM heredado con firma 987654/456789, 32/64 bits, little/big endian | Lector local; fixtures sintéticas para las cuatro combinaciones |
| Cabeceras extendidas, campos numéricos explícitos/implícitos | Compatibles; páginas de 508 palabras útiles más cuatro reservadas |
| Bloques regulares y subbloques de dimensiones variables | Cada registro usa XINC/YINC/ZINC reales; no se asumen cubos |
| DM rotado con origen/ángulos/ejes comunes implícitos | Transformación CDTRAN inversa local a mundo; origen local reversible para GPU |
| Cadenas alfanuméricas de una palabra | Lectura de cuatro caracteres por palabra; no se asume UTF-8 en DM |
| Cadenas DM de múltiples palabras, descriptores repetidos, orientaciones por registro | Rechazados con error, no omitidos |
| Archivos DM sin firma, DMX, formatos comprimidos y otras variantes | No compatibles; no se deducen por extensión |
| CSV/texto UTF-8 delimitado | Compatible con asignación; bloques alineados a ejes, centroides o esquinas |
| Jerarquía con padres y sus hijos como registros de geometría | No se deduce ni se elimina geometría: exportar solo hojas para su exploración |
| Leyendas propietarias Datamine/Deswik | Sin lector verificado; únicamente JSON MX CAD documentado |
| CRS geográfico, unidades ausentes | No se infieren. Norte=Y, Este=X, elevación=Z del dibujo |

`IJK` se conserva, pero no se utiliza como identificador único: varios subbloques pueden compartirlo. La selección utiliza el índice original del registro. Las constantes implícitas se preservan y exportan para cada registro. El valor ausente numérico DM `-1e30` se representa como nulo, no como ley negativa.

Los volúmenes individuales son DX × DY × DZ. El volumen agregado se deja sin calcular cuando no se ha verificado la ausencia de solapes/duplicidad entre padres e hijos. No se infieren toneladas, densidad, ley ponderada ni jerarquías. Se muestran cantidad filtrada y rangos numéricos con recuento de nulos.

La transparencia utiliza el orden de instancias del motor: puede mostrar artefactos de ordenación en bloques superpuestos. El recorte GPU no crea tapas ni sólidos nuevos. Las coordenadas sobre planos de recorte describen el punto de intersección con el bloque; no implican una cara añadida al modelo.

## JSON local, versión 1

```json
{
  "format": "mx-cad-blocks",
  "version": 1,
  "fieldTypes": {"AU": true, "ZONE": false},
  "legends": [],
  "filter": {"join": "AND", "children": []}
}
```

El archivo real debe contener al menos una leyenda. Cada leyenda guarda `name`, `field`, `mode`, `units`, `opacity`, `color`, `low`, `high`, `nullColor`, `outside`, `min`, `max`, `entries`. Una entrada contiene `label`, `color` y `value` para categorías, o `min`, `max`, `inclusive` para intervalos. Una condición guarda `field`, `op`, `value`, `enabled`; un grupo guarda `join`, `children`, `enabled`. Operadores: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `null`, `not-null`.

La carga comprueba versión, existencia y tipos de campos, colores, límites y filtros antes de aplicarlos. No incluye datos del modelo, cortes, ocultaciones o rutas del equipo. No se transmite nada a servicios externos.

## Arquitectura y licencias

Sin nuevas dependencias. Se reutiliza Three.js (MIT) y la aplicación conserva AGPL-3.0. El lector TypeScript no necesita SDK de pago ni un backend; el worker y los módulos se publican como recursos estáticos de GitHub Pages.

Se inspeccionó el lector C++ de [ParaView](https://github.com/Kitware/ParaView/tree/master/Plugins/Datamine/Readers) (BSD-3-Clause), que no constituye por sí solo una integración navegador y tiene restricciones en lectores históricos. La estructura del lector local y su validación no requieren distribuir ni compilar ese motor. Referencias de coordenadas: [CDTRAN oficial](https://docs.dataminesoftware.com/StudioRM/2.2/Process_Help_XML/cdtran.htm), [campos de modelos Datamine](https://docs.dataminesoftware.com/IsatisNeo/Latest/Isatis-Users-Guide/Import-Datamine-Block-Model.html).

Una sola geometría de caja compartida y un InstancedMesh representan el modelo. Rotar/pan/zoom solo actualizan cámara y render; no reconstruyen geometría. El cambio de leyenda solo modifica colores/material. El filtro compacta matrices e índices de registros visibles y preserva el conjunto original. La selección usa un BVH de cajas en el sistema común orientado. Se liberan worker, buffers, controles y contexto al cerrar o sustituir modelo.

## Validación y mediciones

Las pruebas automáticas incluyen DM sintético 32/64 bits, ambas ordenaciones de bytes, cabeceras extendidas, subbloques, rotaciones, ausentes, filtros anidados, extremos de intervalos, configuraciones, CSV y transición de bloques a Layout CAD y GLB. La transformación se comprueba contra el ejemplo numérico publicado de CDTRAN, además de su inversa matemática.

Un archivo privado se usa solo localmente y no se publica con sus datos ni capturas. No se afirma coincidencia visual con Datamine/Deswik sin una referencia del usuario. Las mediciones de la sesión aparecen en el panel Rendimiento: lectura, preparación, filtrado, recoloreado, selección y envío de render CPU. No son tiempos GPU ni FPS, y no equivalen a una comparación con un producto de escritorio.

### Mediciones locales del modelo privado

Prueba en Linux, AMD EPYC 9V74, Chromium 156 con SwiftShader (render por software), ventana 1500 × 1000; 241 277 registros y 82 campos. No se publica el archivo ni sus atributos. Primera medición del visor nuevo:

| Operación | Tiempo CPU / pared |
|---|---:|
| Apertura completa, incluida carga y preparación | 7,39 s |
| Lectura DM en worker | 749 ms |
| Preparación de instancias e índice | 1 198 ms |
| Filtrado y estadísticas (condición coincidente con todos) | 207 ms |
| Recoloreado completo | 99 ms |
| Actualización de cámara, media de 10 comandos | 0,08 ms |

Se dibujaron 241 277 instancias, 2 895 324 triángulos y una llamada de dibujo. La identidad de geometría y la versión de matrices permanecieron iguales al cambiar la cámara. Los tiempos de actualización CPU no significan FPS: la rasterización por software puede ser sensiblemente más lenta. Antes de esta funcionalidad DM no se podía abrir, por lo que no existe una comparación antes/después de navegación del mismo formato. El panel permite medir otras máquinas y modelos.

Segunda ejecución con selección: apertura 10,00 s; lectura 722 ms; preparación 1 410 ms; filtrado 185 ms; recoloreado 61 ms; selección media 0,22 ms en diez rayos. Sin errores JavaScript. Se conservaron las 241 277 instancias tras filtrar y restablecer. La variación de apertura entre ejecuciones muestra por qué estos datos no garantizan el mismo tiempo en otros equipos.

Los nombres reconocidos IJK, ZONE, DOMAIN/DOMINIO, LITHO/LITO/LITHOLOGY, CLASS/CLASE y CATE/CATVP/CATE_S se interpretan inicialmente como categorías aun cuando estén almacenados numéricamente. Otros campos numéricos mantienen su tipo almacenado y se pueden reclasificar en el panel. La leyenda inicial prefiere campos AU/AG/CU/PB/ZN cuando existen.
