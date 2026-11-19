import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const js=ts.transpileModule(readFileSync('src/drafting-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {validateDrafts,draftDxf}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const file={id:'drawing',name:'Drawing.dxf',visible:true,entities:[{id:'p',type:'POINT',points:[{x:350000,y:8400000,z:4500}]},{id:'l',type:'LINE',points:[{x:350000,y:8400000,z:4500},{x:350010,y:8400020,z:4510}]}]};
test('drafts preserve full precision world coordinates and point/line types',()=>assert.deepEqual(validateDrafts(JSON.parse(JSON.stringify([file]))),[file]));
test('draft DXF contains real POINT and LINE including Z',()=>{const d=draftDxf(file);assert.match(d,/0\nPOINT[\s\S]*?8\nMX_DIBUJO\n100\nAcDbPoint\n10\n350000\n20\n8400000\n30\n4500/);assert.match(d,/11\n350010\n21\n8400020\n31\n4510/);});
test('malformed drafts, duplicate files and nonfinite coordinates are rejected',()=>{assert.throws(()=>validateDrafts([file,file]));assert.throws(()=>validateDrafts([{...file,entities:[{id:'x',type:'LINE',points:[{x:1,y:2,z:3}]}]}]));assert.throws(()=>validateDrafts([{...file,entities:[{id:'x',type:'POINT',points:[{x:Infinity,y:0,z:0}]}]}]));});

test('scoped DXF reopens with complete geometry, styles and separate block definitions',async()=>{
 const {writeScopeDxf,draftSource}=await import('../src/drafting-data.ts');
 const {default:DxfParser}=await import('dxf-parser');
 const line={type:'LINE',layer:'Topografía',points:[{x:350000,y:8400000,z:4500},{x:350010,y:8400020,z:4510}],color:0x123456,lineweight:35};
 const source=(id,z)=>({id,name:id,units:6,entities:[{type:'INSERT',layer:'Topografía',points:[{x:100,y:200,z}],block:'Pilar'}],
  blocks:new Map([['Pilar',{base:{x:0,y:0,z:0},entities:[line]}]])});
 const contents=writeScopeDxf([source('a',12),source('b',20),draftSource({...file,entities:[file.entities[1]]})]);
 const doc=new DxfParser().parseSync(contents);
 assert.equal(doc.header.$INSUNITS,0);
 assert.deepEqual(doc.entities.map(e=>e.type),['INSERT','INSERT','LINE']);
 assert.deepEqual(doc.entities.slice(0,2).map(e=>e.position.z),[12,20]);
 assert.notEqual(doc.entities[0].name,doc.entities[1].name);
 assert.notEqual(doc.entities[0].layer,doc.entities[1].layer);
 const saved=doc.blocks[doc.entities[0].name].entities[0];
 assert.deepEqual(saved.vertices,line.points);
 assert.equal(saved.color,0x123456);
 assert.equal(saved.lineweight,35);
});
