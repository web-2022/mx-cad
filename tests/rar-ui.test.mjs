import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {crc32} from 'node:zlib';
import {_electron as electron,chromium,expect} from '@playwright/test';

function storedRar(name,bytes){
 const header=(type,flags,data)=>{
  const body=Buffer.alloc(5+data.length);body[0]=type;body.writeUInt16LE(flags,1);body.writeUInt16LE(2+body.length,3);data.copy(body,5);
  const checksum=Buffer.alloc(2);checksum.writeUInt16LE(crc32(body)&0xffff);
  return Buffer.concat([checksum,body]);
 };
 const filename=Buffer.from(name),entry=Buffer.alloc(25+filename.length);
 entry.writeUInt32LE(bytes.length,0);entry.writeUInt32LE(bytes.length,4);entry[8]=3;entry.writeUInt32LE(crc32(bytes),9);
 entry[17]=20;entry[18]=0x30;entry.writeUInt16LE(filename.length,19);entry.writeUInt32LE(0o100644,21);filename.copy(entry,25);
 return Buffer.concat([Buffer.from([82,97,114,33,26,7,0]),header(0x73,0,Buffer.alloc(6)),header(0x74,0x8000,entry),bytes,header(0x7b,0,Buffer.alloc(0))]);
}

test('RAR import renders CAD and keeps point and line snap visible in 3D',{timeout:90000},async()=>{
 const browser=process.env.MX_BLOCK_BROWSER?await chromium.launch({executablePath:process.env.MX_BLOCK_BROWSER,args:['--no-sandbox','--enable-unsafe-swiftshader']}):undefined;
 const app=browser?undefined:await electron.launch({args:['.','--enable-unsafe-swiftshader'],env:{...process.env,MX_CAD_TEST:'1'}});
 try{
  const page=browser?await browser.newPage({viewport:{width:1400,height:950}}):await app.firstWindow();
  if(browser)await page.goto(process.env.MX_DWG_URL??'http://127.0.0.1:4180/');
  else await page.setViewportSize({width:1400,height:950});
  const input=page.locator('#file-input');
  const fixture=await readFile('tests/fixtures/surfaces.dxf');
  await input.setInputFiles({name:'synthetic.rar',mimeType:'application/vnd.rar',buffer:storedRar('planos/topografia.dxf',fixture)});
  await expect(page.locator('#viewer-3d')).toBeVisible({timeout:20000});
  await expect(page.locator('#project-tree')).toContainText('topografia.dxf');
  for(const label of ['Snap punto','Snap línea']){
   const button=page.getByRole('button',{name:label,exact:true});
   await expect(button).toBeInViewport();
   await button.click();
   await expect(button).toHaveAttribute('aria-pressed','true');
  }
  await input.setInputFiles({name:'invalid.rar',mimeType:'application/vnd.rar',buffer:Buffer.from('invalid')});
  await expect(page.locator('#notice')).toContainText('No se pudo abrir el RAR');
  await expect(page.locator('#viewer-3d')).toBeVisible();
 }finally{await browser?.close();await app?.close();}
});
