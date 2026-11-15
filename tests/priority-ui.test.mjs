import {test} from 'node:test';import assert from 'node:assert/strict';import {_electron as electron,expect} from '@playwright/test';
test('3D navigation reuses geometry, restores quality and exports full resolution',{timeout:90000},async()=>{
 const app=await electron.launch({args:['.','--enable-unsafe-swiftshader'],env:{...process.env,MX_CAD_TEST:'1',MX_CAD_BENCHMARK:'1'}});
 try{const page=await app.firstWindow();await page.locator('#file-input').setInputFiles('tests/fixtures/surfaces.dxf');await page.locator('#busy').waitFor({state:'hidden'});
 const metrics=()=>page.evaluate(()=>({...window.mxCadBenchmark.cad3D().metrics}));
 await page.locator('#surface-quality').selectOption('high');await page.waitForTimeout(100);
 const before=await metrics(),box=await page.locator('#viewer-3d canvas').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+10,{steps:5});await page.mouse.up();
 await page.locator('#surface-quality').selectOption('auto');await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+20,{steps:5});
 await expect.poll(async()=>(await metrics()).pixelRatio).toBe(.75);const moving=await metrics();assert.equal(moving.geometryBuilds,before.geometryBuilds);
 await page.mouse.up();await expect.poll(async()=>(await metrics()).pixelRatio).toBe(before.pixelRatio);
 await page.locator('#surface-quality').selectOption('fast');await expect.poll(async()=>(await metrics()).pixelRatio).toBe(.75);
 const exported=await page.evaluate(()=>{const v=window.mxCadBenchmark.cad3D();v.draw();return{ratio:v.metrics.pixelRatio,width:v.canvas.width,css:v.canvas.clientWidth};});assert.equal(exported.ratio,before.pixelRatio);assert.equal(exported.width,Math.floor(exported.css*before.pixelRatio));
 console.log('Navigation raster comparison:',JSON.stringify({fixture:'surfaces.dxf',high:before,moving,exported,pixelAreaReduction:1-(moving.pixelRatio/before.pixelRatio)**2}));
 }finally{await app.close();}
});
test('import diagnostics keep actionable SHX warnings and filter without losing their count',{timeout:90000},async()=>{
 const app=await electron.launch({args:['.'],env:{...process.env,MX_CAD_TEST:'1',MX_CAD_BENCHMARK:'1'}});
 try{const page=await app.firstWindow();await page.locator('#file-input').setInputFiles('tests/fixtures/layouts.dxf');await page.locator('#busy').waitFor({state:'hidden'});
 await page.evaluate(()=>{const d=window.mxCadBenchmark.document();d.entities.push({type:'TEXT',kind:'text',text:'S',insertionPoint:{x:0,y:0},fontFile:'missing-original.shx'});});
 await page.getByRole('tab',{name:'A3-Civil',exact:true}).click();await page.locator('#drawing-warnings summary').click();await page.locator('#diagnostic-filter').selectOption('resources');
 await expect(page.locator('#drawing-warning-list')).toContainText('missing-original.shx');await expect(page.locator('#drawing-warning-list')).toContainText('Carga la fuente original');const count=await page.locator('#warning-count').textContent();
 await page.locator('#diagnostic-filter').selectOption('unsupported');assert.equal(await page.locator('#warning-count').textContent(),count);
 }finally{await app.close();}
});
