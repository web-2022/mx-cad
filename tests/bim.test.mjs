import {test} from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
test('local GLB, glTF companions and IFC: geometry, properties, visibility, PNG and return to CAD',{timeout:180000},async()=>{
  const app=await electron.launch({args:['.','--enable-unsafe-swiftshader'],env:{...process.env,MX_CAD_TEST:'1'}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[],remote=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(r.url()))remote.push(r.url());});
    await page.locator('#file-input').setInputFiles('tests/fixtures/model.glb');
    await expect(page.locator('#status')).toContainText('GLB · 1 elementos');
    await expect(page.locator('#viewer-bim')).toBeVisible();
    await page.locator('#notice').click();
    await expect.poll(()=>page.locator('.bim-stage canvas').evaluate(canvas=>{
      const gl=canvas.getContext('webgl2'),pixel=new Uint8Array(4);gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel[0]>60&&pixel[0]>pixel[1];
    })).toBe(true);
    await page.getByRole('button',{name:'Triangulo de prueba',exact:true}).click();await expect(page.locator('#bim-properties')).toContainText('Arquitectura');
    const visible=page.getByRole('checkbox',{name:'Mostrar Triangulo de prueba',exact:true});await visible.uncheck();await visible.check();
    await page.locator('#plus').click();await page.locator('#fit').click();console.log('GLB: geometría renderizada, nombres y propiedades comprobados');
    await mkdir('test-results',{recursive:true});
    await app.evaluate(({session},save)=>session.defaultSession.on('will-download',(_e,item)=>item.setSavePath(save)),path.resolve('test-results/bim.png'));
    await page.locator('#export').click();await expect.poll(async()=>{try{return(await readFile('test-results/bim.png')).length>100;}catch{return false;}}).toBe(true);
    await page.locator('#file-input').setInputFiles('tests/fixtures/model.gltf');await page.locator('#busy').waitFor({state:'hidden'});await expect(page.locator('#notice')).toContainText('Falta el archivo local');
    await page.locator('#file-input').setInputFiles(['tests/fixtures/model.gltf','tests/fixtures/model.bin']);await expect(page.locator('#status')).toContainText('GLTF · 1 elementos');
    const external=JSON.parse(await readFile('tests/fixtures/model.gltf','utf8'));external.buffers[0].uri='https://example.com/model.bin';
    await page.locator('#file-input').setInputFiles({name:'externo.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(external))});await page.locator('#busy').waitFor({state:'hidden'});await expect(page.locator('#notice')).toContainText('referencias externas');
    console.log('glTF: recursos locales y bloqueo de referencias externas comprobados');await page.locator('#file-input').setInputFiles('tests/fixtures/wall.ifc');await page.locator('#busy').waitFor({state:'hidden',timeout:90000});assert.match(await page.locator('#status').textContent(),/IFC · 1 elementos/,await page.locator('#notice').textContent());
    await page.locator('#notice').click();await page.getByRole('button',{name:'Muro de prueba',exact:true}).click();await expect(page.locator('#bim-properties')).toContainText(/IfcWall/i);await expect(page.locator('#bim-properties')).toContainText('M-01');
    await page.locator('#file-input').setInputFiles({name:'modelo.nwd',mimeType:'application/octet-stream',buffer:Buffer.from('test')});await expect(page.locator('#notice')).toContainText('no se abren directamente');
    await page.locator('#file-input').setInputFiles('public/ejemplo.dxf');await expect(page.locator('#filename')).toHaveText('ejemplo.dxf');assert.equal(await page.locator('#viewer-bim').isVisible(),false);assert.equal(await page.locator('#viewer').isVisible(),true);
    await page.locator('#clear').click();assert.equal(await page.locator('#empty').isVisible(),true);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  }finally{await app.close();}
});
