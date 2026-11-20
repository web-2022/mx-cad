import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDm} from '../scripts/block-fixture.mjs';
import {readDmSector} from '../src/datamine-sectors.ts';

test('reads the beginning and end of a logical 4 GiB Datamine file by bounded slices',async()=>{
 const page=4096,pages=1048576,perPage=56;
 const bytes=makeDm({rows:perPage});
 bytes.writeDoubleLE(pages,26*8);
 bytes.writeDoubleLE(1,27*8);
 const source={size:page*pages,slice(start,end){
  assert.ok(end-start<4*1024*1024,'reads at most a bounded sector');
  const data=Buffer.alloc(end-start);
  for(let offset=start;offset<end;offset+=page){
   const template=offset===0?bytes.subarray(0,page):bytes.subarray(page);
   template.copy(data,offset-start,0,Math.min(template.length,end-offset));
  }
  return new Blob([data]);
 }};
 const first=await readDmSector(source,{start:0});
 assert.equal(first.total,(pages-2)*perPage+1);
 assert.equal(first.model.count,25000);
 assert.equal(first.next,25000);
 const last=await readDmSector(source,{start:first.total-1});
 assert.equal(last.model.count,1);
 assert.equal(last.next,null);
 assert.deepEqual([...last.model.positions],[500000,9000000,4800]);
});

test('spatial sector filters world coordinates and retains original attributes across DM pages',async()=>{
 const file=new Blob([makeDm({rows:112})]);
 const result=await readDmSector(file,{start:0,bounds:[500550,500570,9000000,9000000,4800,4800]});
 assert.equal(result.total,112);
 assert.equal(result.model.count,3);
 assert.deepEqual([...result.model.columns.find(c=>c.name==='IJK').data],[56,57,58]);
 assert.deepEqual([...result.model.positions].filter((_,i)=>i%3===0),[500550,500560,500570]);
 const empty=await readDmSector(file,{start:0,bounds:[0,1,0,1,0,1]});
 assert.equal(empty.model,undefined);
});

test('applies the authored Datamine rotation before filtering XYZ',async()=>{
 const file=new Blob([makeDm({rotated:true,extra:70})]);
 const result=await readDmSector(file,{start:0,bounds:[500013,500015,9000001,9000003,4800,4800]});
 assert.equal(result.model.count,1);
 assert.equal(result.model.columns.find(c=>c.name==='IJK').data[0],2);
 assert.equal(result.model.columns.find(c=>c.name==='ATTR69').implicit,69);
});

test('overview counts every record, keeps distant extents and resolves detail after coarsening',async()=>{
 const {readDmOverview}=await import('../src/datamine-sectors.ts');
 const total=28001,source=new Blob([makeDm({rows:total})]);
 const overview=await readDmOverview(source);
 assert.equal(overview.total,total);
 assert.ok(overview.cells.length<=12000);
 assert.equal(overview.cells.reduce((n,c)=>n+c.count,0),total);
 assert.equal(Math.min(...overview.cells.map(c=>c.box[0])),499995);
 assert.equal(Math.max(...overview.cells.map(c=>c.box[1])),780005);
 const cell=overview.cells.find(c=>c.end===total);
 const detail=await readDmSector(source,{start:cell.first,end:cell.end,bounds:cell.center});
 assert.equal(detail.model.count,cell.count);
 assert.equal(detail.next,null);
 assert.equal(detail.model.columns.find(c=>c.name==='IJK').data.at(-1),total);
});

test('overview filters source blocks before summarizing and drill-down keeps the predicate',async()=>{
 const {readDmOverview}=await import('../src/datamine-sectors.ts');
 const file=new Blob([makeDm({rows:28001})]);
 const filter={join:'AND',children:[{field:'AU',op:'>=',value:10000},{field:'ZONE',op:'=',value:'2'}]};
 const overview=await readDmOverview(file,()=>{},{field:'AU',filter});
 assert.equal(overview.matched,9001);
 assert.equal(overview.total,28001);
 assert.equal(overview.cells.reduce((n,c)=>n+c.count,0),overview.matched);
 const cell=overview.cells[0];
 const detail=await readDmSector(file,{start:cell.first,end:cell.end,bounds:cell.center,filter});
 const values=[...detail.model.columns.find(c=>c.name==='AU').data];
 assert.equal(detail.model.count,cell.count);
 assert.ok(values.every(v=>v>=10000&&v%2===0));
 assert.ok(Math.abs(cell.mean-values.reduce((n,v)=>n+v,0)/values.length)<1e-9);
 const categories=await readDmOverview(file,()=>{},{field:'ZONE'});
 assert.equal(categories.numeric,false);
 assert.ok(categories.cells.some(c=>c.mixed));
});
