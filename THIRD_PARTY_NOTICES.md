# Componentes de terceros

- @flyfish-dev/cad-viewer: AGPL-3.0-only. https://github.com/flyfish-dev/cad-viewer
- dwf-viewer: AGPL-3.0-only. Dependencia del visor.
- @mlightcad/libredwg-web / GNU LibreDWG: GPL-3.0. https://github.com/mlightcad/libredwg-web
- Electron: MIT, e incluye componentes con licencias propias. https://github.com/electron/electron
- Vite y TypeScript: MIT y Apache-2.0, respectivamente.

Las licencias y avisos completos de los componentes están incluidos en sus paquetes de npm. El plano `public/ejemplo.dxf` es un ejemplo original generado para este proyecto.



The local modified CAD engine under src/vendor/cad is derived from @flyfish-dev/cad-viewer by Yu Wang and contributors, commit 0ce90d08bbf96aa780676ffeb81e0da12c575097, AGPL-3.0-only. See src/vendor/cad/UPSTREAM.md and LICENSE. The public tests/fixtures/HatchG.dwg comes from the LibreDWG project via mlightcad/libredwg-web, GPL-3.0; see tests/fixtures/README.md.


- Three.js 0.180.0 — MIT — https://github.com/mrdoob/three.js/tree/r180. Copyright Three.js authors. Distribución de licencia en `licenses/three.txt`.
- web-ifc 0.0.72 — MPL-2.0 — https://github.com/ThatOpen/engine_web-ifc/tree/0.72. Distribuido sin modificar, incluyendo WebAssembly; el código fuente correspondiente está disponible en ese enlace. Licencia en `licenses/web-ifc.txt`.
- Los archivos de prueba `model.glb`, `model.gltf`, `model.bin` y `wall.ifc` se generaron para MX CAD y se distribuyen bajo la licencia del proyecto.

- Lector auxiliar de prefijos TABLE: GNU LibreDWG/mlightcad, GPL-3.0, commit `4c9bf7fe2492beaad872c34ee36d810f70fd5f02`. Fuente correspondiente completa: https://github.com/mlightcad/libredwg-web/tree/4c9bf7fe2492beaad872c34ee36d810f70fd5f02 . Se distribuyen JavaScript/WASM verificados por SHA-256; el motor general sigue sin cambios. Aviso en `licenses/table-reader.txt`.
- La estructura CTB se contrastó con la implementación pública de ezdxf (MIT): https://github.com/mozman/ezdxf/blob/master/src/ezdxf/addons/acadctb.py . El lector TypeScript local usa APIs estándar, sin incorporar una dependencia Python.
