/// <reference types="vite/client" />
import {createExtractorFromData} from 'node-unrar-js/esm/index.esm.js';
import wasmUrl from 'node-unrar-js/esm/js/unrar.wasm?url';

const maxBytes=512*1024*1024;
const supported=/\.(?:mxproject|dwg|dxf|ifc|glb|gltf|bin|dm|dmx|csv|txt|tsv|png|jpe?g|webp|bmp|shx|ttf|otf|ctb|stb)$/i;

self.onmessage=async ({data}:MessageEvent<File>)=>{
 try{
  const response=await fetch(wasmUrl);
  if(!response.ok)throw Error('No se pudo iniciar el lector RAR.');
  const extractor=await createExtractorFromData({data:await data.arrayBuffer(),wasmBinary:await response.arrayBuffer()});
  const {arcHeader,fileHeaders}=extractor.getFileList();
  if(arcHeader.flags.volume)throw Error('Extrae primero el RAR dividido en volúmenes.');
  let total=0,count=0;
  const names=new Set<string>();
  for(const header of fileHeaders){
   if(++count>10000)throw Error('El RAR contiene demasiadas entradas.');
   if(header.flags.directory||!supported.test(header.name))continue;
   if(header.flags.encrypted)throw Error('Extrae primero los archivos protegidos con contraseña.');
   total+=header.unpSize;
   if(!Number.isSafeInteger(header.unpSize)||header.unpSize<0||total>maxBytes)throw Error('El contenido compatible excede 512 MiB descomprimidos.');
   if(names.has(header.name))throw Error('El RAR contiene entradas repetidas. Extrae los archivos antes de cargarlos.');
   names.add(header.name);
  }
  if(!names.size)throw Error('El RAR no contiene formatos compatibles con MX CAD.');
  const files:File[]=[];
  for(const {fileHeader,extraction} of extractor.extract({files:header=>names.has(header.name)}).files){
   if(!extraction||extraction.byteLength!==fileHeader.unpSize)throw Error('No se pudo extraer una de las entradas completas.');
   const name=fileHeader.name.split(/[\\/]/).at(-1)!;
   files.push(new File([extraction as BlobPart],name));
  }
  if(files.length!==names.size)throw Error('No se extrajeron todos los archivos compatibles.');
  const basenames=new Set<string>();
  for(const file of files){
   const name=file.name.toLowerCase();
   if(basenames.has(name))throw Error('Hay archivos con el mismo nombre en carpetas distintas. Cárgalos por separado.');
   basenames.add(name);
  }
  self.postMessage({files});
 }catch(error){
  self.postMessage({error:error instanceof Error?error.message:'No se pudo leer el RAR.'});
 }
};
