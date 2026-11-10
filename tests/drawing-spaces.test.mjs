import {test} from 'node:test';
import assert from 'node:assert/strict';
import {separateDrawingSpaces,sheetsOf,viewportScene} from '../src/drawing-spaces.ts';
import {hatchBoundaries} from '../src/hatch-geometry.ts';

test('paper entities are grouped by owner; model and original names remain separate',()=>{
  const doc={format:'dwg',layers:{},blocks:{},entities:[{type:'LINE',handle:'1',ownerBlockRecordHandle:'20'},{type:'TEXT',handle:'2',ownerBlockRecordHandle:'21'},{type:'TEXT',handle:'3',ownerBlockRecordHandle:'22'}],metadata:{}};
  separateDrawingSpaces(doc,[{handle:'A',layoutName:'Model',paperSpaceTableId:'20'},{handle:'B',layoutName:'Plano Norte',paperSpaceTableId:'21',paperWidth:420,paperHeight:297,paperUnits:1},{handle:'C',layoutName:'Detalle',paperSpaceTableId:'22',paperWidth:210,paperHeight:297,paperUnits:1}]);
  assert.equal(doc.entities.length,1);assert.deepEqual(sheetsOf(doc).map(s=>s.name),['Plano Norte','Detalle']);assert.equal(sheetsOf(doc)[0].entities[0].handle,'2');assert.equal(sheetsOf(doc)[1].entities[0].handle,'3');
});
test('inch paper and margins are converted from stored millimetres; unknown sizes stay unknown',()=>{
  const doc={layers:{},blocks:{},entities:[],metadata:{}};
  separateDrawingSpaces(doc,[{layoutName:'Letter',paperWidth:215.9,paperHeight:279.4,paperUnits:0,paperOrigin:{x:-25.4,y:-25.4}},{layoutName:'Sin formato'}]);
  assert.equal(sheetsOf(doc)[0].width,8.5);assert.equal(sheetsOf(doc)[0].origin.x,-1);assert.equal(sheetsOf(doc)[1].width,undefined);assert.ok(sheetsOf(doc)[1].warnings.length);
});
test('viewport scene rotates around its target, without moving unrelated sheets',()=>{
  const v={target:{x:100,y:200},twist:Math.PI/2};const m=viewportScene(v),p={x:110,y:200};
  assert.ok(Math.abs(m.a*p.x+m.c*p.y+m.e)<1e-10);assert.ok(Math.abs(m.b*p.x+m.d*p.y+m.f-10)<1e-10);
});
test('hatch preserves islands and samples curved boundaries without filling unsupported splines',()=>{
  const e={type:'HATCH',boundaryPaths:[{vertices:[{x:0,y:0,bulge:1},{x:10,y:0},{x:10,y:10}]},{vertices:[{x:3,y:3},{x:6,y:3},{x:6,y:6},{x:3,y:6}]}]};
  const b=hatchBoundaries(e);assert.equal(b.loops.length,2);assert.ok(b.loops[0].length>3);assert.equal(b.approximate,true);
  assert.equal(hatchBoundaries({type:'HATCH',boundaryPaths:[{edges:[{type:4}]}]}).unsupported,true);
});
