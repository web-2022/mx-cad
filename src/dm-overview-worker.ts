import {readDmOverview,type DmOverviewRequest} from './datamine-sectors';

self.onmessage=async ({data}:MessageEvent<{file:File;request:DmOverviewRequest}>)=>{
 try{
  let last=0;
  const result=await readDmOverview(data.file,(scanned,total)=>{
   if(performance.now()-last<150)return;
   last=performance.now();
   self.postMessage({scanned,total});
  },data.request);
  self.postMessage({result});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
