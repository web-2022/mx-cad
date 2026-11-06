/// <reference lib="webworker" />
import {createLibreDwg} from './vendor/cad/loaders/dwg/DwgParser';
const scope=self as DedicatedWorkerGlobalScope;
scope.onmessage=async(e:MessageEvent<{bytes:ArrayBuffer;wasmPath:string}>)=>{try{const lib=await createLibreDwg(e.data.wasmPath);if(typeof lib.instance.dwg_write_dxf!=='function')throw Error('Este motor no incorpora escritura DXF');const bytes=lib.instance.dwg_write_dxf(e.data.bytes);if(!bytes?.length)throw Error('LibreDWG no pudo convertir este archivo a DXF');const copy=new Uint8Array(bytes);scope.postMessage({bytes:copy.buffer},[copy.buffer]);}catch(error){scope.postMessage({error:error instanceof Error?error.message:String(error)});}};
