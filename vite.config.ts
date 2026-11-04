import {defineConfig,type Plugin} from 'vite';
import {fileURLToPath} from 'node:url';
const local=(path:string)=>fileURLToPath(new URL(path,import.meta.url));
// Use the lean LibreDWG wrapper and the same public WASM/runtime as cad-viewer.
function runtimePatch():Plugin{return{name:'mx-cad-libredwg-runtime',enforce:'pre',resolveId(source,importer){
  if(source==='../wasm/libredwg-web.js'&&importer?.includes('@mlightcad/libredwg-web/lib/libredwg.js'))return local('./src/vendor/cad/loaders/dwg/libredwgWasmModuleProxy.ts');
},transform(code,id){
  if(!id.includes('@mlightcad/libredwg-web'))return;
  const next=code.replace(/\s*\/\/ TODO: convert style handle to style object id\s*\/\/ styleObjectId: dash\.style,/,'\n styleObjectId: dash.style ? idToString(this.libredwg.dwg_ref_get_absref(dash.style)) : undefined,');
  if(next!==code)return{code:next,map:null};
}};}
export default defineConfig({
  resolve:{alias:{'@mlightcad/libredwg-web':local('./node_modules/@mlightcad/libredwg-web/lib/index.js')}},
  plugins:[runtimePatch()],
  worker:{format:'es',plugins:()=>[runtimePatch()]}
});
