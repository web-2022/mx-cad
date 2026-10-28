import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closest,metrics,validPolygon,shapesFromDocument} from '../src/geometry.ts';
const shape=p=>({id:'x',type:'POLIGONO',layer:'0',points:p,nodes:p,closed:true,origin:'Sesión'});
test('área estable en coordenadas topográficas y perímetro',()=>{
  const p=[{x:500000,y:9000000},{x:500030,y:9000000},{x:500030,y:9000040},{x:500000,y:9000040}];
  assert.equal(metrics(shape(p)).area,1200);assert.equal(metrics(shape(p)).length,140);
  assert.equal(metrics(shape([...p].reverse())).area,1200);assert.equal(validPolygon(p),true);
});
test('rechaza cruces y área nula',()=>{
  assert.equal(validPolygon([{x:0,y:0},{x:2,y:2},{x:0,y:2},{x:2,y:0}]),false);
  assert.equal(validPolygon([{x:0,y:0},{x:1,y:0},{x:2,y:0}]),false);
});
test('snap proyecta y conserva Z; longitudes XY y 3D distintas',()=>{
  assert.deepEqual(closest({x:5,y:3},{x:0,y:0,z:10},{x:10,y:0,z:20}),{x:5,y:0,z:15});
  const s={...shape([{x:0,y:0,z:0},{x:3,y:4,z:12}]),closed:false};
  assert.equal(metrics(s).length,5);assert.equal(metrics(s).length3d,13);
});
test('capas ocultas excluidas; puntos y segmentos curvos disponibles',()=>{
  const d={layers:{OFF:{name:'OFF',isVisible:false}},blocks:{},entities:[{type:'POINT',layer:'0',insertionPoint:{x:4,y:8,z:123}},{type:'LINE',layer:'OFF',startPoint:{x:0,y:0},endPoint:{x:2,y:0}},{type:'LWPOLYLINE',vertices:[{x:0,y:0,bulge:1},{x:2,y:0}]}]};
  const out=shapesFromDocument(d);assert.equal(out.length,2);assert.equal(out[0].nodes[0].z,123);assert.ok(Math.abs(metrics(out[1]).length-Math.PI)<.001);
});
