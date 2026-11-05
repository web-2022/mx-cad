import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'public/wasm'), { recursive: true });
await cp(join(root, 'node_modules/@flyfish-dev/cad-viewer/dist/wasm'), join(root, 'public/wasm'), { recursive: true });


await mkdir(join(root, 'public/ifc'), {recursive:true});
await cp(join(root, 'node_modules/web-ifc/web-ifc.wasm'), join(root, 'public/ifc/web-ifc.wasm'));

await mkdir(join(root,'public/licenses'),{recursive:true});
await cp(join(root,'node_modules/three/LICENSE'),join(root,'public/licenses/three.txt'));
await cp(join(root,'node_modules/web-ifc/LICENSE.md'),join(root,'public/licenses/web-ifc.txt'));
