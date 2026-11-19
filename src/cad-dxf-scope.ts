import type {CadDocument,CadEntity,CadPoint3D} from './vendor/cad/core/types';
import type {DxfSource,DxfEntity,DxfBlock} from './drafting-data';
import {insertedPoint, planarPoint} from './world-geometry';

type Point = {x:number;y:number;z:number};
type Projection = (p:Point)=>{x:number;y:number}|undefined;
const toPoint = (p:CadPoint3D):Point => ({x:p.x,y:p.y,z:p.z??0});

export function cadDxfSources(
 doc:CadDocument|undefined,name:string,selected:ReadonlySet<CadEntity>,scope:string,
 project:Projection,inFrame:(p:{x:number;y:number}[])=>boolean,visible:(e:CadEntity)=>boolean
):{sources:DxfSource[];warnings:string[]} {
 if(!doc||scope==='draw-export')return {sources:[],warnings:[]};
 const sources=new Map<string,DxfSource>();
 const omitted=new Map<string,number>();
 const units=Number(doc.header?.$INSUNITS??doc.header?.INSUNITS??0);

 const selectedHandles=new Set([...selected].filter(e=>!!e.mxProjectId).flatMap(e=>e.handle?[e.handle]:[]));
 for(const entity of doc.entities){
  if(entity.isInPaperSpace)continue;
  if(scope==='dxf-selection'?(!selected.has(entity)&&(!entity.handle||!selectedHandles.has(entity.handle))):!visible(entity))continue;
  const key=String(entity.mxProjectId??name),label=String(entity.mxProjectSource??name);
  const current=sources.get(key);
  const dependencies=new Map<string,DxfBlock>();
  const encoded=encode(entity,doc,dependencies,new Set());
  if(!encoded){
   omitted.set(entity.type,(omitted.get(entity.type)??0)+1);
   continue;
  }
  if(scope==='dxf-frame'){
   const geometry=shapes(entity,encoded,dependencies,p=>p);
   if(!geometry.some(points=>{
    const screen=points.map(project);
    return screen.every(p=>p!==undefined)&&inFrame(screen);
   }))continue;
  }
  const declared=Number(entity.mxProjectUnits??units);
  const source:DxfSource=current??{id:key,name:label,units:Number.isInteger(declared)&&declared>=0&&declared<=24?declared:0,entities:[],blocks:new Map()};
  source.entities.push(encoded);
  for(const [block,definition] of dependencies)source.blocks!.set(block,definition);
  sources.set(key,source);
 }
 const warnings=omitted.size?['Entidades del modelo sin conversión en este alcance: '+[...omitted].map(([type,n])=>type+' ('+n+')').join(', ')+'.']:[];

 if(sources.size)warnings.push('Se escriben puntos, líneas, caras 3DFACE y bloques formados por entidades compatibles. Los tipos de línea personalizados y las propiedades extendidas se omiten.');
 return {sources:[...sources.values()],warnings};
}

function shapes(entity:CadEntity, encoded:DxfEntity,blocks:Map<string,DxfBlock>,transform:(point:Point)=>Point):Point[][] {
 if(!encoded.block)return [encoded.points.map(p=>transform(toPoint(planarPoint(p,entity))))];
 const block=blocks.get(encoded.block)!;
 const transformed=(p:Point)=>transform(toPoint(insertedPoint(p,block.base,entity)));
 return block.entities.flatMap(child=>shapes({
  type:child.type,insertionPoint:child.points[0],scale:child.scale,
  rotation:child.rotation===undefined?undefined:child.rotation*Math.PI/180,extrusionDirection:child.extrusion
 },child,blocks,transformed));
}

function encode(e:CadEntity,doc:CadDocument,blocks:Map<string,DxfBlock>,path:Set<string>):DxfEntity|undefined {
 const points=sourcePoints(e);
 if(!points)return;
 const layerName=e.layer??'0',layer=doc.layers[layerName];
 const output:DxfEntity={
  type:e.type as DxfEntity['type'],points,layer:layer?.name??layerName,
  color:typeof e.trueColor==='number'?e.trueColor:rgb(e.trueColor??e.color),aci:e.colorIndex??e.colorNumber,
  lineweight:e.lineweight,layerColor:layer?.trueColor??rgb(layer?.color),
  layerAci:layer?.colorIndex,layerWeight:layer?.lineweight,
  thickness:e.thickness,extrusion:e.extrusionDirection
 };
 if(e.type!=='INSERT')return output;
 const name=e.blockName??e.name,definition=name?doc.blocks[name]:undefined;
 if(!name||!definition||!definition.entities.length||e.attribs?.length||Number(e.rowCount??1)>1||Number(e.columnCount??1)>1||path.has(name)||path.size>=12)return;
 if(!blocks.has(name)){
  const entities:DxfEntity[]=[];
  path.add(name);
  for(const child of definition.entities){
   const exported=encode(child,doc,blocks,path);
   if(!exported)return;
   entities.push(exported);
  }
  path.delete(name);
  blocks.set(name,{base:toPoint(definition.basePoint??{x:0,y:0}),entities});
 }
 return {...output,block:name,scale:e.scale,rotation:e.rotation===undefined?undefined:e.rotation*180/Math.PI};
}

function sourcePoints(e:CadEntity){
 let authored:(CadPoint3D|undefined)[];
 switch(e.type){
  case 'INSERT': authored=[e.insertionPoint];break;
  case 'POINT': authored=[e.insertionPoint??e.position as CadPoint3D|undefined??e.startPoint??e.vertices?.[0]];break;
  case 'LINE': authored=[e.startPoint,e.endPoint];break;
  case '3DFACE': authored=(e.vertices??e.points??[]).slice(0,4);if(authored.length<3)return;break;
  default:return;
 }
 if(!authored.every(p=>p&&[p.x,p.y,p.z??0].every(Number.isFinite)))return;
 return authored.map(p=>toPoint(p!));
}
function rgb(value:unknown){
 if(typeof value==='number')return value>256?value:undefined;
 if(typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value))return parseInt(value.slice(1),16);
 if(value&&typeof value==='object'&&'r' in value&&'g' in value&&'b' in value)return (Number(value.r)<<16)|(Number(value.g)<<8)|Number(value.b);
}
