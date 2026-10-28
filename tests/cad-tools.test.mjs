import {test} from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron, expect } from '@playwright/test';
import {mkdir,unlink,readFile,access} from 'node:fs/promises';
import path from 'node:path';
test('seleccionar, medir con snap, dibujar y exportar trazos', {timeout:90000},async()=>{
  const app=await electron.launch({args:['.'],env:{...process.env,MX_CAD_TEST:'1'}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width:1000,height:850});
    await page.locator('#tool-line').waitFor();
    assert.equal(await page.locator('.sidebar > .panel').count(),1);
    await expect.poll(()=>page.locator('.brand-logo-img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
    // Controlled CAD fixture with known dimensions: line (0,0)-(100,0), point (0,50).
    const groups=[0,'SECTION',2,'HEADER',9,'$INSUNITS',70,6,0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'LINE',8,'0',10,0,20,0,30,10,11,100,21,0,31,10,0,'POINT',8,'0',10,0,20,50,30,35,0,'ENDSEC',0,'EOF'];
    await page.locator('#file-input').setInputFiles({name:'medidas.dxf',mimeType:'application/dxf',buffer:Buffer.from(groups.join('\n')+'\n')});
    await page.locator('#empty').waitFor({state:'hidden'});
    const v=await page.locator('#viewport').boundingBox();
    // Find the horizontal source segment and validate its authored dimensions.
    let picked=false;
    for(let y=v.y+v.height*.45;y<v.y+v.height-45;y+=5){
      await page.mouse.click(v.x+v.width/2,y);
      if((await page.locator('#selection-info').textContent()).includes('LINE')){picked=true;break;}
    }
    assert.equal(picked,true);assert.match(await page.locator('#selection-info').textContent(),/100 m/);
    const ends=(await page.locator('.cad-overlay polyline').getAttribute('points')).split(' ').map(pair=>pair.split(',').map(Number));
    const [a,b]=ends;
    await page.locator('#tool-measure').click();
    await page.mouse.click(v.x+a[0]+2,v.y+a[1]-2);await page.mouse.click(v.x+b[0]-2,v.y+b[1]-2);
    assert.match(await page.locator('#selection-info').textContent(),/100 m/);
    await page.locator('#tool-select').click();
    await page.mouse.click(v.x+a[0],v.y+a[1]-(b[0]-a[0])*.5);
    assert.match(await page.locator('#selection-info').textContent(),/POINT/);
    assert.match(await page.locator('#selection-info').textContent(),/35/);
    await page.locator('#new-layer-name').fill('Pruebas');await page.getByRole('button',{name:'Crear capa nueva',exact:true}).click();
    assert.equal(await page.locator('#active-layer').inputValue(),'Pruebas');
    await page.locator('#new-layer-name').fill('pruebas');await page.getByRole('button',{name:'Crear capa nueva',exact:true}).click();
    assert.match(await page.locator('#layer-error').textContent(),/Ya existe/);
    await page.locator('#new-layer-name').fill('');
    await page.locator('#tool-line').click();
    // Snap off to make the new geometry independent of the fixture.
    await page.locator('#snap-point').click();
    await page.locator('#snap-line').click();
    await page.mouse.click(v.x+(a[0]+b[0])/2,v.y+a[1]-2);
    await page.mouse.click(v.x+v.width*.6,v.y+v.height*.3);
    assert.match(await page.locator('#selection-info').textContent(),/\/ 0 \/ 10/);
    await page.locator('#snap-line').click();
    await page.mouse.click(v.x+v.width*.4,v.y+v.height*.32);await page.mouse.click(v.x+v.width*.6,v.y+v.height*.32);
    assert.match(await page.locator('#selection-info').textContent(),/Sesión/);
    await page.locator('#tool-polygon').click();
    for(const [x,y]of [[.35,.35],[.55,.35],[.55,.55],[.35,.55]])await page.mouse.click(v.x+v.width*x,v.y+v.height*y);
    await page.keyboard.press('Enter');assert.match(await page.locator('#selection-info').textContent(),/Área XY/);
    const before=await page.locator('#selection-info').textContent();
    await page.locator('#tool-select').click();await page.mouse.click(v.x+v.width*.45,v.y+v.height*.45);
    assert.equal(await page.locator('#selection-info').textContent(),before);
    await page.locator('#tool-measure').click();await page.mouse.click(v.x+v.width*.3,v.y+v.height*.25);await page.mouse.click(v.x+v.width*.7,v.y+v.height*.25);
    assert.match(await page.locator('#selection-info').textContent(),/MEDICION/);
    const visibility=page.getByRole('checkbox',{name:'Mostrar capa Pruebas',exact:true});
    await visibility.uncheck();assert.equal(await page.locator('.cad-overlay polyline,.cad-overlay polygon').count(),1);
    await visibility.check();assert.equal(await page.locator('.cad-overlay polyline,.cad-overlay polygon').count(),5);
    await mkdir('test-results',{recursive:true});const output=path.resolve('test-results/mx-cad-trazos.dxf');await unlink(output).catch(e=>{if(e.code!=='ENOENT')throw e;});
    await app.evaluate(({session},save)=>session.defaultSession.on('will-download',(_e,item)=>item.setSavePath(save)),output);
    await page.locator('#save-drawings').click();await expect.poll(async()=>{try{await access(output);return true;}catch{return false;}}).toBe(true);
    const dxf=await readFile(output,'utf8');assert.match(dxf,/POLYLINE/);assert.match(dxf,/VERTEX/);
    const {DxfLoader}=await import('@flyfish-dev/cad-viewer');
    const parsed=await new DxfLoader().load({buffer:Buffer.from(dxf),fileName:'trazos.dxf'});
    assert.equal(parsed.document.entities.length,5);
    assert.equal(parsed.document.entities.filter(e=>e.layer==='Pruebas').length,4);
    const polygon=parsed.document.entities.find(e=>e.type==='POLYLINE');
    assert.ok(polygon?.isClosed);assert.equal(polygon.vertices.length,4);
    await page.locator('.cad-dock').evaluate(n=>n.scrollTop=0);
    await page.screenshot({path:'test-results/herramientas-mx-cad.png'});
    assert.deepEqual(errors,[]);
  }finally{await app.close();}
});
