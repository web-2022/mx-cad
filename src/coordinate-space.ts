import type {CadDocument,CadPoint3D} from './vendor/cad/core/types';
export function drawingPoint(p:CadPoint3D,doc?:CadDocument):CadPoint3D{
 const m=doc?.savedView?.sceneTransform;if(!m||doc?.metadata.sceneTransformApplied===true||doc?.savedView?.sceneTransformApplied===false)return {...p};
 const det=m.a*m.d-m.b*m.c;if(Math.abs(det)<1e-15)return {...p};const x=p.x-m.e,y=p.y-m.f;return {x:(m.d*x-m.c*y)/det,y:(-m.b*x+m.a*y)/det,z:p.z};
}
