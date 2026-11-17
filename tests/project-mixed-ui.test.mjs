import {test} from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,expect} from '@playwright/test';
import {makeDm} from '../scripts/block-fixture.mjs';
const dm=makeDm({rotated:true});
const topo=Buffer.from([0,'SECTION',2,'HEADER',9,'$INSUNITS',70,6,0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'LWPOLYLINE',5,'T',8,'0',62,3,90,3,38,4810,10,499980,20,8999980,10,500010,20,9000020,10,500050,20,9000030,0,'ENDSEC',0,'EOF'].join('\n')+'\n');
const payload=(name,buffer)=>({name,mimeType:'application/octet-stream',buffer});
test('automatic consecutive composition, tree selection, visibility, appearance and dirty project cancellation',{timeout:180000},async()=>{
 const app=await electron.launch({args:['.','--enable-unsafe-swiftshader'],env:{...process.env,MX_CAD_TEST:'1',MX_CAD_BENCHMARK:'1'}});
 try{const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.setViewportSize({width:1600,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#file-input').setInputFiles(payload('a.dm',dm));await expect(page.locator('.block-counts')).toContainText('3');await page.locator('#busy').waitFor({state:'hidden'});
 await page.locator('#file-input').setInputFiles(payload('topography.dxf',topo));await expect(page.locator('#mode-badge')).toContainText('ESCENA CONJUNTA');await page.locator('#busy').waitFor({state:'hidden'});
 const metrics=()=>page.evaluate(()=>window.mxCadBenchmark.blocks().mixedMetrics());assert.equal((await metrics()).files,2);assert.equal((await metrics()).cadSegments,2);
 const before=await page.evaluate(()=>({view:window.mxCadBenchmark.blocks().getState(),metrics:window.mxCadBenchmark.blocks().mixedMetrics()}));
 await page.locator('#project-tree').getByRole('button',{name:'▣ topography.dxf',exact:true}).click();await expect(page.locator('#project-properties h2')).toHaveText('topography.dxf');
 const after=await page.evaluate(()=>({view:window.mxCadBenchmark.blocks().getState(),metrics:window.mxCadBenchmark.blocks().mixedMetrics()}));assert.deepEqual(after,before);
 await page.getByLabel('Mostrar archivo topography.dxf',{exact:true}).uncheck();assert.equal(await page.evaluate(()=>Object.values(window.mxCadBenchmark.blocks().getMixedSession().settings).filter(s=>s.visible).length),1);assert.equal((await metrics()).geometryBuilds,before.metrics.geometryBuilds);
 await page.getByLabel('Mostrar archivo topography.dxf',{exact:true}).check();await page.getByLabel('Opacidad de topography.dxf',{exact:true}).fill('0.4');await page.getByLabel('Color visual de topography.dxf',{exact:true}).fill('#123456');await page.getByLabel('Color visual de topography.dxf',{exact:true}).dispatchEvent('change');
 await page.getByLabel('Nombre mostrado',{exact:true}).fill('Terreno');await page.getByLabel('Nombre mostrado',{exact:true}).press('Tab');await expect(page.locator('#project-properties h2')).toHaveText('Terreno');
 await page.locator('#file-input').setInputFiles(payload('b.dm',dm));await page.locator('#busy').waitFor({state:'hidden'});await expect.poll(async()=>(await metrics()).files).toBe(3);
 const settings=await page.evaluate(()=>Object.values(window.mxCadBenchmark.blocks().getMixedSession().settings));assert.ok(settings.some(s=>s.color==='#123456'&&s.opacity===.4));
 await page.locator('#clear').click();await expect(page.locator('#new-project-dialog')).toBeVisible();await page.locator('[data-new=cancel]').click();await expect(page.locator('#project-tree .file-branch')).toHaveCount(3);
 await page.locator('#clear').click();await page.locator('[data-new=discard]').click();await expect(page.locator('#project-tree .file-branch')).toHaveCount(0);assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
