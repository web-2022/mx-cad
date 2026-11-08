export type Box={min:number[];max:number[];row:number};
type Node={min:number[];max:number[];left?:Node;right?:Node;boxes?:Box[]};
export class BlockIndex{
 private root:Node;
 constructor(boxes:Box[]){this.root=this.build(boxes);}
 private build(boxes:Box[]):Node{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const b of boxes)for(let a=0;a<3;a++){min[a]=Math.min(min[a],b.min[a]);max[a]=Math.max(max[a],b.max[a]);}if(boxes.length<=12)return{min,max,boxes};const spans=max.map((v,a)=>v-min[a]),axis=spans.indexOf(Math.max(...spans));boxes.sort((a,b)=>a.min[axis]+a.max[axis]-b.min[axis]-b.max[axis]);const mid=boxes.length>>1;return{min,max,left:this.build(boxes.slice(0,mid)),right:this.build(boxes.slice(mid))};}
 hit(o:number[],d:number[],visible:(i:number)=>boolean,minDistance=0,maxDistance=Infinity){let best=maxDistance,row=-1;const near=(b:{min:number[];max:number[]})=>{let lo=minDistance,hi=best;for(let a=0;a<3;a++){if(Math.abs(d[a])<1e-15){if(o[a]<b.min[a]||o[a]>b.max[a])return Infinity;}else{let t0=(b.min[a]-o[a])/d[a],t1=(b.max[a]-o[a])/d[a];if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return Infinity;}}return lo;};const visit=(n:Node)=>{const t=near(n);if(!Number.isFinite(t)||t>best)return;if(n.boxes){for(const b of n.boxes)if(visible(b.row)){const t=near(b);if(t<best){best=t;row=b.row;}}}else{const a=n.left!,b=n.right!;if(near(a)<near(b)){visit(a);visit(b);}else{visit(b);visit(a);}}};visit(this.root);return row<0?undefined:{row,distance:best};}
}
