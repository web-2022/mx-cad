import {test} from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';

test('DXF: separate sheets, paper sizes, viewport hatch islands, layers, local image, PNG and Model 3D',{timeout:120000},async()=>{
  const app=await electron.launch({args:['.'],env:{...process.env,MX_CAD_TEST:'1'}});
  try{
    const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    await page.locator('#file-input').setInputFiles('tests/fixtures/layouts.dxf');await page.locator('#busy').waitFor({state:'hidden'});
    assert.equal(await page.locator('#filename').textContent(),'layouts.dxf');
    assert.deepEqual(await page.locator('#layout-tabs button').allTextContents(),['Model','A3-Civil','A4-Detalle']);
    await page.getByRole('tab',{name:'A3-Civil',exact:true}).click();
    assert.match(await page.locator('#paper-info').textContent(),/420\.00 × 297\.00 mm/);
    assert.equal(await page.locator('#viewer-paper').isVisible(),true);assert.equal(await page.locator('#view-3d').isDisabled(),true);
    // The centre of the first viewport is the hole of the model hatch.
    await expect.poll(()=>page.locator('#viewer-paper canvas').evaluate(canvas=>{
      const scale=Math.min(canvas.clientWidth/420,canvas.clientHeight/297)*.88,dpr=canvas.width/canvas.clientWidth;
      const x=canvas.clientWidth/2,y=canvas.clientHeight/2-(140-148.5)*scale;
      const p=canvas.getContext('2d').getImageData(Math.round(x*dpr),Math.round(y*dpr),1,1).data;
      return p[0]>245&&p[1]>245&&p[2]>245;
    })).toBe(true);
    const hatchPixels=await page.locator('#viewer-paper canvas').evaluate(canvas=>{
      const scale=Math.min(canvas.clientWidth/420,canvas.clientHeight/297)*.88,dpr=canvas.width/canvas.clientWidth,ctx=canvas.getContext('2d');let colored=0;
      for(let x=155;x<185;x+=2)for(let y=90;y<110;y+=2){const p=ctx.getImageData(Math.round((canvas.clientWidth/2+(x-210)*scale)*dpr),Math.round((canvas.clientHeight/2-(y-148.5)*scale)*dpr),1,1).data;if(Math.min(p[0],p[1],p[2])<220)colored++;}return colored;
    });assert.ok(hatchPixels>0,'A viewport must contain hatch pattern, not just a paper border');
    const dimensionInk=await page.locator('#viewer-paper canvas').evaluate(canvas=>{
      const scale=Math.min(canvas.clientWidth/420,canvas.clientHeight/297)*.88,dpr=canvas.width/canvas.clientWidth,ctx=canvas.getContext('2d');let ink=0;
      for(let x=40;x<100;x+=2)for(let y=44;y<=46;y+=.25){const p=ctx.getImageData(Math.round((canvas.clientWidth/2+(x-210)*scale)*dpr),Math.round((canvas.clientHeight/2-(y-148.5)*scale)*dpr),1,1).data;if(Math.min(p[0],p[1],p[2])<220)ink++;}return ink;
    });assert.ok(dimensionInk>0,'Dimension graphics block must survive paper-space normalization');
    await page.getByRole('checkbox',{name:'Mostrar capa OCULTA',exact:true}).uncheck();
    await page.locator('#reference-input').setInputFiles('tests/fixtures/ref.png');
    await expect(page.locator('#notice')).toContainText('Referencias locales procesadas');
    await page.getByRole('tab',{name:'A4-Detalle',exact:true}).click();assert.match(await page.locator('#paper-info').textContent(),/210\.00 × 297\.00 mm/);
    await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/layout-a4.png'});
    await app.evaluate(({session},save)=>session.defaultSession.on('will-download',(_event,item)=>item.setSavePath(save)),path.resolve('test-results/layout.png'));
    await page.locator('#export').click();await expect.poll(async()=>{try{return(await readFile('test-results/layout.png')).length>8;}catch{return false;}}).toBe(true);
    const png=await readFile('test-results/layout.png');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    await page.getByRole('tab',{name:'Model',exact:true}).click();await page.locator('#view-3d').click();assert.equal(await page.locator('#viewer-3d').isVisible(),true);await page.locator('#view-2d').click();
    await page.locator('#clear').click();assert.deepEqual(await page.locator('#layout-tabs button').allTextContents(),['Model']);assert.equal(await page.locator('#empty').isVisible(),true);assert.deepEqual(errors,[]);
  }finally{await app.close();}
});

test('public LibreDWG DWG fixture exposes its paper presentations through the worker',{timeout:150000},async()=>{
  const app=await electron.launch({args:['.'],env:{...process.env,MX_CAD_TEST:'1'}});
  try{
    const page=await app.firstWindow();await page.locator('#file-input').setInputFiles('tests/fixtures/HatchG.dwg');await page.locator('#busy').waitFor({state:'hidden',timeout:120000});
    assert.equal(await page.locator('#filename').textContent(),'HatchG.dwg');
    const tabs=await page.locator('#layout-tabs button').allTextContents();console.log('DWG layouts:',tabs);
    assert.ok(tabs.length>1,'Real DWG layouts must survive conversion and normalization');
    await page.locator('#layout-tabs button').nth(1).click();assert.equal(await page.locator('#viewer-paper').isVisible(),true);
    await page.locator('#fit').click();await page.locator('#plus').click();
    await page.screenshot({path:'test-results/dwg-layout.png'});
  }finally{await app.close();}
});
