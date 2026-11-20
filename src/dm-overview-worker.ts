import {readDmOverview} from './datamine-sectors';

self.onmessage=async ({data}:MessageEvent<File>)=>{
 try{
  let last=0;
  const result=await readDmOverview(data,(scanned,total)=>{
   if(performance.now()-last<150)return;
   last=performance.now();
   self.postMessage({scanned,total});
  });
  self.postMessage({result});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
