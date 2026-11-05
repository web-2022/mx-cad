import {_electron as electron,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import os from 'node:os';
const summary=a=>({meanMs:+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(2),p95Ms:+[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*.95))].toFixed(2),samples:a.length});
const app=await electron.launch({args:['.','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],env:{...process.env,MX_CAD_TEST:'1'}});
try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());await page.bringToFront();page.setDefaultTimeout(90000);await page.setViewportSize({width:1400,height:900});
  const idle=await page.evaluate(async()=>{const a=[];let last=performance.now();for(let i=0;i<12;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>1)a.push(now-last);last=now;}return a;});if(summary(idle).meanMs>100)throw Error('Invalid benchmark: background frame throttling');
  let text=await readFile('tests/fixtures/layouts.dxf','utf8');const at=text.indexOf('0\nSECTION\n2\nENTITIES\n')+'0\nSECTION\n2\nENTITIES\n'.length;
  let lines='';for(let i=0;i<10000;i++){const x=i%100,y=Math.floor(i/100);lines+=`0\nLINE\n5\n${(100000+i).toString(16)}\n330\n20\n8\n0\n10\n${x}\n20\n${y}\n11\n${x+.4}\n21\n${y+.4}\n`;}
  text=text.slice(0,at)+lines+text.slice(at);let start=performance.now();
  await page.locator('#file-input').setInputFiles({name:'benchmark-10000.dxf',mimeType:'application/dxf',buffer:Buffer.from(text)});await page.locator('#busy').waitFor({state:'hidden'});await expect(page.locator('#filename')).toHaveText('benchmark-10000.dxf');
  const openDxfMs=+(performance.now()-start).toFixed(2);
  const zoom=await page.locator('#viewer canvas').evaluate(async canvas=>{
    const a=[];for(let i=0;i<20;i++){const t=performance.now();canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:i%2?120:-120,bubbles:true,cancelable:true,clientX:canvas.getBoundingClientRect().x+canvas.clientWidth/2,clientY:canvas.getBoundingClientRect().y+canvas.clientHeight/2}));await new Promise(requestAnimationFrame);a.push(performance.now()-t);}return a;
  });
  const box=await page.locator('#viewer canvas').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.evaluate(()=>{window.__frames=[];window.__tracking=true;let last=performance.now();const frame=t=>{if(!window.__tracking)return;window.__frames.push(t-last);last=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  await page.mouse.down({button:'middle'});await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:30});await page.mouse.up({button:'middle'});
  const pan=await page.evaluate(()=>{window.__tracking=false;return window.__frames.filter(t=>t>0);});
  const layouts=await page.evaluate(async()=>{const tabs=document.querySelectorAll('#layout-tabs button'),a=[];for(let i=0;i<8;i++){const t=performance.now();tabs[1+i%2].click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);a.push(performance.now()-t);}return a;});
  const paperZoom=await page.locator('#viewer-paper canvas').evaluate(async canvas=>{const a=[];for(let i=0;i<12;i++){const t=performance.now();canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:i%2?80:-80,bubbles:true,cancelable:true}));await new Promise(requestAnimationFrame);a.push(performance.now()-t);}return a;});
  start=performance.now();await page.locator('#file-input').setInputFiles('tests/fixtures/HatchG.dwg');await page.locator('#busy').waitFor({state:'hidden'});await expect(page.locator('#filename')).toHaveText('HatchG.dwg');const openDwgMs=+(performance.now()-start).toFixed(2);
  console.log('MX_BENCHMARK '+JSON.stringify({cpu:os.cpus()[0].model,cpus:os.cpus().length,platform:os.platform(),node:process.version,viewport:'1400x900',idleFrames:summary(idle),dxfBytes:Buffer.byteLength(text),generatedLines:10000,dwgBytes:(await readFile('tests/fixtures/HatchG.dwg')).length,openDxfMs,openDwgMs,modelZoom:summary(zoom),panFrames:summary(pan),layoutSwitch:summary(layouts),paperZoom:summary(paperZoom)}));
}finally{await app.close();}
