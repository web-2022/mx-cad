import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {_electron as electron} from '@playwright/test';
import {Dwg_Object_Type} from '../node_modules/@mlightcad/libredwg-web/lib/types/enums.js';
import {deflateSync} from 'node:zlib';
import {expect} from '@playwright/test';

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

test('Layout CTB changes plotted pixels without changing original entity colors',{timeout:90000},async()=>{
  const app=await electron.launch({args:['.','--enable-unsafe-swiftshader'],env:{...process.env,MX_CAD_TEST:'1',MX_CAD_BENCHMARK:'1'}});
  try{
    const page=await app.firstWindow();
    await page.locator('#file-input').setInputFiles('tests/fixtures/layouts.dxf');
    await page.locator('#busy').waitFor({state:'hidden'});
    await page.getByRole('tab',{name:'A3-Civil',exact:true}).click();
    await page.evaluate(()=>{
      const d=window.mxCadBenchmark.document(),s=d.metadata.mxSheets.find(s=>s.name==='A3-Civil');
      s.plotStyleSheet='synthetic.ctb';s.viewports=[];
      s.entities=[{type:'SOLID',kind:'solid',handle:'CTB-S',layer:'0',colorIndex:1,vertices:[{x:100,y:100},{x:200,y:100},{x:200,y:200},{x:100,y:200}]}];
      window.mxCadBenchmark.paper().setSheet(d,s);
    });
    const redPixels=()=>page.locator('#viewer-paper canvas').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]>180&&p[i+1]<80&&p[i+2]<80)n++;return n;});
    await expect.poll(redPixels).toBeGreaterThan(100);
    const body=Buffer.from('plot_style{\n0{\ncolor=-1040187392\nmode_color=-1040187392\nscreen=100\nlineweight=0\n}\n}\n\0'),z=deflateSync(body),header=Buffer.alloc(60);
    header.write('PIAFILEVERSION_2.0,CTBVER1,compress\r\npmzlibcodec');header.writeUInt32LE(body.length,52);header.writeUInt32LE(z.length,56);
    await page.locator('#reference-input').setInputFiles({name:'synthetic.ctb',mimeType:'application/octet-stream',buffer:Buffer.concat([header,z])});
    await expect(page.locator('#notice')).toContainText('Referencias locales procesadas');
    await expect.poll(redPixels).toBe(0);
    const state=await page.evaluate(()=>{const d=window.mxCadBenchmark.document(),s=d.metadata.mxSheets.find(s=>s.name==='A3-Civil');return{source:s.entities[0].colorIndex,modelPlot:d.metadata.mxActivePlotStyle??null,loaded:!!d.metadata.mxPlotStyles['synthetic.ctb']};});
    assert.deepEqual(state,{source:1,modelPlot:null,loaded:true});
  }finally{await app.close();}
});
