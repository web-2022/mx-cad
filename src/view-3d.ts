import type { Shape, Point } from './geometry';

export function projectPoint(p: Point, center: Point, yaw: number, pitch: number) {
  const x=p.x-center.x, y=p.y-center.y, z=(p.z??0)-(center.z??0);
  const horizontal=x*Math.cos(yaw)-y*Math.sin(yaw);
  const depth=x*Math.sin(yaw)+y*Math.cos(yaw);
  return {x:horizontal,y:depth*Math.sin(pitch)-z*Math.cos(pitch)};
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
  private observer: ResizeObserver;
  private drag?: {id:number;x:number;y:number;pan:boolean};
  private host: HTMLElement;
  constructor(host: HTMLElement) {
    this.host=host;
    this.canvas.setAttribute('aria-label','Vista 3D del plano. Arrastra para girar; Mayúsculas y arrastrar para desplazar; rueda para zoom.');
    this.canvas.tabIndex=0;
    this.canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';
    host.append(this.canvas);
    this.canvas.onpointerdown=e=>{if(this.drag)return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button!==0};this.canvas.setPointerCapture(e.pointerId);};
    this.canvas.onpointermove=e=>{
      const d=this.drag;if(!d||d.id!==e.pointerId)return;
      const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;
      if(d.pan){this.pan.x+=dx;this.pan.y+=dy;}else{this.yaw+=dx*.008;this.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,this.pitch+dy*.008));}
      this.draw();
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
  preset(view: string){this.yaw=view==='front'?0:-Math.PI/4;this.pitch=view==='top'?Math.PI/2:view==='front'?0:Math.PI/5;if(view==='top')this.yaw=0;this.fit();}
  fit(){
    let width=0,height=0;
    for(const s of this.shapes)for(const p of s.points){const q=projectPoint(p,this.center,this.yaw,this.pitch);width=Math.max(width,Math.abs(q.x)*2);height=Math.max(height,Math.abs(q.y)*2);}
    this.scale=Math.min(this.host.clientWidth/Math.max(width,1e-6),this.host.clientHeight/Math.max(height,1e-6))*.82;
    this.pan={x:0,y:0};this.draw();
  }
  zoom(factor: number){this.scale=Math.max(1e-12,Math.min(1e12,this.scale*factor));this.draw();}
  background(light: boolean){this.light=light;this.draw();}
  draw(){
    const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;
    const ratio=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(height*ratio);
    const ctx=this.canvas.getContext('2d');if(!ctx)return;ctx.scale(ratio,ratio);
    ctx.fillStyle=this.light?'#f4f5f7':'#111d31';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle=this.light?'#192844':'#e4ebf3';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;
    for(const s of this.shapes){ctx.beginPath();s.points.forEach((p,i)=>{const q=projectPoint(p,this.center,this.yaw,this.pitch);const x=width/2+this.pan.x+q.x*this.scale,y=height/2+this.pan.y-q.y*this.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);if(s.points.length===1)ctx.fillRect(x-2,y-2,4,4);});if(s.closed)ctx.closePath();ctx.stroke();}
    ctx.font='12px system-ui';ctx.fillText('3D · X / Y / Z · líneas y polilíneas',16,height-18);
  }
  destroy(){this.observer.disconnect();this.canvas.remove();}
}
