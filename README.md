# MX CAD

Aplicación de escritorio para Windows que permite visualizar planos **DWG y DXF** de manera local, sin instalar AutoCAD ni subir los dibujos a un servidor.

![MX CAD mostrando el plano DXF de ejemplo](docs/visor.png)

## Funciones

- Abrir un archivo o arrastrarlo al visor.
- Vista 2D con zoom, desplazamiento y ajuste a pantalla.
- Vista 3D alámbrica de líneas, puntos, arcos y polilíneas compatibles, con coordenadas Z originales.
- Giro, desplazamiento, zoom y vistas isométrica, superior y frontal en 3D.
- Buscar capas y activar o desactivar su visualización.
- Exportar la vista actual a PNG.
- Plano DXF de ejemplo incluido.
- Avisos de lectura y cancelación de la apertura.

## Ejecutar

Requisitos: Windows y Node.js 22.12 o posterior, con npm.

```powershell
npm install
npm start
```

`npm start` compila el proyecto y abre la ventana de escritorio. Electron sirve los recursos exclusivamente en `127.0.0.1` con un puerto asignado por el sistema. No hay servicio de subida de planos.

Para desarrollo en navegador: `npm run dev`. Para compilar: `npm run build`.

Atajos: **Ctrl+O** abre un plano y **F** ajusta la vista. La rueda hace zoom y arrastrar desplaza el plano.

## Compatibilidad

Es un visor con vista 2D y vista 3D alámbrica, no un editor ni un sustituto completo de AutoCAD. La compatibilidad DWG depende de LibreDWG. La vista 3D utiliza la geometría que entrega el lector: un plano sin alturas Z permanece plano. No reconstruye volúmenes ni renderiza sólidos ACIS o mallas. Las entidades propietarias, otros objetos 3D, referencias externas y fuentes ausentes pueden generar una vista parcial. No se garantiza fidelidad de todas las versiones de DWG/DXF. No se modifica el archivo original. Los cambios de visibilidad de capas afectan únicamente a la vista.

## Pruebas

`npm test` inicia Electron con ventana oculta y comprueba la apertura del DXF incluido, las capas, el zoom, la exportación PNG y el tratamiento de archivos inválidos. Requiere haber ejecutado `npm run build`.

También se probó la apertura de `example_2000.dwg` de [LibreDWG](https://github.com/LibreDWG/libredwg/tree/master/test/test-data). Para incluir otro DWG en las pruebas, define `MX_CAD_DWG_FIXTURE` con su ruta antes de ejecutar `npm test`. Los archivos personales de prueba no se incluyen en el repositorio.

## Motor y licencia

Este proyecto usa [@flyfish-dev/cad-viewer](https://github.com/flyfish-dev/cad-viewer), bajo AGPL-3.0-only, y su lector DWG basado en [LibreDWG WebAssembly](https://github.com/mlightcad/libredwg-web). MX CAD se distribuye bajo **AGPL-3.0-only**. Las dependencias conservan sus licencias respectivas; ver `THIRD_PARTY_NOTICES.md`.


## Vista 3D

Abre un DXF o DWG y pulsa **3D**. Arrastra para girar, usa **Mayúsculas + arrastrar** para desplazar y la rueda o los botones +/− para acercar. El selector cambia entre isométrica, superior y frontal. Las capas controlan también la vista 3D y **Exportar PNG** guarda la vista actual. Pulsa **2D** para volver a las herramientas de dibujo. Los trazos de sesión permanecen en la vista 2D.
