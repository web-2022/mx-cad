import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectPoint,View3D} from '../src/view-3d.ts';

test('front view preserves height and top view preserves the XY plane',()=>{
  const p={x:10,y:20,z:30},c={x:0,y:0,z:0};
  assert.deepEqual(projectPoint(p,c,0,0),{x:10,y:-30});
  const top=projectPoint(p,c,0,Math.PI/2);
  assert.equal(top.x,10);assert.ok(Math.abs(top.y-20)<1e-10);
});
test('survey coordinates are centered before rotation',()=>{
  const c={x:1e9,y:2e9,z:100};
  const q=projectPoint({x:c.x+3,y:c.y+4,z:105},c,Math.PI/2,0);
  assert.ok(Math.abs(q.x+4)<1e-10);assert.equal(q.y,-5);
});
test('canvas fits, draws, changes views and releases its observer',()=>{
  let strokes=0,disconnected=false;
  const ctx=new Proxy({stroke(){strokes++;}}, {get:(o,k)=>o[k]??(()=>{})});
  const canvas={style:{},setAttribute(){},addEventListener(){},getContext(){return ctx;},remove(){}};
  globalThis.document={createElement:()=>canvas};
  globalThis.devicePixelRatio=1;
  globalThis.ResizeObserver=class{observe(){}disconnect(){disconnected=true;}};
  const host={clientWidth:800,clientHeight:600,append(){}};
  const view=new View3D(host);
  assert.equal(view.setShapes([{points:[{x:0,y:0,z:0},{x:10,y:20,z:30}],closed:false}]),1);
  assert.ok(strokes>0);assert.equal(canvas.width,800);
  view.preset('front');view.zoom(1.25);view.background(true);
  assert.equal(view.setShapes([]),0);
  view.destroy();assert.equal(disconnected,true);
});
