import {test} from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,expect} from '@playwright/test';
test('right command bar, middle pan, window zoom, previous views and context capabilities',{timeout:150000},async()=>{
 const app=await electron.launch({args:['.','--enable-unsafe-swiftshader'],env:{...process.env,MX_CAD_TEST:'1'}});
 try{const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#file-input').setInputFiles('tests/fixtures/layouts.dxf');await page.locator('#busy').waitFor({state:'hidden'});
  await expect(page.locator('.cad-dock')).toBeVisible();await expect(page.locator('#nav-orbit')).toBeDisabled();await expect(page.locator('#nav-front')).toBeDisabled();
  const old=await page.locator('#zoom-label').textContent();await page.locator('#nav-plus').click();await expect(page.locator('#zoom-label')).not.toHaveText(old);await page.locator('#nav-previous').click();await expect(page.locator('#zoom-label')).toHaveText(old);
  const v=await page.locator('#viewer canvas').boundingBox();await page.locator('#nav-window').click();await page.mouse.move(v.x+v.width*.3,v.y+v.height*.3);await page.mouse.down();await page.mouse.move(v.x+v.width*.7,v.y+v.height*.7,{steps:5});await page.mouse.up();await expect(page.locator('#zoom-label')).not.toHaveText(old);await page.locator('#nav-previous').click();await expect(page.locator('#zoom-label')).toHaveText(old);
  await page.mouse.move(v.x+v.width/2,v.y+v.height/2);await page.mouse.down({button:'middle'});await page.mouse.move(v.x+v.width*.6,v.y+v.height*.6,{steps:4});await page.mouse.up({button:'middle'});await expect(page.locator('#nav-previous')).toBeEnabled();
  await page.getByRole('tab',{name:'A3-Civil',exact:true}).click();await expect(page.locator('.cad-dock')).toBeVisible();await expect(page.locator('#tool-select')).toBeDisabled();await expect(page.locator('#nav-plus')).toBeEnabled();await page.locator('#nav-plus').click();await expect(page.locator('#nav-previous')).toBeEnabled();await page.locator('#nav-previous').click();
  await page.getByRole('tab',{name:'Model',exact:true}).click();await page.locator('#view-3d').click();await page.locator('#notice').click();await expect(page.locator('#nav-orbit')).toBeEnabled();await page.locator('#nav-side').click();await page.locator('#nav-top').click();await page.locator('#nav-previous').click();
  await page.locator('#file-input').setInputFiles('tests/fixtures/model.glb');await expect(page.locator('#status')).toContainText('GLB');await page.locator('#notice').click();await expect(page.locator('.cad-dock')).toBeVisible();await expect(page.locator('#tool-select')).toBeEnabled();await page.locator('#nav-front').click();await page.locator('#tool-pan').click();await expect(page.locator('#tool-pan')).toHaveAttribute('aria-pressed','true');
  const dock=await page.locator('.cad-dock').boundingBox(),model=await page.locator('#viewer-bim').boundingBox();assert.ok(dock.x>=model.x+model.width-1);assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
