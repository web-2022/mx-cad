import {_electron as electron,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import os from 'node:os';
const summary=a=>({meanMs:+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(2),p95Ms:+[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*.95))].toFixed(2),samples:a.length});
const app=await electron.launch({args:['.','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],env:{...process.env,MX_CAD_TEST:'1',MX_CAD_BENCHMARK:'1'}});
try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());await page.bringToFront();page.setDefaultTimeout(90000);await page.setViewportSize({width:1400,height:900});
  let text=await readFile('tests/fixtures/layouts.dxf','utf8');const at=text.indexOf('0\nSECTION\n2\nENTITIES\n')+'0\nSECTION\n2\nENTITIES\n'.length;
  let lines='';for(let i=0;i<10000;i++){const x=i%100,y=Math.floor(i/100);lines+=`0\nLINE\n5\n${(100000+i).toString(16)}\n330\n20\n8\n0\n10\n${x}\n20\n${y}\n11\n${x+.4}\n21\n${y+.4}\n`;}
  text=text.slice(0,at)+lines+text.slice(at);let start=performance.now();
  await page.locator('#file-input').setInputFiles({name:'benchmark-10000.dxf',mimeType:'application/dxf',buffer:Buffer.from(text)});await page.locator('#busy').waitFor({state:'hidden'});await expect(page.locator('#filename')).toHaveText('benchmark-10000.dxf');
  const entityCount=Number((await page.locator('#stat-entities').textContent()).replace(/\D/g,''));if(entityCount<10000)throw Error('Benchmark did not load all generated entities');
  const openDxfMs=+(performance.now()-start).toFixed(2);
  const metrics=await page.evaluate(()=>{
    const api=window.mxCadBenchmark;
    const sample=action=>{const a=[];for(let i=0;i<20;i++){const t=performance.now();action(i);a.push(performance.now()-t);}return a;};
    const zoom=sample(i=>api.zoom(i%2?1/1.14:1.14));
    const canvas=api.canvas(),r=canvas.getBoundingClientRect(),originalRAF=window.requestAnimationFrame,originalCancel=window.cancelAnimationFrame,originalCapture=canvas.setPointerCapture,queue=new Map();let id=0;
    window.requestAnimationFrame=cb=>{queue.set(++id,cb);return id;};window.cancelAnimationFrame=id=>queue.delete(id);canvas.setPointerCapture=()=>{};
    const flush=()=>{const callbacks=[...queue.values()];queue.clear();for(const cb of callbacks)cb(performance.now());};
    canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,button:0,buttons:1,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
    const pan=sample(i=>{canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,button:0,buttons:1,clientX:r.x+r.width/2+i+1,clientY:r.y+r.height/2+i+1}));flush();});
    canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,button:0}));flush();window.requestAnimationFrame=originalRAF;window.cancelAnimationFrame=originalCancel;canvas.setPointerCapture=originalCapture;
    const layouts=sample(i=>api.sheet(i%2));
    const paperZoom=sample(i=>api.zoom(i%2?1/1.14:1.14));
    return{zoom,pan,layouts,paperZoom};
  });
  const {zoom,pan,layouts,paperZoom}=metrics;
  start=performance.now();await page.locator('#file-input').setInputFiles('tests/fixtures/HatchG.dwg');await page.locator('#busy').waitFor({state:'hidden'});await expect(page.locator('#filename')).toHaveText('HatchG.dwg');const openDwgMs=+(performance.now()-start).toFixed(2);
  console.log('MX_BENCHMARK '+JSON.stringify({cpu:os.cpus()[0].model,cpus:os.cpus().length,platform:os.platform(),node:process.version,viewport:'1400x900',dxfBytes:Buffer.byteLength(text),generatedLines:10000,entityCount,dwgBytes:(await readFile('tests/fixtures/HatchG.dwg')).length,openDxfMs,openDwgMs,measurement:'CPU ms, deterministic interaction frame flush; not display FPS',modelZoom:summary(zoom),pointerPan:summary(pan),layoutSwitch:summary(layouts),paperZoom:summary(paperZoom)}));
}finally{await app.close();}
