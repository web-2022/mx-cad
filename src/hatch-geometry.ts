import type { CadEntity, CadPoint2D } from './vendor/cad/index';

type P=CadPoint2D;
const valid=(p:any):p is P=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
function arc(center:P,rx:number,ry:number,start:number,end:number,ccw=true,rotation=0):P[]{
  let sweep=end-start;if(ccw){while(sweep<=0)sweep+=Math.PI*2;}else{while(sweep>=0)sweep-=Math.PI*2;}
  const n=Math.min(1024,Math.max(8,Math.ceil(Math.abs(sweep)*48))),c=Math.cos(rotation),s=Math.sin(rotation);
  return Array.from({length:n+1},(_,i)=>{const a=start+sweep*i/n,x=rx*Math.cos(a),y=ry*Math.sin(a);return{x:center.x+x*c-y*s,y:center.y+x*s+y*c};});
}
function polyline(vertices:any[],closed=true):P[]{
  const out:P[]=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length];if(!valid(a))continue;out.push(a);
    const bulge=Number((a as P & {bulge?:number}).bulge??0);if(!bulge||!valid(b)||(!closed&&i===vertices.length-1))continue;
    const dx=b.x-a.x,dy=b.y-a.y,center={x:(a.x+b.x)/2-dy*(1-bulge*bulge)/(4*bulge),y:(a.y+b.y)/2+dx*(1-bulge*bulge)/(4*bulge)},radius=Math.hypot(a.x-center.x,a.y-center.y),start=Math.atan2(a.y-center.y,a.x-center.x);
    out.push(...arc(center,radius,radius,start,start+4*Math.atan(bulge),bulge>0).slice(1,-1));
  }return out;
}
export function hatchBoundaries(e:CadEntity):{loops:P[][];approximate:boolean;unsupported:boolean}{
  const paths=(e.boundaryPaths??e.boundaryLoops??e.loops) as any[]|undefined;
  let approximate=false,unsupported=false;
  const loops:P[][]=[];
  for(const path of paths??[]){
    if(path.unsupported){unsupported=true;continue;}
    if(path.vertices?.length){approximate ||= path.vertices.some((v:any)=>!!v.bulge);loops.push(polyline(path.vertices));continue;}
    if(path.edges?.length){const points:P[]=[];for(const edge of path.edges){
      if(edge.type===1&&valid(edge.start)&&valid(edge.end))points.push(edge.start,edge.end);
      else if(edge.type===2&&valid(edge.center)){approximate=true;points.push(...arc(edge.center,edge.radius,edge.radius,edge.startAngle,edge.endAngle,edge.isCCW!==false));}
      else if(edge.type===3&&valid(edge.center)&&valid(edge.end)){approximate=true;const rx=Math.hypot(edge.end.x,edge.end.y);points.push(...arc(edge.center,rx,rx*edge.lengthOfMinorAxis,edge.startAngle,edge.endAngle,edge.isCCW!==false,Math.atan2(edge.end.y,edge.end.x)));}
      else unsupported=true;
    }if(points.length>=3)loops.push(points);}
    else if(path.commands?.length){const points=path.commands.filter((c:any)=>c.cmd==='M'||c.cmd==='L').map((c:any)=>c.points[0]);if(path.commands.some((c:any)=>!['M','L','Z'].includes(c.cmd)))unsupported=true;else if(points.length>=3)loops.push(points);}
    else unsupported=true;
  }
  return{loops:loops.filter(p=>p.length>=3&&p.every(valid)),approximate,unsupported};
}

export function hatchDiagnostics(e:CadEntity):string[]{
  const b=hatchBoundaries(e),out:string[]=[];
  if(!b.loops.length||b.unsupported)out.push('HATCH con límites ausentes o spline no compatible; representación parcial.');
  if(b.approximate)out.push('Límites curvos de HATCH aproximados mediante segmentos.');
  if(Number(e.gradientFlag))out.push('Degradado HATCH aproximado; no se reproducen todos sus parámetros de impresión.');
  if(e.solidFill===0&&!(e.definitionLines as any[])?.length)out.push(`HATCH ${e.patternName??''}: faltan las líneas de definición; se muestran solo los límites.`);
  return out;
}
