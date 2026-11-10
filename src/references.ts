import type {CadDocument,CadEntity,CadViewer} from './vendor/cad/index';
import {sheetsOf,list,record,handle} from './drawing-spaces';
import {hatchDiagnostics} from './hatch-geometry';

export const basename=(name:string)=>name.replace(/\\/g,'/').split('/').at(-1)!.toLowerCase();
export function allEntities(doc:CadDocument):CadEntity[]{return [...doc.entities,...sheetsOf(doc).flatMap(s=>s.entities),...Object.values(doc.blocks).flatMap(b=>b.entities)];}
export function prepareReferences(doc:CadDocument){
  const defs=list(doc.metadata.mxImageDefs),styles=list(doc.metadata.mxTextStyles);
  for(const e of allEntities(doc)){
    if(e.type==='IMAGE'){
      const def=defs.find(d=>handle(d.handle)===handle(e.imageDefId));
      if(def)e.imageSource=def.fileName??def.filePath;
      // Never fetch a path or URL embedded in an untrusted drawing.
      if(!e.imageDataUrl)e.imageDataUrl=undefined;
    }
    if(e.kind==='text'||['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(e.type)){
      const r=record(e.raw),name=String(e.textStyleName??e.styleName??r.styleName??r.style??'STANDARD');
      const style=styles.find(s=>String(s.name).toLowerCase()===name.toLowerCase()||handle(s.handle)===handle(name));
      if(style){e.fontFile=style.fontFile;e.fontFamily=style.loadedFamily;e.fontWidthFactor=Number(style.widthFactor)>0?Number(style.widthFactor):1;}
    }
  }
}

export function fidelityWarnings(doc:CadDocument):string[]{
  const out=new Set<string>(),entities=allEntities(doc),loaded=(doc.metadata.mxLoadedReferences as string[]|undefined)??[];
  for(const e of entities){
    if(e.type==='HATCH')for(const message of hatchDiagnostics(e))out.add(`Aproximado: ${message}`);
    if(e.type==='IMAGE'&&!e.imageDataUrl)out.add(`Falta imagen: ${e.imageSource?basename(String(e.imageSource)):'IMAGEDEF sin ruta recuperable'}. Cárgala desde tu equipo.`);
    if(e.fontFile&&!loaded.includes(basename(String(e.fontFile))))out.add(`Falta fuente: ${basename(String(e.fontFile))}. El texto usa una fuente de sustitución.`);
    if(e.type==='SPLINE')out.add('Aproximado: SPLINE se muestra mediante su polígono de control.');
    if(e.type==='MTEXT')out.add('Aproximado: MTEXT conserva texto y orientación; el formato por fragmentos puede variar.');
    if(['ACAD_TABLE','TABLE'].includes(e.type)&&e.kind!=='insert')out.add('No compatible: tabla CAD sin bloque gráfico o posición recuperables; sus celdas pueden faltar.');
    if(e.type==='DIMENSION'&&e.kind!=='insert')out.add('No compatible: cota sin bloque gráfico recuperable; no se reconstruye su estilo automáticamente.');
    if(['3DSOLID','ACAD_PROXY_ENTITY','PROXY_ENTITY','OLE2FRAME','WIPEOUT'].includes(e.type))out.add(`No compatible: ${e.type}; la representación del plano puede ser parcial.`);
    if(e.type==='IMAGE'&&record(e).clipping)out.add('Aproximado: el recorte y los ajustes de brillo de imágenes pueden diferir.');
  }
  for(const [name,block]of Object.entries(doc.blocks)){
    const r=record(block.raw),path=String(r.xrefPath??r.pathName??r.xrefPathName??'');
    if((path||(Number(r.flags)&12))&&!r.mxReferenceLoaded)out.add(`Falta referencia externa: ${path?basename(path):name}. Carga su DWG o DXF local.`);
  }
  if(sheetsOf(doc).length)out.add('Aproximado: estilos de impresión CTB/STB, escalas anotativas y overrides de color por viewport no se reproducen completamente.');
  if(entities.some(e=>e.type==='HATCH'&&e.solidFill===0))out.add('Aproximado: patrones HATCH muy densos se simplifican a la resolución de pantalla para evitar bloqueos.');
  return [...out];
}

export async function loadLocalReference(doc:CadDocument,file:File,viewer:CadViewer){
  const name=basename(file.name),loaded=(doc.metadata.mxLoadedReferences??=[]) as string[];
  if(/\.shx$/.test(name)){await viewer.addReferenceFile(file);if(!loaded.includes(name))loaded.push(name);return;}
  if(/\.(ttf|otf)$/.test(name)){
    const family='MX_'+name.replace(/[^a-z0-9]/g,'_');const font=new FontFace(family,await file.arrayBuffer());await font.load();document.fonts.add(font);
    for(const s of list(doc.metadata.mxTextStyles))if(basename(String(s.fontFile??''))===name)s.loadedFamily=family;
    if(!loaded.includes(name))loaded.push(name);prepareReferences(doc);return;
  }
  if(/\.(png|jpg|jpeg|webp|bmp)$/.test(name)){
    const matches=allEntities(doc).filter(e=>e.type==='IMAGE'&&basename(String(e.imageSource??''))===name);
    if(!matches.length)throw Error(`La imagen ${file.name} no coincide con una referencia del dibujo.`);
    const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
    const image=new Image();image.src=data;await image.decode();for(const e of matches)e.imageDataUrl=data;
    if(!loaded.includes(name))loaded.push(name);return;
  }
  if(/\.(dwg|dxf)$/.test(name)){
    const stem=name.replace(/\.(dwg|dxf)$/,''),matches=Object.entries(doc.blocks).filter(([block,b])=>{
      const r=record(b.raw),path=String(r.xrefPath??r.pathName??r.xrefPathName??'');return !r.mxReferenceLoaded&&(path?basename(path).replace(/\.(dwg|dxf)$/,'')===stem:(Number(r.flags)&12)!==0&&block.toLowerCase()===stem);
    });
    if(!matches.length)throw Error(`El archivo ${file.name} no coincide con un bloque Xref pendiente.`);
    const detected=await viewer.registry.detect({file,fileName:file.name});
    const result=await detected.loader.load({file,fileName:file.name,buffer:detected.bytes},{wasmPath:new URL('wasm/',document.baseURI).href,keepRaw:true,workerTimeoutMs:120000,workerFactory:()=>new Worker(new URL('./vendor/cad/loaders/dwg/DwgWorker.ts',import.meta.url),{type:'module'})});
    const ref=result.document,prefix=stem+'|';prepareReferences(ref);
    const remap=(e:CadEntity):CadEntity=>({...e,layer:prefix+(e.layer??'0'),blockName:e.blockName?prefix+e.blockName:undefined,attribs:e.attribs?.map(remap)});
    for(const [key,layer]of Object.entries(ref.layers))doc.layers[prefix+key]={...layer,name:prefix+layer.name};
    for(const [key,b]of Object.entries(ref.blocks))doc.blocks[prefix+key]={...b,name:prefix+key,entities:b.entities.map(remap)};
    for(const [key]of matches)doc.blocks[key]={...doc.blocks[key],entities:ref.entities.map(remap),raw:{...record(doc.blocks[key].raw),mxReferenceLoaded:true}};
    if(!loaded.includes(name))loaded.push(name);return;
  }
  throw Error('Formato de referencia no compatible. Usa imágenes, SHX, TTF, OTF, DWG o DXF.');
}
