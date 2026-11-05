import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shapesFromDocument} from '../src/geometry.ts';
import {ocsPoint} from '../src/world-geometry.ts';
const doc=entities=>({format:'dwg',entities,layers:{},blocks:{}});
test('2D polylines at mine elevations align with true 3D linework without moving genuine Z=0 geometry',()=>{
 const d=doc([{type:'LWPOLYLINE',elevation:4800,vertices:[{x:500000,y:9000000},{x:500010,y:9000000}]},{type:'LINE',startPoint:{x:500000,y:9000000,z:4800},endPoint:{x:500010,y:9000000,z:4800}},{type:'LWPOLYLINE',elevation:0,vertices:[{x:0,y:0},{x:10,y:0}]}]);
 const shapes=shapesFromDocument(d,{world3D:true});assert.deepEqual(shapes[0].points,shapes[1].points);assert.equal(shapes[2].points[0].z,0);assert.equal(shapesFromDocument(d)[0].points[0].z,undefined);
});
test('true 3D polyline vertex heights are preserved, including classic flag 8',()=>{
 for(const type of ['POLYLINE_3D','POLYLINE']){const out=shapesFromDocument(doc([{type,flag:8,elevation:0,vertices:[{x:0,y:0,z:4800},{x:1,y:1,z:4810}]}]),{world3D:true});assert.deepEqual(out[0].points.map(p=>p.z),[4800,4810]);}
});
test('nested block base points, elevation, scale and arbitrary extrusion remain in the same world space',()=>{
 const d=doc([{type:'INSERT',blockName:'A',insertionPoint:{x:100,y:200,z:4800},scale:{x:2,y:2,z:2}}]);d.blocks={A:{basePoint:{x:10,y:20,z:5},entities:[{type:'INSERT',blockName:'B',insertionPoint:{x:10,y:20,z:5}}]},B:{basePoint:{x:0,y:0,z:0},entities:[{type:'LWPOLYLINE',elevation:10,vertices:[{x:0,y:0},{x:1,y:0}]}]}};
 assert.deepEqual(shapesFromDocument(d,{world3D:true})[0].points,[{x:100,y:200,z:4820},{x:102,y:200,z:4820}]);
 assert.deepEqual(ocsPoint({x:2,y:3,z:4},{x:0,y:1,z:0}),{x:-2,y:4,z:3});
});
test('tilted OCS polylines and blocks use their stored orientation, not a horizontal replacement',()=>{
 const e={type:'LWPOLYLINE',elevation:4,extrusionDirection:{x:0,y:1,z:0},vertices:[{x:2,y:3},{x:5,y:6}]};assert.deepEqual(shapesFromDocument(doc([e]),{world3D:true})[0].points,[{x:-2,y:4,z:3},{x:-5,y:4,z:6}]);
 const d=doc([{type:'INSERT',blockName:'A',extrusionDirection:{x:0,y:1,z:0},insertionPoint:{x:0,y:0,z:4}}]);d.blocks={A:{entities:[{type:'LINE',startPoint:{x:2,y:3,z:0},endPoint:{x:5,y:6,z:0}}]}};assert.deepEqual(shapesFromDocument(d,{world3D:true})[0].points,[{x:-2,y:4,z:3},{x:-5,y:4,z:6}]);
});
