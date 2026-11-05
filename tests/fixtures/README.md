# CAD regression fixtures

- layouts.dxf: generated for MX CAD, with two independently owned layouts, two viewport scales/orientations, a hatch with an island, layer freezing, a title block with an instance attribute, a dimension graphics block and a local image reference.
- ref.png: generated 2×2 blue image for the local reference test.
- HatchG.dwg: public LibreDWG regression file from https://github.com/mlightcad/libredwg-web/blob/master/test/test-data/2004/HatchG.dwg (GPL-3.0). Used to test actual binary DWG layout extraction. Its copyright/license remain with the LibreDWG project; MX CAD is AGPL-3.0-only.

No user drawings are stored here. A file opened manually is never committed or uploaded by the application.

- model.glb / model.gltf / model.bin: triángulo con material y metadatos extras, generado para MX CAD.
- wall.ifc: muro IFC4 extruido de 2 × 0.2 × 3 m, generado para MX CAD.
