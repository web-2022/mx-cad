export type DraftPoint={x:number;y:number;z:number};
export type DraftEntity={id:string;type:'POINT'|'LINE';points:DraftPoint[];color?:string;lineweight?:number;markerSize?:number};
export type DraftFile={id:string;name:string;visible:boolean;entities:DraftEntity[]};
export function validateDrafts(input:unknown):DraftFile[]{
 if(!Array.isArray(input)||input.length>100)throw Error('Archivos de dibujo no válidos.');
 const ids=new Set<string>();
 return input.map((f:any)=>{if(!f||typeof f.id!=='string'||ids.has(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>255||typeof f.visible!=='boolean'||!Array.isArray(f.entities)||f.entities.length>100000)throw Error('Archivo de dibujo no válido.');ids.add(f.id);
 const entities=f.entities.map((e:any)=>{if(!e||typeof e.id!=='string'||!['POINT','LINE'].includes(e.type)||!Array.isArray(e.points)||e.points.length!==(e.type==='POINT'?1:2)||e.points.some((p:any)=>!p||![p.x,p.y,p.z].every(Number.isFinite)))throw Error('Entidad de dibujo no válida.');const style: Pick<DraftEntity,'color'|'lineweight'|'markerSize'> = {};
 if (typeof e.color === 'string' && /^#[a-f0-9]{6}$/i.test(e.color)) style.color = e.color;
 if (Number.isInteger(e.lineweight) && e.lineweight >= 0 && e.lineweight <= 211) style.lineweight = e.lineweight;
 if (Number.isFinite(e.markerSize) && e.markerSize >= 1 && e.markerSize <= 64) style.markerSize = e.markerSize;
 return{id:e.id,type:e.type,points:e.points.map((p:any)=>({x:p.x,y:p.y,z:p.z})),...style};});return{id:f.id,name:f.name,visible:f.visible,entities};});
}
export const draftStore = { files: [] as DraftFile[], activeId: undefined as string | undefined };
export const lineweights = [0,5,9,13,15,18,20,25,30,35,40,50,53,60,70,80,90,100,106,120,140,158,200,211];

export type DxfEntity = {
 type:'POINT'|'LINE'|'3DFACE'|'INSERT'; points:DraftPoint[]; layer:string; color?:number; aci?:number;
 lineweight?:number; layerColor?:number; layerAci?:number; layerWeight?:number;
 block?:string; rotation?:number; scale?:{x:number;y:number;z?:number};
 thickness?:number; extrusion?:{x:number;y:number;z?:number};
};
export type DxfBlock = {base:DraftPoint;entities:DxfEntity[]};
export type DxfSource = {id:string;name:string;units:number;entities:DxfEntity[];blocks?:Map<string,DxfBlock>};

export function draftSource(file:DraftFile): DxfSource {
 return {id:file.id,name:file.name,units:0,entities:file.entities.map(entity=>({
  type:entity.type,points:entity.points,layer:'MX_DIBUJO',
  color:parseInt((entity.color??'#ffbf35').slice(1),16),lineweight:entity.type==='LINE'?(entity.lineweight??25):undefined
 }))};
}
export function draftDxf(file:DraftFile) { return writeScopeDxf([draftSource(file)]); }
export function writeScopeDxf(sources:DxfSource[]) {
 const differentUnits=new Set(sources.map(s=>s.units));
 const units=differentUnits.size===1?sources[0].units:0;
 const used=new Set<string>(),usedBlocks=new Set<string>();
 const layers=new Map<DxfSource,Map<string,{name:string;style:DxfEntity}>>();
 const blockNames=new Map<DxfSource,Map<string,string>>();
 function nameFor(original:string,unique:Set<string>){
  const base=original.replace(/[<>\/\\":;?*|=\x00-\x1f]/g,'_').slice(0,220)||'0';
  let name=base,i=2;while(unique.has(name.toUpperCase()))name=base+'_'+i++;
  unique.add(name.toUpperCase());return name;
 }
 for(const source of sources){
  const names=new Map<string,{name:string;style:DxfEntity}>();layers.set(source,names);
  const blocks = new Map<string,string>();blockNames.set(source,blocks);
  for(const key of source.blocks?.keys()??[])blocks.set(key,nameFor(key,usedBlocks));
  const blockEntities=[...(source.blocks?.values()??[])].flatMap(block=>block.entities);
  for(const style of [...source.entities,...blockEntities]){
   if(names.has(style.layer))continue;
   const name=nameFor(style.layer,used);
   names.set(style.layer,{name,style});
  }
 }
 const out:(string|number)[]=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1021',9,'$INSUNITS',70,units,0,'ENDSEC',
  0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,used.size];
 const emittedLayers=new Set<string>();
 for(const names of layers.values())for(const {name,style} of names.values()){
  if(emittedLayers.has(name))continue;
  emittedLayers.add(name);
  out.push(0,'LAYER',100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,name,70,0,62,style.layerAci??7,6,'CONTINUOUS');
  if(style.layerColor!==undefined)out.push(420,style.layerColor);
  if(style.layerWeight!==undefined)out.push(370,style.layerWeight);
 }
 out.push(0,'ENDTAB',0,'ENDSEC');
 function writeEntity(source:DxfSource,entity:DxfEntity,inBlock=false){
  const name=inBlock&&entity.layer==='0'?'0':layers.get(source)!.get(entity.layer)!.name;
  out.push(0,entity.type,100,'AcDbEntity');
  if(entity.aci!==undefined)out.push(62,entity.aci);
  if(entity.color!==undefined)out.push(420,entity.color);
  if(entity.lineweight!==undefined)out.push(370,entity.lineweight);
  out.push(8,name,100,entity.type==='POINT'?'AcDbPoint':entity.type==='LINE'?'AcDbLine':entity.type==='INSERT'?'AcDbBlockReference':'AcDbFace');
  if(entity.block)out.push(2,blockNames.get(source)!.get(entity.block)!);
  const points=entity.type==='3DFACE'&&entity.points.length===3?[...entity.points,entity.points[2]]:entity.points;
  points.forEach((p,i)=>out.push(10+i,p.x,20+i,p.y,30+i,p.z));
  if(entity.scale)out.push(41,entity.scale.x,42,entity.scale.y,43,entity.scale.z??1);
  if(entity.rotation!==undefined)out.push(50,entity.rotation);
  if(entity.thickness!==undefined)out.push(39,entity.thickness);
  if(entity.extrusion)out.push(210,entity.extrusion.x,220,entity.extrusion.y,230,entity.extrusion.z??0);
 }
 if(usedBlocks.size){
  out.push(0,'SECTION',2,'BLOCKS');
  for(const source of sources)for(const [key,block] of source.blocks??[]){
   const name=blockNames.get(source)!.get(key)!;
   out.push(0,'BLOCK',100,'AcDbEntity',8,'0',100,'AcDbBlockBegin',2,name,70,0,10,block.base.x,20,block.base.y,30,block.base.z,3,name,1,'');
   for(const entity of block.entities)writeEntity(source,entity,true);
   out.push(0,'ENDBLK',100,'AcDbEntity',8,'0',100,'AcDbBlockEnd');
  }
  out.push(0,'ENDSEC');
 }
 out.push(0,'SECTION',2,'ENTITIES');
 for(const source of sources)for(const entity of source.entities)writeEntity(source,entity);
 return [...out,0,'ENDSEC',0,'EOF'].join('\n')+'\n';
}
