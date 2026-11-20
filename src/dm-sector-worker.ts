import {readDmSector,type DmSectorRequest} from './datamine-sectors';

self.onmessage=async ({data}:MessageEvent<{file:File;request:DmSectorRequest}>)=>{
 try{
  let last=0;
  const result=await readDmSector(data.file,data.request,(scanned,total)=>{
   if(performance.now()-last<150)return;
   last=performance.now();
   self.postMessage({scanned,total});
  });
  const model=result.model;
  const transfer=model?[...model.columns.flatMap(c=>c.data instanceof Float64Array?[c.data.buffer]:[]),model.positions.buffer,model.sizes.buffer]:[];
  self.postMessage({result},{transfer});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
