import type {Shape} from './geometry';
export class ShapeIndex {
  private cells=new Map<string,Shape[]>();private wide:Shape[]=[];private step=1;
  constructor(shapes:Shape[]){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const s of shapes)for(const p of s.points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
    this.step=Math.max(maxX-minX,maxY-minY,1)/Math.min(128,Math.max(1,Math.sqrt(shapes.length)));
    for(const s of shapes){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of s.points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
      const a=Math.floor(x0/this.step),b=Math.floor(y0/this.step),c=Math.floor(x1/this.step),d=Math.floor(y1/this.step);
      if(!Number.isFinite(a+b+c+d)||(c-a+1)*(d-b+1)>64){this.wide.push(s);continue;}
      for(let x=a;x<=c;x++)for(let y=b;y<=d;y++){const key=x+','+y,list=this.cells.get(key)??[];list.push(s);this.cells.set(key,list);}
    }
  }
  query(x:number,y:number,r:number){
    const a=Math.floor((x-r)/this.step),b=Math.floor((y-r)/this.step),c=Math.floor((x+r)/this.step),d=Math.floor((y+r)/this.step);
    if((c-a+1)*(d-b+1)>1024)return [...new Set([...this.wide,...[...this.cells.values()].flat()])];
    const found=new Set(this.wide);for(let i=a;i<=c;i++)for(let j=b;j<=d;j++)for(const s of this.cells.get(i+','+j)??[])found.add(s);return [...found];
  }
}
