import {test} from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from '@playwright/test';
test('drawing workspace uses laptop, desktop and ultrawide widths without centered side bands',{timeout:90000},async()=>{
 const app=await electron.launch({args:['.'],env:{...process.env,MX_CAD_TEST:'1'}});
 try{
  const page=await app.firstWindow();await page.locator('#open').waitFor();const widths=[];
  for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440],[3840,2160],[5120,1440]]){
   await page.setViewportSize({width,height});
   const layout=await page.evaluate(()=>{const s=document.querySelector('.shell').getBoundingClientRect(),w=document.querySelector('.workspace').getBoundingClientRect(),top=document.querySelector('.topbar').getBoundingClientRect();return{viewport:innerWidth,left:s.left,right:s.right,workspace:w.width,topLeft:top.left,topRight:top.right,scroll:document.documentElement.scrollWidth};});
   assert.ok(Math.abs(layout.left)<1&&Math.abs(layout.right-width)<1,JSON.stringify(layout));
   assert.ok(layout.topLeft<=20&&width-layout.topRight<=20,JSON.stringify(layout));
   assert.ok(layout.scroll<=width+1,JSON.stringify(layout));
   if(width>=1920)widths.push({width,workspace:layout.workspace});
  }
  for(let i=1;i<widths.length;i++)assert.ok(Math.abs((widths[i].workspace-widths[i-1].workspace)-(widths[i].width-widths[i-1].width))<2,JSON.stringify(widths));
  console.log('Responsive workspace widths:',JSON.stringify(widths));
 }finally{await app.close();}
});
