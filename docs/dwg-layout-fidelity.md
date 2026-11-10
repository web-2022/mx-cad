# Fidelidad de Layouts DWG

Se corrigieron causas generales en lectura, normalización y dibujo; no se introducen ajustes por nombre de archivo ni se altera la geometría de origen.

- El giro de los viewports ahora transforma WCS a DCS con el signo correcto y conserva el objetivo y centro de vista. El signo contrario desplazaba el contenido fuera de las ventanas giradas.
- La lectura nativa recupera el límite de recorte y las capas congeladas que el convertidor JS no exportaba. Se admite el recorte circular real, además del poligonal recto. Si falta un límite o su tipo sigue sin soporte, se mantiene el aviso en vez de inventarlo.
- Se utiliza el nombre de estructura que espera la API de LibreDWG para leer el tamaño, unidades, rotación y márgenes del papel. Al entrar a un Layout se ajusta la hoja almacenada; no se calculan formatos por proximidad de entidades.
- 3DFACE se dibuja con sus aristas en el renderizador 2D y respeta sus aristas invisibles. SOLID/TRACE conservan rellenos; la representación de superficies en el visor GPU 3D continúa disponible.
- MTEXT interpreta párrafos, espacios, controles de formato y caracteres escapados correctamente. El parser anterior buscaba barras invertidas duplicadas y no reconocía los comandos habituales. Los textos no se reducen ni se recortan para esconder errores.
- El renderizador utiliza el factor de anchura del estilo cuando no hay un factor explícito en la entidad. Las fuentes ausentes continúan identificándose por nombre y pueden cargarse localmente.

## Comprobación y límites

La prueba con un DWG privado compara capturas del mismo Layout antes y después; el archivo y las imágenes no se publican. Se recuperan la planta dentro del viewport girado, un detalle con hatch recortado circularmente y un perfil cuyas caras antes tapaban las anotaciones. El contenido se conserva en sus coordenadas; las correcciones actúan sobre datos y representación.

La comparación no demuestra compatibilidad completa con AutoCAD. Permanecen limitaciones en tablas CAD modernas cuya posición/celdas no entrega el lector, logotipos OLE, estilos CTB/STB, formato MTEXT por fragmentos y fuentes SHX no adjuntas. No se insertan bloques de tablas en posiciones deducidas ni se reemplazan por contenido inventado. Las tablas sin representación recuperable generan un aviso explícito.

El procesamiento es local y no añade servicios ni dependencias. Se reutilizan las cachés de escenas, bloques y hatch de cada viewport al navegar; las exportaciones PNG usan el mismo renderizador. Las pruebas nuevas cubren giro WCS/DCS, recorte circular, capas congeladas nativas, párrafos MTEXT y la diferencia entre 3DFACE y SOLID en 2D. La suite existente comprueba CAD, Layouts, GPU, BIM, Datamine, edición y exportaciones.

Durante pan con arrastre y zoom con rueda, el visor reutiliza temporalmente una imagen de la hoja. No recorre la geometría por cada evento. Al soltar el arrastre, al detener la rueda o al exportar PNG vuelve a dibujar todas las entidades compatibles a la resolución final. La escala y las coordenadas siguen usando la vista real. Esto no constituye una simplificación permanente ni omite entidades para aparentar velocidad.
