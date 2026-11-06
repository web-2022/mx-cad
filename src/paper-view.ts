import {shapesFromDocument,closest,distance,type Shape} from './geometry';
import {ShapeIndex} from './shape-index';
import { CadCanvasRenderer, createCadSceneDocument, computeCadDocumentBounds, type CadDocument, type CadShxGlyphResolver } from './vendor/cad/index';
import { viewportScene, type DrawingSheet } from './drawing-spaces';

export class PaperView {
  readonly canvas=document.createElement('canvas');
  private scratch=document.createElement('canvas');
  private renderer:CadCanvasRenderer;
  private observer:ResizeObserver;
  private doc?:CadDocument;
  private sheet?:DrawingSheet;
  private view={centerX:0,centerY:0,scale:1};
  private referenceScale=1;
  private drag?:{id:number;x:number;y:number};
  private rendering=false;
  private frame=0;
  private cache=new Map<string,{paper:CadDocument;views:Map<string,CadDocument>}>();
  private scratchSize='';
  private mode='pan';private selected?:Shape;private pickShapes:Shape[]=[];private pickIndex=new ShapeIndex([]);private clickStart?:{x:number;y:number};
  private host:HTMLElement;
  onView?:(percent:number)=>void;
  constructor(host:HTMLElement,resolver:CadShxGlyphResolver){
    this.host=host;this.canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none';this.canvas.setAttribute('aria-label','Presentación CAD. Arrastra para desplazar y usa la rueda para acercar.');host.append(this.canvas);
    this.scratch.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';document.body.append(this.scratch);
    this.renderer=new CadCanvasRenderer(this.scratch,{background:'#ffffff',transparentBackground:true,foreground:'#111111',contrastMode:'adaptive',showPageBounds:false,showUnsupportedMarkers:false,shxGlyphResolver:resolver});
    this.renderer.onStats=()=>{if(!this.rendering)this.queueDraw();};
    this.canvas.onpointerdown=e=>{this.clickStart={x:e.clientX,y:e.clientY};if(this.mode==='select'&&e.button===0)return;if(e.button!==0&&e.button!==1)return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);};
    this.canvas.onpointermove=e=>{const d=this.drag;if(!d||d.id!==e.pointerId)return;this.view.centerX-=(e.clientX-d.x)/this.view.scale;this.view.centerY+=(e.clientY-d.y)/this.view.scale;d.x=e.clientX;d.y=e.clientY;this.queueDraw();};
    this.canvas.onpointerup=e=>{if(this.mode==='select'&&this.clickStart&&Math.hypot(e.clientX-this.clickStart.x,e.clientY-this.clickStart.y)<4){const r=this.canvas.getBoundingClientRect(),p=this.paperPoint(e.clientX-r.left,e.clientY-r.top);let best=8/this.view.scale,hit:Shape|undefined;for(const s of this.pickIndex.query(p.x,p.y,best)){for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[(i+1)%s.points.length];if(!s.closed&&i===s.points.length-1&&s.points.length>1)continue;const d=distance(p,closest(p,a,b));if(d<best){best=d;hit=s;}}}this.selected=hit;this.host.parentElement?.dispatchEvent(new CustomEvent('mx:selectshape',{detail:hit}));this.draw();}this.clickStart=undefined;this.drag=undefined;};this.canvas.onpointercancel=this.canvas.onlostpointercapture=()=>{this.clickStart=undefined;this.drag=undefined;};
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002),true);},{passive:false});
    this.observer=new ResizeObserver(()=>this.queueDraw());this.observer.observe(host);
  }
  setSheet(doc:CadDocument,sheet:DrawingSheet,fit=true){if(doc!==this.doc){this.cache.clear();this.renderer.clear();}else if(!fit)this.cache.clear();this.doc=doc;this.sheet=sheet;const original=new Map(sheet.entities.map(e=>[e.handle,e]));this.pickShapes=shapesFromDocument({...doc,entities:sheet.entities.filter(e=>e.type!=='VIEWPORT').map(e=>({...e,isInPaperSpace:false}))}).map(s=>({...s,id:'paper-'+s.id,entity:original.get(s.entity?.handle)??s.entity}));this.pickIndex=new ShapeIndex(this.pickShapes);this.selected=undefined;if(fit)this.fit();else this.draw();}
  fit(){
    const s=this.sheet;if(!s||!this.doc)return;
    const bounds=s.width&&s.height?{minX:s.origin.x,minY:s.origin.y,maxX:s.origin.x+s.width,maxY:s.origin.y+s.height}:computeCadDocumentBounds({...this.doc,entities:s.entities.filter(e=>e.type!=='VIEWPORT'),savedView:undefined,pages:undefined});
    const valid=Number.isFinite(bounds.minX+bounds.minY+bounds.maxX+bounds.maxY);
    const b=valid?bounds:{minX:0,minY:0,maxX:1,maxY:1};
    this.view={centerX:(b.minX+b.maxX)/2,centerY:(b.minY+b.maxY)/2,scale:Math.min(this.host.clientWidth/Math.max(b.maxX-b.minX,1e-6),this.host.clientHeight/Math.max(b.maxY-b.minY,1e-6))*.88};
    this.referenceScale=this.view.scale;this.draw();
  }
  zoom(factor:number,deferred=false){this.view.scale=Math.max(1e-8,Math.min(1e8,this.view.scale*factor));if(deferred)this.queueDraw();else this.draw();}
  private queueDraw(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  private screen(p:{x:number;y:number}){return{x:this.host.clientWidth/2+(p.x-this.view.centerX)*this.view.scale,y:this.host.clientHeight/2-(p.y-this.view.centerY)*this.view.scale};}
  setInteractionMode(mode:string){this.mode=mode;}
  escape(){this.selected=undefined;this.drag=undefined;this.clickStart=undefined;this.draw();}
  paperPoint(x:number,y:number){return {x:this.view.centerX+(x-this.host.clientWidth/2)/this.view.scale,y:this.view.centerY-(y-this.host.clientHeight/2)/this.view.scale};}
  getState(){return {...this.view};}
  setState(view:{centerX:number;centerY:number;scale:number}){this.view={...view};this.draw();}
  zoomWindow(box:{x:number;y:number;width:number;height:number}){const w=this.host.clientWidth,h=this.host.clientHeight;this.view.centerX+=(box.x+box.width/2-w/2)/this.view.scale;this.view.centerY-=(box.y+box.height/2-h/2)/this.view.scale;this.view.scale*=Math.min(w/box.width,h/box.height);this.draw();}
  private prepared(){
    const doc=this.doc!,s=this.sheet!;let entry=this.cache.get(s.id);if(entry)return entry;
    const views=new Map<string,CadDocument>();
    entry={views,paper:{...doc,entities:s.entities.filter(e=>e.type!=='VIEWPORT'),pages:undefined,savedView:undefined,metadata:{...doc.metadata,sceneTransformApplied:true}}};
    if(this.cache.size>=2)this.cache.delete(this.cache.keys().next().value!);this.cache.set(s.id,entry);return entry;
  }
  draw(){
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}
    const doc=this.doc,s=this.sheet,width=this.host.clientWidth,height=this.host.clientHeight;if(!doc||!s||!width||!height)return;
    this.rendering=true;
    try{
      const dpr=Math.min(devicePixelRatio||1,2),cw=Math.round(width*dpr),ch=Math.round(height*dpr);if(this.canvas.width!==cw||this.canvas.height!==ch){this.canvas.width=cw;this.canvas.height=ch;}
      const ctx=this.canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=s.width&&s.height?'#626a77':'#ffffff';ctx.fillRect(0,0,width,height);
      if(this.scratchSize!==width+','+height){this.scratch.style.width=`${width}px`;this.scratch.style.height=`${height}px`;this.renderer.resize();this.scratchSize=width+','+height;}
      const prepared=this.prepared();
      const paperScale=this.view.scale/(s.units==='in'?25.4:1);
      this.renderer.setOptions({paperScale,background:'#ffffff',transparentBackground:true,foreground:'#111111'},false);
      ctx.save();
      if(s.width&&s.height){const p=this.screen({x:s.origin.x,y:s.origin.y+s.height});ctx.fillStyle='#fff';ctx.fillRect(p.x,p.y,s.width*this.view.scale,s.height*this.view.scale);ctx.beginPath();ctx.rect(p.x,p.y,s.width*this.view.scale,s.height*this.view.scale);ctx.clip();}
      for(const v of s.viewports){
        if(v.warning)continue;
        const source=s.entities.find(e=>String(e.handle??e.viewportId??'')===v.id),layer=doc.layers[source?.layer??'0'];
        if(source?.isVisible===false||layer?.isVisible===false||layer?.isFrozen)continue;
        const c=this.screen(v.center),w=v.width*this.view.scale,h=v.height*this.view.scale;
        if(!v.clip&&(c.x+w/2<0||c.x-w/2>width||c.y+h/2<0||c.y-h/2>height))continue;
        if(!prepared.views.has(v.id)){
          const layers=Object.fromEntries(Object.entries(doc.layers).map(([key,l])=>[key,{...l,isVisible:l.isVisible!==false&&!v.frozenLayers.includes(l.name)&&!v.frozenLayers.includes(String((l.raw as any)?.handle??'').toUpperCase())}]));
          const budget=Math.max(1,Math.min(12,Math.floor(100000/Math.max(1,doc.entities.length))));if(prepared.views.size>=budget)prepared.views.delete(prepared.views.keys().next().value!);
          prepared.views.set(v.id,createCadSceneDocument({...doc,entities:doc.entities,layers,pages:undefined,savedView:{source:'vport',twistAngle:0,sceneTransformApplied:true,sceneTransform:viewportScene(v)},metadata:{...doc.metadata,sceneTransformApplied:false}}));
        }
        ctx.save();ctx.beginPath();
        if(v.clip){v.clip.forEach((p,i)=>{const q=this.screen(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();}else ctx.rect(c.x-w/2,c.y-h/2,w,h);
        ctx.clip();
        this.renderer.setDocument(prepared.views.get(v.id)!,{centerX:v.viewCenter.x,centerY:v.viewCenter.y,scale:this.view.scale*v.height/v.viewHeight});
        ctx.drawImage(this.scratch,c.x-width/2,c.y-height/2,width,height);ctx.restore();
      }
      this.renderer.setDocument(prepared.paper,this.view);ctx.drawImage(this.scratch,0,0,width,height);ctx.restore();
      if(s.width&&s.height){const p=this.screen({x:s.origin.x,y:s.origin.y+s.height});ctx.strokeStyle='#252b36';ctx.lineWidth=1;ctx.strokeRect(p.x,p.y,s.width*this.view.scale,s.height*this.view.scale);}
      if(this.selected){ctx.strokeStyle='#e6a000';ctx.lineWidth=3;ctx.beginPath();this.selected.points.forEach((p,i)=>{const q=this.screen(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});if(this.selected.closed)ctx.closePath();ctx.stroke();}
      this.onView?.(Math.round(this.view.scale/this.referenceScale*100));
    }finally{this.rendering=false;}
  }
  destroy(){this.observer.disconnect();if(this.frame)cancelAnimationFrame(this.frame);this.renderer.destroy();this.scratch.remove();this.canvas.remove();}
}
