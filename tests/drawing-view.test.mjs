import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawingRegions,preferredRegion,savedViewAnchor} from '../src/drawing-view.ts';
const shape=(x,y)=>({id:'x',type:'LINE',layer:'0',origin:'Plano',points:[{x,y},{x:x+2,y:y+1}],nodes:[],closed:false});
test('separa detalles locales y topografía sin incluir el vacío entre zonas',()=>{
  const shapes=[];for(let i=0;i<15;i++)shapes.push(shape(1000+i,420),shape(495000+i,8324000));
  const regions=drawingRegions(shapes);assert.equal(regions.length,2);assert.ok(regions.every(r=>r.maxX-r.minX<100));
  const doc={savedView:{center:{x:1005,y:420},target:{x:0,y:0},sceneTransformApplied:true,sceneTransform:{a:1,b:0,c:0,d:1,e:0,f:0}}};
  assert.ok(regions[preferredRegion(doc,regions)].minX<2000);
});
test('suma TARGET al centro DCS y elige la zona georreferenciada',()=>{
  const doc={savedView:{center:{x:-850,y:90},target:{x:393430,y:8553849},sceneTransformApplied:true,sceneTransform:{a:1,b:0,c:0,d:1,e:0,f:0}}};
  assert.deepEqual(savedViewAnchor(doc),{x:392580,y:8553939});
  const regions=[{minX:0,minY:0,maxX:1000,maxY:500,count:100},{minX:392000,minY:8553000,maxX:394000,maxY:8555000,count:20}];
  assert.equal(preferredRegion(doc,regions),1);
});
test('no divide un dibujo continuo y no depende del zoom microscópico guardado',()=>{
  const regions=drawingRegions(Array.from({length:100},(_,i)=>shape(i,Math.sin(i))));
  assert.equal(regions.length,1);assert.equal(regions[0].count,100);assert.ok(regions[0].maxX>90);
  assert.deepEqual(drawingRegions([]),[]);
});
