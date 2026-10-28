import type { CadBounds, CadDocument, CadPoint2D } from '@flyfish-dev/cad-viewer';
import type { Shape } from './geometry';

export interface DrawingRegion extends CadBounds { count: number }
const union = (items: CadBounds[]): CadBounds => items.reduce((b,p)=>({minX:Math.min(b.minX,p.minX),minY:Math.min(b.minY,p.minY),maxX:Math.max(b.maxX,p.maxX),maxY:Math.max(b.maxY,p.maxY)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
function bounds(s: Shape): CadBounds {return union(s.points.map(p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y})));}

// Do not let a remote annotation, survey grid or another drawing shrink the
// active drawing into a dot. Partition only at large empty spatial gaps.
export function drawingRegions(shapes: Shape[]): DrawingRegion[] {
  const entries=shapes.map(s=>bounds(s)).filter(b=>Number.isFinite(b.minX+b.maxX+b.minY+b.maxY));
  const sizes=entries.map(b=>Math.hypot(b.maxX-b.minX,b.maxY-b.minY)).filter(v=>v>0).sort((a,b)=>a-b);
  const typical=sizes[Math.floor(sizes.length/2)]??1;
  function split(items:CadBounds[],depth=0):DrawingRegion[]{
    let cut:{sorted:CadBounds[];index:number;gap:number}|undefined;
    if(items.length>=8&&depth<8)for(const axis of ['X','Y'] as const){
      const center=(b:CadBounds)=>axis==='X'?(b.minX+b.maxX)/2:(b.minY+b.maxY)/2;
      const sorted=[...items].sort((a,b)=>center(a)-center(b)),span=center(sorted.at(-1)!)-center(sorted[0]);
      for(let i=1;i<sorted.length;i++){
        const gap=center(sorted[i])-center(sorted[i-1]);
        if(gap>span*.25&&gap>typical*8&&(!cut||gap>cut.gap))cut={sorted,index:i,gap};
      }
    }
    return cut?[...split(cut.sorted.slice(0,cut.index),depth+1),...split(cut.sorted.slice(cut.index),depth+1)]:[{...union(items),count:items.length}];
  }
  return entries.length?split(entries).sort((a,b)=>b.count-a.count):[];
}

export function savedViewAnchor(doc:CadDocument):CadPoint2D|undefined {
  const view=doc.savedView;
  if(!view?.center||!Number.isFinite(view.center.x+view.center.y))return;
  const target=view.target??{x:0,y:0},m=view.sceneTransform;
  // VPORT center is DCS relative to TARGET, not a world-space location.
  // Convert the target to the renderer's normalized scene, retaining the
  // DCS center offset. Geometry and inspection coordinates stay untouched.
  if(view.sceneTransformApplied&&m)return {x:view.center.x+m.a*target.x+m.c*target.y+m.e,y:view.center.y+m.b*target.x+m.d*target.y+m.f};
  return view.center;
}
export function preferredRegion(doc:CadDocument,regions:DrawingRegion[]):number {
  const anchor=savedViewAnchor(doc);if(!anchor)return 0;
  let best=0,score=Infinity;
  regions.forEach((r,i)=>{
    if(r.count<3&&regions[0]?.count>=8)return;
    const d=Math.hypot(Math.max(r.minX-anchor.x,0,anchor.x-r.maxX),Math.max(r.minY-anchor.y,0,anchor.y-r.maxY));
    if(d<score){score=d;best=i;}
  });return best;
}
