import type { CadDocument, CadEntity, CadPoint3D } from './vendor/cad/index';
import { separateDrawingSpaces, record } from './drawing-spaces';

export interface DxfPair {code:number;value:string}
export interface DxfRecord {type:string;section:string;pairs:DxfPair[]}
export function scanDxf(text:string):DxfRecord[]{
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),out:DxfRecord[]=[];let section='',current:DxfRecord|undefined;
  for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i].trim()),value=lines[i+1].trim();if(!Number.isFinite(code))continue;
    if(code===0&&value==='SECTION'){section=lines[i+3]?.trim()??'';i+=2;current=undefined;continue;}
    if(code===0&&value==='ENDSEC'){section='';current=undefined;continue;}
    if(code===0){current={type:value,section,pairs:[]};out.push(current);}else current?.pairs.push({code,value});
  }return out;
}
const str=(p:DxfPair[],code:number)=>p.find(x=>x.code===code)?.value;
const num=(p:DxfPair[],code:number,fallback=0)=>{const v=str(p,code);return v!==undefined&&Number.isFinite(Number(v))?Number(v):fallback;};
const pt=(p:DxfPair[],code:number):CadPoint3D=>({x:num(p,code),y:num(p,code+10),z:num(p,code+20)});
const radians=(n:number)=>n*Math.PI/180;
function subclass(p:DxfPair[],name:string){const at=p.findIndex(x=>x.code===100&&x.value===name);if(at<0)return p;const end=p.findIndex((x,i)=>i>at&&x.code===100);return p.slice(at+1,end<0?undefined:end);}
function vertices(p:DxfPair[],startCode=10){const out:Array<CadPoint3D&{bulge?:number}>=[];let v:CadPoint3D&{bulge?:number}|undefined;for(const x of p){if(x.code===startCode){v={x:Number(x.value),y:0};out.push(v);}else if(v&&x.code===startCode+10)v.y=Number(x.value);else if(v&&x.code===42)v.bulge=Number(x.value);}return out;}

function hatchData(p:DxfPair[]){
  const paths:any[]=[];let i=p.findIndex(x=>x.code===91)+1;
  const take=(code:number,fallback=0)=>{if(p[i]?.code!==code)return fallback;return Number(p[i++].value);};
  const pathCount=num(p,91);
  for(let n=0;n<pathCount&&i<p.length;n++){
    while(i<p.length&&p[i].code!==92)i++;if(i>=p.length)break;
    const flag=take(92),path:any={boundaryPathTypeFlag:flag};
    if(flag&2){take(72);path.isClosed=!!take(73);const count=take(93);path.vertices=[];
      for(let k=0;k<count&&p[i]?.code===10;k++){const x=take(10),y=take(20),bulge=take(42);path.vertices.push({x,y,bulge});}
    }else{const count=take(93);path.edges=[];for(let k=0;k<count&&p[i]?.code===72;k++){
      const type=take(72);if(type===1)path.edges.push({type,start:{x:take(10),y:take(20)},end:{x:take(11),y:take(21)}});
      else if(type===2){const center={x:take(10),y:take(20)},radius=take(40),startAngle=radians(take(50)),endAngle=radians(take(51)),isCCW=!!take(73);path.edges.push({type,center,radius,startAngle,endAngle,isCCW});}
      else if(type===3){const center={x:take(10),y:take(20)},end={x:take(11),y:take(21)},lengthOfMinorAxis=take(40),startAngle=radians(take(50)),endAngle=radians(take(51)),isCCW=!!take(73);path.edges.push({type,center,end,lengthOfMinorAxis,startAngle,endAngle,isCCW});}
      else {path.unsupported=true;while(i<p.length&&![92,75].includes(p[i].code))i++;break;}
    }}paths.push(path);
  }
  const definitionLines:any[]=[];
  i=p.findIndex(x=>x.code===78)+1;const count=num(p,78);
  for(let n=0;n<count&&p[i]?.code===53;n++){const angle=radians(take(53)),base={x:take(43),y:take(44)},offset={x:take(45),y:take(46)},dashes=take(79),dashLengths=[];for(let k=0;k<dashes&&p[i]?.code===49;k++)dashLengths.push(take(49));definitionLines.push({angle,base,offset,dashLengths});}
  return {boundaryPaths:paths,solidFill:num(p,70),patternName:str(p,2),hatchStyle:num(p,75),patternScale:num(p,41,1),patternAngle:radians(num(p,52)),definitionLines,gradientFlag:num(p,450)};
}

// Supplement fields skipped by dxf-parser, including the OBJECTS section.
export function supplementDxf(doc:CadDocument,text:string){
  const records=scanDxf(text),all=[...doc.entities,...Object.values(doc.blocks).flatMap(b=>b.entities)],byHandle=new Map(all.filter(e=>e.handle).map(e=>[e.handle!.toUpperCase(),e]));
  let blockName='';const blockRecords:any[]=[];let insert:CadEntity|undefined;const attached=new Set<CadEntity>();
  for(const r of records){
    const p=r.pairs;if(r.type!=='ATTRIB' && r.type!=='INSERT')insert=undefined;if(r.type==='BLOCK_RECORD')blockRecords.push({name:str(p,2),handle:str(p,5),layoutHandle:str(p,340)});
    if(r.section==='BLOCKS'&&r.type==='BLOCK'){blockName=str(p,2)??'';continue;}if(r.type==='ENDBLK'){blockName='';continue;}
    if(!['ENTITIES','BLOCKS'].includes(r.section)||['SEQEND','VERTEX'].includes(r.type))continue;
    const h=str(p,5)?.toUpperCase();let e=h?byHandle.get(h):undefined;
    if(!e&&['HATCH','VIEWPORT','IMAGE','ATTRIB','ATTDEF','DIMENSION'].includes(r.type)){
      e={type:r.type,handle:h,layer:str(p,8)??'0',isVisible:true};
      if(r.section==='BLOCKS'){if(!doc.blocks[blockName])continue;doc.blocks[blockName].entities.push(e);}else doc.entities.push(e);
      if(h)byHandle.set(h,e);
    }
    if(!e)continue;
    e.layoutName=str(p,410);e.ownerBlockRecordHandle=str(p,330);e.isInPaperSpace=num(p,67)===1;
    e.lineweight=num(p,370,-1);e.lineType=str(p,6)??e.lineType;e.lineTypeScale=num(p,48,1);e.colorIndex=num(p,62,256);
    if(str(p,420)!==undefined)e.trueColor=num(p,420);
    if(str(p,440)!==undefined&&(num(p,440)>>>24)===2)e.opacity=1-(num(p,440)&255)/255;
    e.textStyleName=str(p,7);
    if(r.type==='ATTRIB'||r.type==='ATTDEF'){e.attributeTag=str(p,2);e.attributeFlags=num(p,70);if(num(p,70)&1)e.isVisible=false;}
    if(r.type==='INSERT')insert=e;
    else if(r.type==='ATTRIB' && insert){insert.attribs??=[];if(!insert.attribs.some(a=>a.handle===e!.handle))insert.attribs.push(e);attached.add(e);}
    if(['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(r.type)){e.insertionPoint=pt(p,10);e.text=p.filter(x=>x.code===1||x.code===3).map(x=>x.value).join('').replace(/\\P/g,'\n');e.textHeight=num(p,40,1);e.rotation=radians(num(p,50));e.xScale=r.type==='MTEXT'?1:num(p,41,1);e.halign=r.type==='MTEXT'?0:num(p,72);e.valign=r.type==='MTEXT'?0:num(p,73);e.kind='text';if(r.type==='MTEXT'){e.rectWidth=num(p,41);e.attachmentPoint=num(p,71,1);e.lineSpacing=num(p,44,1);const d=pt(p,11);if(d.x||d.y)e.rotation=Math.atan2(d.y,d.x);}}
    if(r.type==='HATCH')Object.assign(e,hatchData(p),{kind:'hatch'});
    if(r.type==='DIMENSION'&&str(p,2)){e.kind='insert';e.blockName=str(p,2);e.insertionPoint={x:0,y:0};e.rotation=0;}
    if(r.type==='VIEWPORT')Object.assign(e,{viewportCenter:pt(p,10),width:num(p,40),height:num(p,41),status:num(p,68),viewportId:num(p,69),displayCenter:pt(p,12),targetPoint:pt(p,17),viewDirection:pt(p,16),viewHeight:num(p,45),viewTwistAngle:radians(num(p,51)),statusBitFlags:num(p,90),frozenLayerIds:p.filter(x=>x.code===331).map(x=>x.value),clippingBoundaryId:str(p,340),kind:'viewport'});
    if(r.type==='IMAGE')Object.assign(e,{insertionPoint:pt(p,10),imageU:pt(p,11),imageV:pt(p,12),imagePixelSize:pt(p,13),imageDefId:str(p,340),kind:'image'});
  }
  const layouts=records.filter(r=>r.type==='LAYOUT').map(r=>{const p=r.pairs,l=subclass(p,'AcDbLayout'),plot=subclass(p,'AcDbPlotSettings');return {handle:str(p,5),layoutName:str(l,1),tabOrder:num(l,71),paperSpaceTableId:str(l,330),paperWidth:num(plot,44),paperHeight:num(plot,45),paperUnits:num(plot,72,-1),plotRotation:num(plot,73),paperOrigin:{x:-num(plot,40),y:-num(plot,41)}};});
  doc.metadata.mxImageDefs=records.filter(r=>r.type==='IMAGEDEF').map(r=>({handle:str(r.pairs,5),fileName:str(r.pairs,1)}));
  doc.metadata.mxTextStyles=records.filter(r=>r.type==='STYLE').map(r=>({handle:str(r.pairs,5),name:str(r.pairs,2),fontFile:str(r.pairs,3),bigFontFile:str(r.pairs,4)}));
  for(const r of records.filter(r=>r.type==='LAYER')){const layer=doc.layers[str(r.pairs,2)??''];if(layer){layer.raw={...record(layer.raw),handle:str(r.pairs,5)};layer.lineType=str(r.pairs,6);layer.lineweight=num(r.pairs,370,-1);}}
  doc.lineTypes??={};for(const r of records.filter(r=>r.type==='LTYPE')){const name=str(r.pairs,2);if(name)doc.lineTypes[name]={name,pattern:r.pairs.filter(x=>x.code===49).map(x=>({length:Number(x.value)}))};}
  doc.entities=doc.entities.filter(e=>!attached.has(e));
  for(const block of Object.values(doc.blocks))block.entities=block.entities.filter(e=>!attached.has(e));
  // Some DXFs identify owners only through BLOCK_RECORD; other files use 410.
  separateDrawingSpaces(doc,layouts,blockRecords);
  return doc;
}
