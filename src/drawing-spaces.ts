import type { CadDocument, CadEntity, CadPoint2D } from './vendor/cad/index';

export interface PaperViewport {
  id: string; center: CadPoint2D; width: number; height: number;
  viewCenter: CadPoint2D; target: CadPoint2D; viewHeight: number; twist: number;
  frozenLayers: string[]; clip?: CadPoint2D[]; warning?: string;
}
export interface DrawingSheet {
  id: string; name: string; order: number; blockHandle?: string;
  width?: number; height?: number; units: 'mm'|'in'|'pixels'|'unknown';
  origin: CadPoint2D; rotation: number; entities: CadEntity[]; viewports: PaperViewport[]; warnings: string[];
}
export const record=(value: unknown): Record<string, any> => value && typeof value==='object' ? value as Record<string, any> : {};
export const list=(value: unknown): Record<string, any>[] => Array.isArray(value)?value.map(record):Object.values(record(value)).filter(x=>x&&typeof x==='object').map(record);
export const finite=(value: unknown): number|undefined => value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):undefined;
export const point=(value: unknown): CadPoint2D|undefined => {const p=record(value);return finite(p.x)!==undefined&&finite(p.y)!==undefined?{x:Number(p.x),y:Number(p.y)}:undefined;};
export const handle=(value: unknown): string => String(value??'').toUpperCase();
export function sheetsOf(doc?: CadDocument): DrawingSheet[] {return (doc?.metadata.mxSheets as DrawingSheet[]|undefined)??[];}

export function viewportFromEntity(e: CadEntity, entities: CadEntity[], doc: CadDocument): PaperViewport|undefined {
  const r={...record(e.raw),...e};
  const id=finite(r.viewportId??r.idNumber??r.viewport_id);
  if(id===1||Number(r.status)<0||(Number(r.statusBitFlags??0)&131072))return;
  const center=point(r.viewportCenter??r.center??r.centerPoint),width=finite(r.width),height=finite(r.height),viewHeight=finite(r.viewHeight);
  if(!center||!width||!height||!viewHeight||width<=0||height<=0||viewHeight<=0)return;
  const direction=record(r.viewDirection??r.viewDirectionFromTarget);
  const perspective=Number(r.statusBitFlags??0)&1;
  const tilted=Math.abs(Number(direction.x??0))+Math.abs(Number(direction.y??0))>1e-8||Number(direction.z??1)<0;
  const frozen=list(r.frozenLayers??r.frozenLayerIds).map(x=>handle(x.handle??x.id));
  if(Array.isArray(r.frozenLayerIds))frozen.push(...r.frozenLayerIds.map(handle));
  const names=Object.values(doc.layers).filter(l=>frozen.includes(handle(record(l.raw).handle))).map(l=>l.name);
  const clipHandle=handle(r.clippingBoundaryId??r.clippingBoundaryHandle);
  const boundary=clipHandle?entities.find(x=>handle(x.handle)===clipHandle):undefined;
  const flags=Number(r.statusBitFlags??0);
  const nonRect=!!clipHandle||!!(flags&65536);
  const vertices=boundary?.vertices;
  const straight=vertices?.length&&vertices.length>=3&&!vertices.some(v=>Math.abs(v.bulge??0)>1e-10);
  return {id:String(e.handle??id??''),center,width,height,viewHeight,viewCenter:point(r.displayCenter??r.viewCenter)??{x:0,y:0},target:point(r.targetPoint??r.viewTarget)??{x:0,y:0},twist:Number(r.viewTwistAngle??r.twistAngle??0),frozenLayers:[...names,...frozen],clip:straight?vertices:undefined,
    warning:perspective||tilted?'Viewport en perspectiva o con dirección 3D: no se representa en la hoja.':nonRect&&!straight?'Recorte no rectangular no compatible: no se representa el viewport.':undefined};
}

// Group by explicit layout name or owner block record, never by proximity.
export function separateDrawingSpaces(doc: CadDocument, layouts: Record<string, any>[], blockRecords: Record<string, any>[]=[]): void {
  const sheets: DrawingSheet[]=layouts.filter(l=>String(l.layoutName??l.name).toLowerCase()!=='model').map((l,i)=>{
    const units=Number(l.paperUnits??l.plotPaperUnits);
    let width=finite(l.paperWidth),height=finite(l.paperHeight);
    const rotation=Number(l.plotRotation??0);
    const factor=units===0?25.4:1;
    if(width)width/=factor;if(height)height/=factor;
    if(width&&height&&(rotation===1||rotation===3))[width,height]=[height,width];
    return {id:handle(l.handle)||`layout-${i}`,name:String(l.layoutName??l.name??`Layout ${i+1}`),order:Number(l.tabOrder??i),blockHandle:handle(l.paperSpaceTableId??l.blockRecordHandle),width,height,units:units===0?'in':units===1?'mm':units===2?'pixels':'unknown',origin:{x:(point(l.paperOrigin)?.x??0)/factor,y:(point(l.paperOrigin)?.y??0)/factor},rotation,entities:[],viewports:[],warnings:[]};
  });
  const byName=new Map(sheets.map(s=>[s.name.toLowerCase(),s]));
  const byOwner=new Map(sheets.filter(s=>s.blockHandle).map(s=>[s.blockHandle!,s]));
  const root=[...doc.entities];
  for(const b of blockRecords){
    if(!/^\*paper_space/i.test(String(b.name??'')))continue;
    let sheet=byOwner.get(handle(b.handle));
    if(!sheet&&b.layoutHandle)sheet=sheets.find(s=>s.id===handle(b.layoutHandle));
    if(!sheet){sheet={id:`block-${handle(b.handle)||b.name}`,name:String(b.layoutName??b.name),order:sheets.length,blockHandle:handle(b.handle),units:'unknown',origin:{x:0,y:0},rotation:0,entities:[],viewports:[],warnings:['El lector no proporcionó el nombre o la configuración de papel de este bloque de presentación.']};sheets.push(sheet);byOwner.set(handle(b.handle),sheet);}
    byOwner.set(handle(b.handle),sheet);byName.set(sheet.name.toLowerCase(),sheet);
    const normalized=doc.blocks[String(b.name)]?.entities??[];
    const seen=new Set(root.map(e=>e.handle).filter(Boolean));
    for(const e of normalized)if(!e.handle||!seen.has(e.handle)){root.push({...e,ownerBlockRecordHandle:handle(b.handle),isInPaperSpace:true});if(e.handle)seen.add(e.handle);}
  }
  const model: CadEntity[]=[];
  for(const e of root){
    const r={...record(e.raw),...e};
    const name=String(r.layoutName??r.paperSpaceName??r.layout??'');
    let sheet=byName.get(name.toLowerCase())??byOwner.get(handle(r.ownerBlockRecordHandle??r.ownerBlockRecordSoftId??r.ownerHandle));
    if(!sheet&&(e.isInPaperSpace||Number(r.inPaperSpace)===1||Number(r.paperSpace)===1)){
      const unknown=name||'Presentación sin identificar';sheet=byName.get(unknown.toLowerCase());
      if(!sheet){sheet={id:`unassigned-${sheets.length}`,name:unknown,order:sheets.length,units:'unknown',origin:{x:0,y:0},rotation:0,entities:[],viewports:[],warnings:['No se pudo recuperar la asociación completa con el objeto LAYOUT.']};sheets.push(sheet);byName.set(unknown.toLowerCase(),sheet);}
    }
    if(sheet)sheet.entities.push({...e,isInPaperSpace:true});else model.push(e);
  }
  for(const s of sheets){
    s.viewports=s.entities.filter(e=>e.type==='VIEWPORT').map(e=>viewportFromEntity(e,s.entities,doc)).filter((v):v is PaperViewport=>!!v);
    for(const v of s.viewports)if(v.warning)s.warnings.push(`${v.id}: ${v.warning}`);
    if(!s.width||!s.height)s.warnings.push('Tamaño de papel no disponible: se ajusta al contenido, sin inventar un formato de hoja.');
    const invalid=s.entities.filter(e=>e.type==='VIEWPORT'&&Number(record(e).viewportId)!==1).length-s.viewports.length;
    if(invalid>0)s.warnings.push(`${invalid} viewport(s) sin parámetros suficientes o desactivados.`);
  }
  doc.entities=model;
  doc.metadata.mxSheets=sheets.sort((a,b)=>a.order-b.order);
}

export function viewportScene(v: PaperViewport) {
  const c=Math.cos(v.twist),s=Math.sin(v.twist);
  return {a:c,b:-s,c:s,d:c,e:-c*v.target.x-s*v.target.y,f:s*v.target.x-c*v.target.y};
}
