import * as T from 'three';
import type {DraftPoint} from './drafting-data';

const neighboringEdges = new WeakMap<object,Map<string,{normal:any;internal:boolean}>>();
const keyFor = (a:string,b:string) => a < b ? a+'|'+b : b+'|'+a;
const vertexKey = (p:any,i:number) => [p.getX(i),p.getY(i),p.getZ(i)].join(',');
function edgeTopology(geometry:any) {
 let edges=neighboringEdges.get(geometry);
 if(edges)return edges;
 edges=new Map();neighboringEdges.set(geometry,edges);
 const position=geometry.attributes.position,index=geometry.index;
 const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
 for(let i=0,count=index?.count??position.count;i+2<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
  const names=ids.map(id=>vertexKey(position,id));
  a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]);c.fromBufferAttribute(position,ids[2]);
  const normal=b.sub(a).cross(c.sub(a)).normalize();
  for(let j=0;j<3;j++){
   const key=keyFor(names[j],names[(j+1)%3]),other=edges.get(key);
   if(other){if(Math.abs(other.normal.dot(normal))>0.999999)other.internal=true;}
   else edges.set(key,{normal:normal.clone(),internal:false});
  }
 }
 return edges;
}

export function draftProjection(camera:any,canvas:HTMLCanvasElement,origin:number[],p:DraftPoint){
 const v=new T.Vector3(p.x-origin[0],p.y-origin[1],p.z-origin[2]).project(camera),r=canvas.getBoundingClientRect();
 return Math.abs(v.z)>1?undefined:{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
}
export function draftCapture(camera:any,canvas:HTMLCanvasElement,scene:any,origin:number[],x:number,y:number,mode:string,z:number,blockCandidate?:any){
 const r=canvas.getBoundingClientRect(),ray=new T.Raycaster();
 camera.updateMatrixWorld();
 ray.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);
 const world=(p:any)=>({x:p.x+origin[0],y:p.y+origin[1],z:p.z+origin[2]});
 if(mode==='none'){
  const p=new T.Vector3();
  return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,0,1),origin[2]-z),p)?world(p):undefined;
 }
 // The viewers use orthographic cameras for CAD and blocks.
 const tolerance=camera.isOrthographicCamera?12*(camera.right-camera.left)/(r.width*camera.zoom):0;
 ray.params.Line.threshold=tolerance;ray.params.Points.threshold=tolerance;
 const objects:any[]=[];
 scene.traverseVisible((object:any)=>{
  if(blockCandidate!==undefined&&object.isInstancedMesh)return;
  if(object.isMesh&&object.material?.depthTest!==false||mode!=='face'&&(object.isLine||object.isPoints)&&object.material?.depthTest!==false)objects.push(object);
 });
 const visible=(material:any,p:any)=>{
  if(!material||material.visible===false||material.opacity===0)return false;
  const clips=material.clippingPlanes??[];
  return !clips.length||(material.clipIntersection?clips.some((plane:any)=>plane.distanceToPoint(p)>=0):clips.every((plane:any)=>plane.distanceToPoint(p)>=0));
 };
 scene.updateMatrixWorld(true);
 if(blockCandidate)objects.push(blockCandidate);
 const hits=ray.intersectObjects(objects,false);
 let best:DraftPoint|undefined,distance=12;
 function consider(p:any,material:any){
  if(!visible(material,p))return;
  const result=world(p),screen=draftProjection(camera,canvas,origin,result);
  if(!screen)return;
  const d=Math.hypot(screen.x-x,screen.y-y);
  if(d<distance){distance=d;best=result;}
 }
 for(const h of hits){
  const o=h.object,material=Array.isArray(o.material)?o.material[h.face?.materialIndex??0]:o.material;
  if(!visible(material,h.point))continue;
  if(o.isPoints&&mode==='point'){
   consider(new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,h.index).applyMatrix4(o.matrixWorld),material);
  }
  if(o.isLine){
   if(mode==='line')consider(h.point,material);
   if(mode==='point'){
    const {index,attributes}=o.geometry;
    for(const i of [h.index,h.index+1])consider(new T.Vector3().fromBufferAttribute(attributes.position,index?index.getX(i):i).applyMatrix4(o.matrixWorld),material);
   }
  }
  if(!h.face||!o.isMesh)continue;
  if(mode==='face')return world(h.point);
  const pos=o.geometry.attributes.position,m=o.matrixWorld.clone();
  if(h.instanceId!==undefined){const instance=new T.Matrix4();o.getMatrixAt(h.instanceId,instance);m.multiply(instance);}
  const ids=[h.face.a,h.face.b,h.face.c];
  const vertices=ids.map(i=>new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(m));
  if(mode==='point')vertices.forEach(p=>consider(p,material));
  else {
   const topology=edgeTopology(o.geometry);
   for(let i=0;i<3;i++){
    const j=(i+1)%3;
    if(topology.get(keyFor(vertexKey(pos,ids[i]),vertexKey(pos,ids[j])))?.internal)continue;
    const segment=new T.Line3(vertices[i],vertices[j]);
    consider(segment.closestPointToPoint(h.point,true,new T.Vector3()),material);
   }
  }
  break;
 }
 return best;
}
