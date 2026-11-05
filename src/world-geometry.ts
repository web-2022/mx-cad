import type {CadEntity,CadPoint3D} from './vendor/cad/index';
type P=CadPoint3D;
export function heightSummary(shapes:{points:P[]}[]){let min=Infinity,max=-Infinity,atZero=0;for(const s of shapes){let zero=true;for(const p of s.points){const z=p.z??0;if(!Number.isFinite(z))continue;min=Math.min(min,z);max=Math.max(max,z);if(Math.abs(z)>1e-8)zero=false;}if(zero&&s.points.length)atZero++;}return Number.isFinite(min)?{min,max,atZero}:undefined;}
const number=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
// AutoCAD arbitrary-axis algorithm: OCS coordinates -> WCS, before INSERT transforms.
export function ocsPoint(p:P,normal?:P):P {
  if(!normal)return {...p,z:p.z??0};
  let nx=normal.x,ny=normal.y,nz=normal.z??1;const length=Math.hypot(nx,ny,nz);
  if(!Number.isFinite(length)||length<1e-12)return {...p,z:p.z??0};nx/=length;ny/=length;nz/=length;
  let ax:number,ay:number,az:number;
  if(Math.abs(nx)<1/64&&Math.abs(ny)<1/64){ax=nz;ay=0;az=-nx;}else{ax=-ny;ay=nx;az=0;}
  const al=Math.hypot(ax,ay,az);ax/=al;ay/=al;az/=al;
  const bx=ny*az-nz*ay,by=nz*ax-nx*az,bz=nx*ay-ny*ax,z=p.z??0;
  return{x:p.x*ax+p.y*bx+z*nx,y:p.x*ay+p.y*by+z*ny,z:p.x*az+p.y*bz+z*nz};
}
export function planarPoint(p:P,e:CadEntity):P {
  const type=e.type.toUpperCase(),classic=/^POLYLINE(_2D|2D)?$/.test(type),spatial=!!(Number(e.flag??0)&(8|16|64));
  const planar=type==='LWPOLYLINE'||classic&&!spatial;
  const rawElevation=e.elevation as unknown;
  const elevation=typeof rawElevation==='number'?number(rawElevation,0):rawElevation&&typeof rawElevation==='object'?number((rawElevation as P).z,0):classic&&!spatial?e.insertionPoint?.z:undefined;
  if(planar)return ocsPoint({...p,z:elevation??p.z??0},e.extrusionDirection);
  if(type==='CIRCLE'||type==='ARC'||type==='SOLID'||type==='TRACE')return ocsPoint({...p,z:p.z??elevation??0},e.extrusionDirection);
  return {...p}; // LINE, POINT and true 3D polyline vertices are already WCS.
}
export function insertedPoint(p:P,base:P,e:CadEntity):P {
  const pos=e.insertionPoint??{x:0,y:0,z:0},scale=e.scale as unknown;
  const sx=typeof scale==='number'?number(scale,1):number((scale as P|undefined)?.x,1),sy=typeof scale==='number'?number(scale,1):number((scale as P|undefined)?.y,1),sz=typeof scale==='number'?number(scale,1):number((scale as P|undefined)?.z,1);
  const x=(p.x-base.x)*sx,y=(p.y-base.y)*sy,z=((p.z??0)-(base.z??0))*sz,r=number(e.rotation,0),c=Math.cos(r),s=Math.sin(r);
  return ocsPoint({x:pos.x+x*c-y*s,y:pos.y+x*s+y*c,z:(pos.z??0)+z},e.extrusionDirection);
}
