import type { CadDocument, CadEntity, CadPoint3D } from '@flyfish-dev/cad-viewer';
export type Point = CadPoint3D;
export interface Shape { id: string; type: string; layer: string; points: Point[]; nodes: Point[]; closed: boolean; origin: 'Plano' | 'Sesión'; approximate?: boolean }
export const distance = (a: Point, b: Point) => Math.hypot(b.x-a.x,b.y-a.y);
export function closest(p: Point, a: Point, b: Point): Point {
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)) : 0;
  return {x:a.x+t*dx,y:a.y+t*dy,z:(a.z??0)+t*((b.z??0)-(a.z??0))};
}
export function segments(s: Shape): [Point,Point][] { return s.points.slice(1).map((p,i)=>[s.points[i],p] as [Point,Point]).concat(s.closed&&s.points.length>2?[[s.points.at(-1)!,s.points[0]]]:[]); }
export function metrics(s: Shape) {
  const edges=segments(s),length=edges.reduce((v,[a,b])=>v+distance(a,b),0);
  const length3d=edges.reduce((v,[a,b])=>v+Math.hypot(b.x-a.x,b.y-a.y,(b.z??0)-(a.z??0)),0);
  // Translate first to retain precision at large survey coordinates.
  const o=s.points[0]??{x:0,y:0};
  const area=s.closed?Math.abs(edges.reduce((v,[a,b])=>v+(a.x-o.x)*(b.y-o.y)-(b.x-o.x)*(a.y-o.y),0))/2:undefined;
  return {length,length3d,area};
}
export function contains(p: Point,s: Shape) { let inside=false; for(const [a,b] of segments(s))if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;return inside; }
export function validPolygon(p: Point[]) {
  if(p.length<3||new Set(p.map(v=>`${v.x},${v.y}`)).size!==p.length)return false;
  const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const on=(a:Point,b:Point,c:Point)=>Math.abs(cross(a,b,c))<1e-10&&c.x>=Math.min(a.x,b.x)&&c.x<=Math.max(a.x,b.x)&&c.y>=Math.min(a.y,b.y)&&c.y<=Math.max(a.y,b.y);
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
    if(j===i+1||(i===0&&j===p.length-1))continue;
    const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
    if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false;
  }
  return metrics({id:'',type:'',layer:'',points:p,nodes:p,closed:true,origin:'Sesión'}).area!>1e-12;
}

export function shapesFromDocument(doc: CadDocument): Shape[] {
  const out:Shape[]=[];
  function walk(entities:CadEntity[], transform:(p:Point)=>Point, depth=0, inherited='0') {
    if(depth>12)return;
    for(const e of entities){
      const layer=e.layer&&e.layer!=='0'?e.layer:inherited;
      const l=doc.layers[layer]??Object.values(doc.layers).find(l=>l.name===layer);
      if(e.isVisible===false||e.isInPaperSpace||l?.isVisible===false||l?.isFrozen)continue;
      if(e.type==='INSERT'){
        const block=doc.blocks[e.blockName??e.name??'']; if(!block)continue;
        const base=block.basePoint??{x:0,y:0},pos=e.insertionPoint??{x:0,y:0},r=e.rotation??0,c=Math.cos(r),s=Math.sin(r);
        walk(block.entities,p=>{const x=(p.x-base.x)*(e.scale?.x??1),y=(p.y-base.y)*(e.scale?.y??1);return transform({x:pos.x+x*c-y*s,y:pos.y+x*s+y*c,z:(pos.z??0)+((p.z??0)-(base.z??0))*(e.scale?.z??1)});},depth+1,layer);continue;
      }
      let points:Point[]=[],nodes:Point[]=[],closed=!!e.isClosed,approximate=false;
      if(e.type==='LINE'&&e.startPoint&&e.endPoint)points=[e.startPoint,e.endPoint];
      else if(e.type==='POINT') { const p=e.insertionPoint??e.position as Point|undefined??e.startPoint??e.vertices?.[0];if(p)points=[p]; }
      else if(['LWPOLYLINE','POLYLINE','POLYLINE_2D','POLYLINE_3D'].includes(e.type)||e.kind==='polyline'){
        const vertices=e.vertices??e.points??[];nodes=vertices;
        closed=closed||!!((e.flag??0)&1);
        for(let i=0;i<vertices.length;i++){
          const a=vertices[i],b=vertices[(i+1)%vertices.length],bulge=(a as Point & {bulge?:number}).bulge??0;
          points.push(a);
          if(!bulge||(!closed&&i===vertices.length-1))continue;
          const chord=distance(a,b);if(!chord)continue;
          const theta=4*Math.atan(bulge),cx=(a.x+b.x)/2-(b.y-a.y)*(1-bulge*bulge)/(4*bulge),cy=(a.y+b.y)/2+(b.x-a.x)*(1-bulge*bulge)/(4*bulge),radius=Math.hypot(a.x-cx,a.y-cy),start=Math.atan2(a.y-cy,a.x-cx);
          const steps=Math.max(8,Math.ceil(Math.abs(theta)*64));
          for(let j=1;j<steps;j++){const t=j/steps;points.push({x:cx+radius*Math.cos(start+theta*t),y:cy+radius*Math.sin(start+theta*t),z:(a.z??0)+t*((b.z??0)-(a.z??0))});}approximate=true;
        }
      } else if((e.type==='CIRCLE'||e.type==='ARC')&&e.center&&e.radius){
        closed=e.type==='CIRCLE';const start=closed?0:e.startAngle??0;let sweep=closed?Math.PI*2:(e.endAngle??0)-start;while(sweep<=0)sweep+=Math.PI*2;
        const steps=Math.max(16,Math.ceil(sweep*64));
        for(let i=0;i<=steps;i++)points.push({x:e.center.x+e.radius*Math.cos(start+sweep*i/steps),y:e.center.y+e.radius*Math.sin(start+sweep*i/steps),z:e.center.z??0});
        nodes=closed?[e.center]:[points[0],points.at(-1)!,e.center];approximate=true;
      }
      if(!points.length||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
      if(!nodes.length)nodes=points;
      out.push({id:`file-${out.length}`,type:e.type,layer,points:points.map(transform),nodes:nodes.map(transform),closed,origin:'Plano',approximate});
    }
  }
  walk(doc.entities,p=>({...p}));return out;
}
