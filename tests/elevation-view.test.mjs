import {test} from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,expect} from '@playwright/test';
test('DWG-style planar elevations and WCS line heights align in the 3D view without lifting zero-height entities',{timeout:90000},async()=>{
 const app=await electron.launch({args:['.'],env:{...process.env,MX_CAD_TEST:'1'}});
 try{const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));const data=[0,'SECTION',2,'HEADER',9,'$INSUNITS',70,6,0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'LWPOLYLINE',5,'A1',8,'0',90,2,70,0,38,4800,10,500000,20,9000000,10,500010,20,9000000,0,'LINE',5,'A2',8,'0',10,500000,20,9000000,30,4800,11,500010,21,9000000,31,4800,0,'LWPOLYLINE',5,'A3',8,'0',90,2,70,0,38,0,10,500000,20,9000000,10,500010,20,9000010,0,'ENDSEC',0,'EOF'];
  await page.locator('#file-input').setInputFiles({name:'mine-elevations.dxf',mimeType:'application/dxf',buffer:Buffer.from(data.join('\n')+'\n')});await page.locator('#busy').waitFor({state:'hidden'});await page.locator('#view-3d').click();await expect(page.locator('#wire-info')).toBeVisible();await expect(page.locator('#wire-info')).toContainText('4,800');await expect(page.locator('#wire-info')).toContainText('1 trazos en Z=0');
  await page.locator('#nav-front').click();await page.locator('#view-2d').click();assert.equal(await page.locator('#wire-info').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
