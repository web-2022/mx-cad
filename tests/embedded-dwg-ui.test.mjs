import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {_electron as electron} from '@playwright/test';
import {Dwg_Object_Type} from '../node_modules/@mlightcad/libredwg-web/lib/types/enums.js';

test('pinned auxiliary table reader runs in a nested local module worker', {timeout:90000}, async()=>{
  const app=await electron.launch({args:['.','--enable-unsafe-swiftshader'],env:{...process.env,MX_CAD_TEST:'1'}});
  try {
    const page=await app.firstWindow();
    await page.locator('#file-input').waitFor({state:'attached'});
    const chunk=(await readdir('dist/assets')).find(n=>/^table-recovery-worker-.*\.js$/.test(n));
    assert.ok(chunk,'Vite emits the auxiliary worker');
    const bytes=Array.from(await readFile('tests/fixtures/HatchG.dwg'));
    const result=await page.evaluate(async({chunk,bytes,tableType})=>{
      const origin=location.origin;
      const code=`onmessage=e=>{const w=new Worker(e.data.url,{type:'module'});w.onerror=()=>{postMessage({error:'nested worker failed'});w.terminate();};w.onmessage=r=>{postMessage(r.data);w.terminate();};w.postMessage(e.data.input,[e.data.input.bytes]);};`;
      const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
      const outer=new Worker(url,{type:'module'});
      try{return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Auxiliary worker timeout')),45000);
        outer.onerror=()=>{clearTimeout(timer);reject(Error('Outer worker failed'));};
        outer.onmessage=e=>{clearTimeout(timer);resolve(e.data);};
        const buffer=new Uint8Array(bytes).buffer;
        outer.postMessage({url:origin+'/assets/'+chunk,input:{bytes:buffer,path:origin+'/table-reader/',tableType}},[buffer]);
      });}finally{outer.terminate();URL.revokeObjectURL(url);}
    },{chunk,bytes,tableType:Dwg_Object_Type.DWG_TYPE_TABLE});
    assert.equal(result.error,undefined,JSON.stringify(result));
    assert.ok(Array.isArray(result.records));
  } finally {await app.close();}
});
