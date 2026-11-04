# Local CAD engine extensions

Source: https://github.com/flyfish-dev/cad-viewer
Pinned upstream commit: 0ce90d08bbf96aa780676ffeb81e0da12c575097 (package 0.8.3).
Author: Yu Wang and upstream contributors. License: AGPL-3.0-only.
The repository root LICENSE contains the AGPL license text.

MX CAD modifications: read native layout plot settings before freeing the DWG; separate model and paper entities; recover DXF OBJECTS and viewport records; render hatch patterns and islands; retain SHX/TTF text, image transforms and paper lineweights; expose the shared SHX resolver. The public upstream module remains pinned for its runtime assets and dependencies.

The runtime Vite alias and SHX dash-style pointer patch follow the upstream vite.worker.config.ts at this same commit. The worker is bundled locally with Vite; no drawing data is sent to a remote service.
