import type {CadDocument,CadEntity} from './vendor/cad/core/types';
import type {ProjectEntry} from './project-data';
export function combineCad(entries:{entry:ProjectEntry;doc:CadDocument}[]):CadDocument{
 const items=entries.filter(x=>x.entry.visible);if(!items.length)throw Error('Activa al menos un archivo CAD.');
 const units=(d:CadDocument)=>String(d.header?.$INSUNITS??d.header?.INSUNITS??d.units??'unknown');if(new Set(items.map(x=>units(x.doc))).size>1)throw Error('Los CAD tienen unidades diferentes. No se escalan ni alinean automáticamente.');
 const base=items[0].doc,entities:CadEntity[]=[],blocks:CadDocument['blocks']={},layers:CadDocument['layers']={},lineTypes:NonNullable<CadDocument['lineTypes']>={};
 for(const{entry,doc}of items){const prefix=entry.id+'|',ref=(name:string|undefined)=>!name||/^(BYLAYER|BYBLOCK|CONTINUOUS|14|15|16)$/i.test(name)?name:prefix+name,positive=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0?n:1,globalScale=positive(doc.header?.LTSCALE);let serial=0;const copy=(e:CadEntity,inBlock=false):CadEntity=>{const clone={...e,handle:prefix+(e.handle??'auto-'+(++serial)),layer:inBlock&&(!e.layer||e.layer==='0')?'0':prefix+(e.layer??'0'),blockName:e.blockName?prefix+e.blockName:undefined,attribs:e.attribs?.map(a=>copy(a,inBlock)),lineType:ref(e.lineType),lineTypeScale:positive(e.lineTypeScale??(/^(BYBLOCK|14)$/i.test(e.lineType??'')?1:doc.header?.CELTSCALE))*(/^(BYBLOCK|14)$/i.test(e.lineType??'')?1:globalScale),opacity:Number(e.opacity??1)*entry.opacity,mxProjectSource:entry.file.name};if(entry.color)Object.assign(clone,{trueColor:parseInt(entry.color.slice(1),16),color:entry.color,fillColor:entry.color,colorIndex:undefined,colorNumber:undefined});return clone;};
  for(const[k,l]of Object.entries(doc.layers))layers[prefix+k]={...l,name:prefix+l.name,lineType:ref(l.lineType)};
  for(const[k,t]of Object.entries(doc.lineTypes??{}))lineTypes[prefix+k]={...t,name:prefix+t.name,handle:t.handle?prefix+t.handle:undefined};
  if(!layers[prefix+'0'])layers[prefix+'0']={name:prefix+'0',isVisible:true};
  for(const[k,b]of Object.entries(doc.blocks))blocks[prefix+k]={...b,name:prefix+k,entities:b.entities.map(e=>copy(e,true))};
  entities.push(...doc.entities.map(e=>copy(e)));
 }
 return{...base,entities,blocks,layers,lineTypes,header:{...base.header,LTSCALE:1,CELTSCALE:1},raw:undefined,pages:undefined,savedView:undefined,metadata:{sceneTransformApplied:true,mxProjectComposite:true},warnings:['Vista conjunta de Model en coordenadas originales. Se presupone un sistema de coordenadas común; no se reproyectan ni se centran archivos por separado. Las presentaciones se consultan en cada archivo.']};
}
