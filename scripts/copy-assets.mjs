import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'public/wasm'), { recursive: true });
await cp(join(root, 'node_modules/@flyfish-dev/cad-viewer/dist/wasm'), join(root, 'public/wasm'), { recursive: true });
