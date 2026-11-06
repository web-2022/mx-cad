import type { Shape, Point } from './geometry';

export function projectPoint(p: Point, center: Point, yaw: number, pitch: number) {
  const x=p.x-center.x, y=p.y-center.y, z=(p.z??0)-(center.z??0);
  const horizontal=x*Math.cos(yaw)-y*Math.sin(yaw);
  const depth=x*Math.sin(yaw)+y*Math.cos(yaw);
  return {x:horizontal,y:depth*Math.sin(pitch)+z*Math.cos(pitch)};
}

// Orthographic wireframe: preserve model coordinates without uploading files.
export class View3D {
  readonly canvas=document.createElement('canvas');
  private shapes: Shape[]=[];
  private center: Point={x:0,y:0,z:0};
  private yaw=-Math.PI/4;
  private pitch=Math.PI/5;
  private scale=1;
  private pan={x:0,y:0};
  private light=false;
  private mode:'pan'|'orbit'='orbit';
  private frame=0;
  private observer: ResizeObserver;
  private drag?: {id:number;x:number;y:number;pan:boolean};
  private host: HTMLElement;
  constructor(host: HTMLElement) {
    this.host=host;
    this.canvas.setAttribute('aria-label','Vista 3D del plano. Arrastra para girar; Mayúsculas y arrastrar para desplazar; rueda para zoom.');
    this.canvas.tabIndex=0;
    this.canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';
    host.append(this.canvas);
    this.canvas.onpointerdown=e=>{if(this.drag)return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:this.mode==='pan'||e.shiftKey||e.button!==0};this.canvas.setPointerCapture(e.pointerId);};
    this.canvas.onpointermove=e=>{
      const d=this.drag;if(!d||d.id!==e.pointerId)return;
      const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;
      if(d.pan){this.pan.x+=dx;this.pan.y+=dy;}else{this.yaw+=dx*.008;this.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,this.pitch+dy*.008));}
      this.queueDraw();
    };
    this.canvas.onpointerup=this.canvas.onpointercancel=this.canvas.onlostpointercapture=()=>{this.drag=undefined;};
    this.canvas.oncontextmenu=e=>e.preventDefault();
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002));},{passive:false});
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(host);
  }
  setShapes(shapes: Shape[],fit=true) {
    this.shapes=shapes.map(s=>({...s,points:s.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z??0))})).filter(s=>s.points.length);
    if(fit){
      let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
      for(const s of this.shapes)for(const p of s.points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);minZ=Math.min(minZ,p.z??0);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);maxZ=Math.max(maxZ,p.z??0);}
      this.center=this.shapes.length?{x:minX+(maxX-minX)/2,y:minY+(maxY-minY)/2,z:minZ+(maxZ-minZ)/2}:{x:0,y:0,z:0};
      this.fit();
    }else this.draw();
    return this.shapes.length;
  }
  preset(view: string){this.yaw=view==='front'?0:view==='side'?Math.PI/2:-Math.PI/4;this.pitch=view==='top'?Math.PI/2:['front','side'].includes(view)?0:Math.PI/5;if(view==='top')this.yaw=0;this.fit();}
  getState(){return {yaw:this.yaw,pitch:this.pitch,scale:this.scale,pan:{...this.pan}};}
  setState(s:{yaw:number;pitch:number;scale:number;pan:{x:number;y:number}}){this.yaw=s.yaw;this.pitch=s.pitch;this.scale=s.scale;this.pan={...s.pan};this.draw();}
  setInteractionMode(mode:'select'|'pan'|'orbit'){this.mode=mode==='pan'?'pan':'orbit';}
  zoomWindow(b:{x:number;y:number;width:number;height:number}){const f=Math.min(this.host.clientWidth/b.width,this.host.clientHeight/b.height);this.pan={x:(this.pan.x-(b.x+b.width/2-this.host.clientWidth/2))*f,y:(this.pan.y-(b.y+b.height/2-this.host.clientHeight/2))*f};this.scale*=f;this.draw();}
  private queueDraw(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  fit(){
    let width=0,height=0;
    for(const s of this.shapes)for(const p of s.points){const q=projectPoint(p,this.center,this.yaw,this.pitch);width=Math.max(width,Math.abs(q.x)*2);height=Math.max(height,Math.abs(q.y)*2);}
    this.scale=Math.min(this.host.clientWidth/Math.max(width,1e-6),this.host.clientHeight/Math.max(height,1e-6))*.82;
    this.pan={x:0,y:0};this.draw();
  }
  zoom(factor: number){this.scale=Math.max(1e-12,Math.min(1e12,this.scale*factor));this.draw();}
  background(light: boolean){this.light=light;this.draw();}
  cursorPoint(clientX:number,clientY:number){
    const r=this.canvas.getBoundingClientRect(),p={x:clientX-r.left,y:clientY-r.top};let best=8,result:Point|undefined;
    const screen=(v:Point)=>{const q=projectPoint(v,this.center,this.yaw,this.pitch);return {x:this.host.clientWidth/2+this.pan.x+q.x*this.scale,y:this.host.clientHeight/2+this.pan.y-q.y*this.scale};};
    for(const shape of this.shapes){const points=shape.closed?[...shape.points,shape.points[0]]:shape.points;
      for(let i=0;i<points.length;i++){const a=points[i],b=points[Math.min(i+1,points.length-1)],u=screen(a),v=screen(b),dx=v.x-u.x,dy=v.y-u.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p.x-u.x)*dx+(p.y-u.y)*dy)/den)):0,d=Math.hypot(p.x-u.x-t*dx,p.y-u.y-t*dy);if(d<best){best=d;result={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y),z:(a.z??0)+t*((b.z??0)-(a.z??0))};}}
    }return result;
  }
  draw(){
    const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}
    const ratio=Math.min(devicePixelRatio||1,2),cw=Math.round(width*ratio),ch=Math.round(height*ratio);if(this.canvas.width!==cw||this.canvas.height!==ch){this.canvas.width=cw;this.canvas.height=ch;}
    const ctx=this.canvas.getContext('2d');if(!ctx)return;ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.fillStyle=this.light?'#f4f5f7':'#111d31';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle=this.light?'#192844':'#e4ebf3';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;
    for(const s of this.shapes){ctx.beginPath();s.points.forEach((p,i)=>{const q=projectPoint(p,this.center,this.yaw,this.pitch);const x=width/2+this.pan.x+q.x*this.scale,y=height/2+this.pan.y-q.y*this.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);if(s.points.length===1)ctx.fillRect(x-2,y-2,4,4);});if(s.closed)ctx.closePath();ctx.stroke();}
    const axes={x:projectPoint({x:1,y:0,z:0},{x:0,y:0,z:0},this.yaw,this.pitch),y:projectPoint({x:0,y:1,z:0},{x:0,y:0,z:0},this.yaw,this.pitch),z:projectPoint({x:0,y:0,z:1},{x:0,y:0,z:0},this.yaw,this.pitch)};this.host.parentElement?.dispatchEvent(new CustomEvent('mx:axes',{detail:axes}));
  }
  destroy(){if(this.frame)cancelAnimationFrame(this.frame);this.observer.disconnect();this.canvas.remove();}
}

