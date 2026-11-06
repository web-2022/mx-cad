import type {CadDocument,CadEntity,CadPoint3D} from './vendor/cad/core/types';
import {insertedPoint,planarPoint} from './world-geometry.ts';
export type P=CadPoint3D;
export interface Surface {id:string;entity:CadEntity;style:CadEntity;parent?:CadEntity;layer:string;points:P[];triangles:number[];state:'Abierta'|'Cerrada (topología)'|'No verificable';warning?:string;block:boolean}
export const cross=(a:P,b:P,c:P)=>{const u=[b.x-a.x,b.y-a.y,(b.z??0)-(a.z??0)],v=[c.x-a.x,c.y-a.y,(c.z??0)-(a.z??0)];return{x:u[1]*v[2]-u[2]*v[1],y:u[2]*v[0]-u[0]*v[2],z:u[0]*v[1]-u[1]*v[0]};};
const key=(p:P)=>`${p.x},${p.y},${p.z??0}`;
export function topology(points:P[],triangles:number[]):Surface['state']{const edges=new Map<string,{n:number;direction:number}>();for(let i=0;i<triangles.length;i+=3){const indices=triangles.slice(i,i+3);if(indices.length!==3)return 'No verificable';for(let j=0;j<3;j++){const a=key(points[indices[j]]),b=key(points[indices[(j+1)%3]]);if(a===b)return 'No verificable';const k=a<b?a+'|'+b:b+'|'+a,e=edges.get(k)??{n:0,direction:0};e.n++;e.direction+=a<b?1:-1;edges.set(k,e);}}if(!edges.size||[...edges.values()].some(e=>e.n>2))return 'No verificable';if([...edges.values()].some(e=>e.n===1))return 'Abierta';return [...edges.values()].every(e=>e.direction===0)?'Cerrada (topología)':'No verificable';}
/** Only explicit triangle/quad faces are accepted. No interpolation from wire lines. */
export function surfacesFromDocument(doc:CadDocument,inherit:(e:CadEntity,parent:CadEntity|undefined,layer:string)=>CadEntity=(e,_p,layer)=>({...e,layer})){
 const surfaces:Surface[]=[],warnings:string[]=[];let serial=0;
 function walk(entities:CadEntity[],transform:(p:P)=>P,depth=0,parent?:CadEntity,inherited='0'){
  if(depth>16){warnings.push('Bloque demasiado anidado: superficie no leída.');return;}
  for(const e of entities){if(e.isInPaperSpace)continue;const type=e.type.toUpperCase(),layer=e.layer&&e.layer!=='0'?e.layer:inherited,style=inherit(e,parent,layer);
   if(type==='INSERT'){const b=doc.blocks[e.blockName??e.name??''];if(b)walk(b.entities,p=>transform(insertedPoint(p,b.basePoint??{x:0,y:0},e)),depth+1,style,layer);else warnings.push(`Bloque sin definición: ${e.handle??e.blockName}`);continue;}
   let points:P[]=[],faces:number[][]=[];
   if(['3DFACE','SOLID','TRACE'].includes(type)){points=(e.vertices??e.points??[e.corner1,e.corner2,e.corner3,e.corner4].filter(Boolean)) as P[];if(points.length===4&&key(points[2])===key(points[3]))points=points.slice(0,3);if(type!=='3DFACE'&&points.length===4)points=[points[0],points[1],points[3],points[2]];faces=[points.map((_,i)=>i)];}
   else if(e.meshFaces&&Array.isArray(e.meshVertices)){points=e.meshVertices as P[];faces=e.meshFaces as number[][];}
   else if(['MESH','POLYFACE','POLYLINE_PFACE'].includes(type)||(type==='POLYLINE'&&(Number(e.flag??0)&64))){warnings.push(`${type} ${e.handle??''}: el lector no proporcionó conectividad de caras válida.`);continue;}
   else {if(/3DSOLID|BODY|REGION|SURFACE|PROXY|ACIS/.test(type))warnings.push(`${type} ${e.handle??e.id??''}: sin teselación compatible; no se inventan superficies.`);continue;}
   if(points.length<3)continue;if(Number(e.thickness))warnings.push(`${type} ${e.handle??''}: el espesor no se extruye; se muestra la cara explícita.`);
   const triangles:number[]=[];let invalid=0;
   points=points.map(p=>transform(planarPoint(p,e)));
   for(let face of faces){face=face.filter((v,i)=>i===0||v!==face[i-1]);if(face.length>3&&face.at(-1)===face[0])face=face.slice(0,-1);if(![3,4].includes(face.length)||face.some(i=>!Number.isInteger(i)||i<0||i>=points.length)||face.some(i=>!Number.isFinite(points[i].x+points[i].y+(points[i].z??0)))){invalid++;continue;}
    const n=cross(points[face[0]],points[face[1]],points[face[2]]);if(Math.hypot(n.x,n.y,n.z)<1e-12){invalid++;continue;}
    // Reject non-planar/concave quads rather than invent a diagonal.
    if(face.length===4){const a=points[face[0]],d=points[face[3]],n2=cross(a,points[face[2]],d);if(n.x*n2.x+n.y*n2.y+n.z*n2.z<=0||Math.abs(n.x*(d.x-a.x)+n.y*(d.y-a.y)+n.z*((d.z??0)-(a.z??0)))>1e-7*Math.hypot(n.x,n.y,n.z)){invalid++;continue;}}
    triangles.push(face[0],face[1],face[2]);if(face.length===4)triangles.push(face[0],face[2],face[3]);
   }
   if(invalid)warnings.push(`${type} ${e.handle??''}: ${invalid} cara(s) inválida(s), no planares o de más de cuatro vértices no representadas.`);
   if(triangles.length)surfaces.push({id:`surface-${serial++}`,entity:e,style,parent,layer,points,triangles,state:invalid?'No verificable':topology(points,triangles),warning:invalid?'Representación parcial: revisar avisos.':undefined,block:depth>0});
  }
 }
 walk(doc.entities,p=>({...p,z:p.z??0}));return {surfaces,warnings};
}
export interface Triangle {a:P;b:P;c:P;owner:number}
interface Box {min:P;max:P;left?:Box;right?:Box;items?:Triangle[]}
export class TriangleIndex {
 private root?:Box;
 constructor(triangles:Triangle[]){const build=(items:Triangle[]):Box=>{const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};for(const t of items)for(const p of [t.a,t.b,t.c])for(const k of ['x','y','z'] as const){min[k]=Math.min(min[k]!,p[k]??0);max[k]=Math.max(max[k]!,p[k]??0);}const box:Box={min,max};if(items.length<=12)box.items=items;else{const axis=(['x','y','z'] as const).reduce((a,b)=>max[b]!-min[b]!>max[a]!-min[a]!?b:a);items.sort((a,b)=>((a.a[axis]??0)+(a.b[axis]??0)+(a.c[axis]??0))-((b.a[axis]??0)+(b.b[axis]??0)+(b.c[axis]??0)));const mid=items.length>>1;box.left=build(items.slice(0,mid));box.right=build(items.slice(mid));}return box;};if(triangles.length)this.root=build([...triangles]);}
 hit(origin:P,direction:P,visible:(owner:number)=>boolean=()=>true){let best=Infinity,result:{owner:number;point:P;distance:number}|undefined;
 const boxHit=(b:Box)=>{let near=0,far=best;for(const k of ['x','y','z'] as const){const d=direction[k]??0,o=origin[k]??0;if(Math.abs(d)<1e-15){if(o<b.min[k]!||o>b.max[k]!)return false;}else{const a=(b.min[k]!-o)/d,c=(b.max[k]!-o)/d;near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));if(near>far)return false;}}return true;};
 const visit=(b?:Box)=>{if(!b||!boxHit(b))return;if(b.left){visit(b.left);visit(b.right);return;}for(const t of b.items??[]){if(!visible(t.owner))continue;const e1={x:t.b.x-t.a.x,y:t.b.y-t.a.y,z:(t.b.z??0)-(t.a.z??0)},e2={x:t.c.x-t.a.x,y:t.c.y-t.a.y,z:(t.c.z??0)-(t.a.z??0)},h={x:direction.y*(e2.z??0)-(direction.z??0)*e2.y,y:(direction.z??0)*e2.x-direction.x*(e2.z??0),z:direction.x*e2.y-direction.y*e2.x},det=e1.x*h.x+e1.y*h.y+(e1.z??0)*h.z;if(Math.abs(det)<1e-12)continue;const inv=1/det,s={x:origin.x-t.a.x,y:origin.y-t.a.y,z:(origin.z??0)-(t.a.z??0)},u=(s.x*h.x+s.y*h.y+s.z*h.z)*inv;if(u<0||u>1)continue;const q={x:s.y*(e1.z??0)-s.z*e1.y,y:s.z*e1.x-s.x*(e1.z??0),z:s.x*e1.y-s.y*e1.x},v=(direction.x*q.x+direction.y*q.y+(direction.z??0)*q.z)*inv;if(v<0||u+v>1)continue;const d=(e2.x*q.x+e2.y*q.y+(e2.z??0)*q.z)*inv;if(d>=0&&d<best){best=d;result={owner:t.owner,distance:d,point:{x:origin.x+direction.x*d,y:origin.y+direction.y*d,z:(origin.z??0)+(direction.z??0)*d}};}}};visit(this.root);return result;
 }
}
