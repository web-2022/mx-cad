import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,mkdir} from 'node:fs/promises';
import { _electron as electron } from '@playwright/test';
const config='.fixtures/local-dwgs.json';
test('DWG privados: encuadre y geometría visible', {skip:!existsSync(config),timeout:300000},async()=>{
  const app=await electron.launch({args:['.'],env:{...process.env,MX_CAD_TEST:'1'}});
  try{
    const page=await app.firstWindow();await page.locator('#open-empty').waitFor();
    await mkdir('test-results/diagnostic',{recursive:true});
    for(const [i,file]of JSON.parse(await readFile(config,'utf8')).entries()){
      await page.locator('#file-input').setInputFiles(file);
      await page.locator('#busy').waitFor({state:'hidden',timeout:180000});
      assert.equal(await page.locator('#filename').textContent(),file.split(/[\\/]/).at(-1));
      assert.doesNotMatch(await page.locator('#status').textContent(),/^0 entidades/);
      assert.equal(await page.locator('#notice').isVisible(),false);
      assert.equal(await page.locator('#drawing-region').isVisible(),true);
      await page.locator('#fit').click();
      const box=await page.locator('#viewport').boundingBox();
      const png=await page.screenshot({clip:{x:box.x+20,y:box.y+45,width:box.width-40,height:box.height-100}});
      const visible=await page.evaluate(async b64=>{
        const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let count=0;
        for(let n=0;n<pixels.length;n+=16)if(Math.max(pixels[n],pixels[n+1],pixels[n+2])>100)count++;
        return count;
      },png.toString('base64'));
      console.log(`DWG local ${i+1}:`,await page.locator('#status').textContent(),`muestras visibles: ${visible}`);
      assert.ok(visible>1000,'Deben verse los detalles de la geometría; una línea aislada no basta.');
      await page.screenshot({path:`test-results/diagnostic/corregido-${i+1}.png`});
    }
  }finally{await app.close();}
});
