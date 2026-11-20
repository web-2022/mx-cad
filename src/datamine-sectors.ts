import {datamineHeader,readDatamine} from './datamine-reader.ts';

export const largeDmBytes=128*1024*1024;
export const largeDm=(file:Pick<File,'name'|'size'>)=>/\.dm$/i.test(file.name)&&file.size>=largeDmBytes;
export type DmBounds=[number,number,number,number,number,number];
export type DmSectorRequest={start:number;bounds?:DmBounds};

export async function readDmSector(file:Blob,request:DmSectorRequest,progress:(scanned:number,total:number)=>void=()=>{}){
 const probe=datamineHeader(await file.slice(0,4096).arrayBuffer(),file.size,true);
 const header=await file.slice(0,probe.headerPages*probe.page).arrayBuffer();
 const {word,little,page,headerPages,count,width,perPage,defs}=datamineHeader(header,file.size);
 const {start,bounds}=request;
 if(!Number.isSafeInteger(start)||start<0||start>=count)throw Error('Registro fuera del modelo.');
 if(bounds&&(!Array.isArray(bounds)||bounds.length!==6||!bounds.every(Number.isFinite)||[0,2,4].some(i=>bounds[i]>bounds[i+1])))throw Error('Límites XYZ no válidos.');
 // Bound both the geometry and attribute allocations even for schemas with many fields.
 const limit=Math.min(25000,Math.max(1,Math.floor(2_000_000/defs.filter(field=>field.position).length)));
 const stride=width*word;
 const sizeFor=(rows:number)=>(headerPages+Math.ceil(rows/perPage))*page;
 const allocate=(rows:number)=>new Uint8Array(sizeFor(rows));
 const parse=(data:Uint8Array<ArrayBuffer>,rows:number,geometryOnly=false)=>{
  data.set(new Uint8Array(header));
  const view=new DataView(data.buffer);
  const last=(rows-1)%perPage+1;
  if(word===8){view.setFloat64(26*word,data.length/page,little);view.setFloat64(27*word,last,little);}
  else {view.setFloat32(26*word,data.length/page,little);view.setFloat32(27*word,last,little);}
  return readDatamine(data.buffer,geometryOnly);
 };
 const offset=(row:number)=>Math.floor(row/perPage)*page+(row%perPage)*stride;
 const output=allocate(limit);
 let collected=0, cursor=start;
 const dataStart=headerPages*page;
 while(cursor<count&&collected<limit){
  const firstPage=Math.floor(cursor/perPage);
  const lastPage=Math.ceil(Math.min(count,cursor+limit)/perPage);
  const bytes=new Uint8Array(await file.slice(dataStart+firstPage*page,dataStart+lastPage*page).arrayBuffer());
  const firstRow=firstPage*perPage;
  const batchCount=Math.min(count-firstRow,(lastPage-firstPage)*perPage);
  let geometry;
  if(bounds){
   const batch=allocate(batchCount);
   batch.set(bytes,dataStart);
   geometry=parse(batch,batchCount,true).positions;
  }
  const end=Math.min(count,firstRow+batchCount);
  for(;cursor<end&&collected<limit;cursor++){
   const i=cursor-firstRow;
   if(bounds&&geometry&&[0,1,2].some(axis=>geometry[i*3+axis]<bounds[axis*2]||geometry[i*3+axis]>bounds[axis*2+1]))continue;
   const at=offset(i);
   output.set(bytes.subarray(at,at+stride),dataStart+offset(collected++));
  }
  progress(cursor,count);
 }
 const model=collected?parse(output.slice(0,sizeFor(collected)),collected):undefined;
 return {model,total:count,next:cursor<count?cursor:null};
}
