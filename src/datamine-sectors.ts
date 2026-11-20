import {column,compileFilter,validateFilter,value,type Filter,type Condition} from './block-data.ts';
import {datamineHeader,readDatamine} from './datamine-reader.ts';

export const largeDmBytes=128*1024*1024;
export const largeDm=(file:Pick<File,'name'|'size'>)=>/\.dm$/i.test(file.name)&&file.size>=largeDmBytes;
export type DmBounds=[number,number,number,number,number,number];
export type DmSectorRequest={start:number;end?:number;bounds?:DmBounds;filter?:Filter};

async function openDmPages(file:Blob){
 const probe=datamineHeader(await file.slice(0,4096).arrayBuffer(),file.size,true);
 const header=await file.slice(0,probe.headerPages*probe.page).arrayBuffer();
 const {word,little,page,headerPages,count,width,perPage,defs}=datamineHeader(header,file.size);
 const stride=width*word;
 const sizeFor=(rows:number)=>(headerPages+Math.ceil(rows/perPage))*page;
 const allocate=(rows:number)=>new Uint8Array(sizeFor(rows));
 const parse=(data:Uint8Array<ArrayBuffer>,rows:number,geometryOnly=false,attributes?:ReadonlySet<string>)=>{
  data.set(new Uint8Array(header));
  const view=new DataView(data.buffer);
  const last=(rows-1)%perPage+1;
  if(word===8){view.setFloat64(26*word,data.length/page,little);view.setFloat64(27*word,last,little);}
  else {view.setFloat32(26*word,data.length/page,little);view.setFloat32(27*word,last,little);}
  return readDatamine(data.buffer,geometryOnly,attributes);
 };
 const offset=(row:number)=>Math.floor(row/perPage)*page+(row%perPage)*stride;
 const dataStart=headerPages*page;
 const read=(first:number,last:number)=>file.slice(dataStart+first*page,dataStart+last*page).arrayBuffer();
 return {count,defs,page,perPage,stride,dataStart,sizeFor,allocate,parse,offset,read};
}

function filterFields(filter:Filter|Condition|undefined,fields=new Set<string>()):Set<string>{
 if(!filter)return fields;
 if('children' in filter)filter.children.forEach(child=>filterFields(child,fields));
 else fields.add(filter.field);
 return fields;
}

export async function readDmSector(file:Blob,request:DmSectorRequest,progress:(scanned:number,total:number)=>void=()=>{}){
 const {count,defs,page,perPage,stride,dataStart,sizeFor,allocate,parse,offset,read}=await openDmPages(file);
 const {start,bounds,end:stop=count,filter}=request;
 const attributes=filterFields(filter);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(stop)||start<0||start>=stop||stop>count)throw Error('Registro fuera del modelo.');
 if(bounds&&(!Array.isArray(bounds)||bounds.length!==6||!bounds.every(Number.isFinite)||[0,2,4].some(i=>bounds[i]>bounds[i+1])))throw Error('Límites XYZ no válidos.');
 // Bound both the geometry and attribute allocations even for schemas with many fields.
 const limit=Math.min(25000,Math.max(1,Math.floor(2_000_000/defs.filter(field=>field.position).length)));
 const output=allocate(limit);
 let collected=0,cursor=start;
 while(cursor<stop&&collected<limit){
  const firstPage=Math.floor(cursor/perPage);
  const lastPage=Math.ceil(Math.min(stop,cursor+limit)/perPage);
  const bytes=new Uint8Array(await read(firstPage,lastPage));
  const firstRow=firstPage*perPage;
  const batchCount=Math.min(count-firstRow,(lastPage-firstPage)*perPage);
  let geometry, matches:(row:number)=>boolean=()=>true;
  if(bounds||filter){
   const batch=allocate(batchCount);
   batch.set(bytes,dataStart);
   const model=parse(batch,batchCount,true,attributes);
   geometry=model.positions;
   if(filter){validateFilter(model,filter);matches=compileFilter(model,filter);}
  }
  const end=Math.min(stop,firstRow+batchCount);
  for(;cursor<end&&collected<limit;cursor++){
   const i=cursor-firstRow;
   if(!matches(i))continue;
   if(bounds&&geometry&&[0,1,2].some(axis=>geometry[i*3+axis]<bounds[axis*2]||geometry[i*3+axis]>bounds[axis*2+1]))continue;
   const at=offset(i);
   output.set(bytes.subarray(at,at+stride),dataStart+offset(collected++));
  }
  progress(cursor,count);
 }
 const model=collected?parse(output.slice(0,sizeFor(collected)),collected):undefined;
 return {model,total:count,next:cursor<stop?cursor:null};
}

export type DmOverviewCell={center:DmBounds;box:DmBounds;count:number;first:number;end:number;valid?:number;mean?:number;category?:string;mixed?:boolean};
export type DmOverview={cells:DmOverviewCell[];total:number;resolution:number;matched:number;field?:string;units?:string;numeric?:boolean};
export type DmOverviewRequest={field?:string;filter?:Filter};

export async function readDmOverview(file:Blob,progress:(scanned:number,total:number)=>void=()=>{},options:DmOverviewRequest={}):Promise<DmOverview>{
 const {count,page,perPage,dataStart,allocate,parse,read}=await openDmPages(file);
 const pages=Math.ceil(count/perPage),pagesPerBatch=Math.max(1,Math.floor(4*1024*1024/page));
 const limit=12000,anchor:number[]=[];
 const attributes=filterFields(options.filter);
 if(options.field)attributes.add(options.field);
 let matched=0,numeric:boolean|undefined,units:string|undefined;
 let resolution=1,cells=new Map<string,DmOverviewCell>();
 const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
 const addValue=(cell:DmOverviewCell,v:number|string|null,count=1,mixed=false)=>{
  if(v===null&&!mixed)return;
  const valid=cell.valid??0;
  if(typeof v==='number')cell.mean=(cell.mean??0)*(valid/(valid+count))+v*(count/(valid+count));
  else if(mixed||valid&&cell.category!==v)cell.mixed=true;
  else if(v!==null)cell.category=v;
  cell.valid=valid+count;
 };
 const extend=(a:DmBounds,b:DmBounds)=>{
  for(let i=0;i<6;i+=2){a[i]=Math.min(a[i],b[i]);a[i+1]=Math.max(a[i+1],b[i+1]);}
 };
 for(let first=0;first<pages;first+=pagesPerBatch){
  const last=Math.min(pages,first+pagesPerBatch),rows=Math.min(count-first*perPage,(last-first)*perPage);
  const batch=allocate(rows);batch.set(new Uint8Array(await read(first,last)),dataStart);
  const model=parse(batch,rows,true,attributes),{positions,sizes,basis}=model;
  const attribute=options.field?column(model,options.field):undefined;
  numeric=attribute?.numeric;units=attribute?.unit;
  if(options.filter)validateFilter(model,options.filter);
  const matches=options.filter?compileFilter(model,options.filter):()=>true;
  if(!anchor.length){
   anchor.push(...positions.subarray(0,3));
   const smallest=Math.min(...sizes.subarray(0,3));
   resolution=2**Math.floor(Math.log2(Math.max(smallest,1e-6)));
  }
  const coefficients=basis.map(Math.abs);
  for(let i=0;i<positions.length;i+=3){
   if(!matches(i/3))continue;
   matched++;
   const x=positions[i],y=positions[i+1],z=positions[i+2],a=sizes[i]/2,b=sizes[i+1]/2,c=sizes[i+2]/2;
   const dx=coefficients[0]*a+coefficients[3]*b+coefficients[6]*c;
   const dy=coefficients[1]*a+coefficients[4]*b+coefficients[7]*c;
   const dz=coefficients[2]*a+coefficients[5]*b+coefficients[8]*c;
   const id=key(Math.floor((x-anchor[0])/resolution),Math.floor((y-anchor[1])/resolution),Math.floor((z-anchor[2])/resolution));
   const center:DmBounds=[x,x,y,y,z,z],box:DmBounds=[x-dx,x+dx,y-dy,y+dy,z-dz,z+dz];
   let cell=cells.get(id);const row=first*perPage+i/3;
   if(cell){cell.count++;cell.end=row+1;extend(cell.center,center);extend(cell.box,box);}
   else {cell={center,box,count:1,first:row,end:row+1};cells.set(id,cell);}
   if(attribute)addValue(cell,value(attribute,i/3));
   while(cells.size>limit){
    resolution*=2;
    const merged=new Map<string,DmOverviewCell>();
    for(const [old,value] of cells){
     const [i,j,k]=old.split(',').map(n=>Math.floor(Number(n)/2));
     const id=key(i,j,k),other=merged.get(id);
     if(other){other.count+=value.count;other.first=Math.min(other.first,value.first);other.end=Math.max(other.end,value.end);extend(other.center,value.center);extend(other.box,value.box);if(value.valid)addValue(other,value.mean??value.category??null,value.valid,value.mixed);}
     else merged.set(id,value);
    }
    cells=merged;
   }
  }
  progress(Math.min(last*perPage,count),count);
 }
 return {cells:[...cells.values()],total:count,resolution,matched,field:options.field,numeric,units};
}
