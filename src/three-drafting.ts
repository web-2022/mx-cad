import * as T from 'three';
import type {DraftPoint} from './drafting-data';
export function draftProjection(camera:any,canvas:HTMLCanvasElement,origin:number[],p:DraftPoint){const v=new T.Vector3(p.x-origin[0],p.y-origin[1],p.z-origin[2]).project(camera),r=canvas.getBoundingClientRect();return Math.abs(v.z)>1?undefined:{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
export function draftCapture(camera:any,canvas:HTMLCanvasElement,scene:any,origin:number[],x:number,y:number,mode:string,z:number){
 const r=canvas.getBoundingClientRect(),ray=new T.Raycaster();camera.updateMatrixWorld();ray.params.Line.threshold=0;ray.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);scene.updateMatrixWorld(true);
 const hits=ray.intersectObjects(scene.children,true).filter((h:any)=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}const material=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex??0]:h.object.material;return h.face&&h.object.isMesh&&material?.visible!==false&&material?.opacity!==0;});const h=hits[0];
 const world=(p:any)=>({x:p.x+origin[0],y:p.y+origin[1],z:p.z+origin[2]});
 if(mode!=='none'){
 if(!h)return;
 if(mode==='face')return world(h.point);
 const pos=h.object.geometry.attributes.position,m=h.object.matrixWorld.clone();if(h.instanceId!==undefined){const instance=new T.Matrix4();h.object.getMatrixAt(h.instanceId,instance);m.multiply(instance);}
 const vertices=[h.face.a,h.face.b,h.face.c].map(i=>new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(m));
 let best:any,dist=12;
 const consider=(p:any)=>{const s=draftProjection(camera,canvas,origin,world(p));if(!s)return;const d=Math.hypot(s.x-x,s.y-y);if(d<dist){dist=d;best=p;}};
 if(mode==='point')vertices.forEach(consider);else for(let i=0;i<3;i++){const a=vertices[i],b=vertices[(i+1)%3],segment=new T.Line3(a,b);consider(segment.closestPointToPoint(h.point,true,new T.Vector3()));}
 return best?world(best):undefined;
 }
 const p=new T.Vector3();return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,0,1),origin[2]-z),p)?world(p):undefined;
}
