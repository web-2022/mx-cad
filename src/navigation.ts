import {NavigationHistory} from './navigation-history';
export interface NavigationAdapter {
  key:string;revision:number;context:'model'|'paper'|'wire'|'bim';enabled:boolean;canvas:HTMLCanvasElement;
  state():unknown;restore(state:any):void;zoom(factor:number):void;fit():void;window(box:{x:number;y:number;width:number;height:number}):void;
  mode?():string;setMode(mode:'select'|'pan'|'orbit'):void;preset?(view:string):void;
}
export class Navigation {
  private history=new NavigationHistory();private key='';private revision=-1;private mode='select';private box=false;private view='';
  private rect=document.createElement('div');private start?:{x:number;y:number;surface:DOMRect};private gesture?:{key:string;state:unknown};
  private wheel?:{key:string;state:unknown};private timer=0;private dock:HTMLElement;private viewport:HTMLElement;
  constructor(private adapter:()=>NavigationAdapter){
    this.viewport=document.getElementById('viewport')!;this.dock=document.querySelector('.cad-dock')!;this.dock.setAttribute('aria-label','Navegación y herramientas del visor');this.rect.className='nav-window';this.rect.hidden=true;this.viewport.append(this.rect);
    const group=document.createElement('div');group.className='nav-tools';group.innerHTML='<span class="dock-heading">VISTA</span>';
    for(const id of ['tool-select','tool-pan'])group.append(document.getElementById(id)!);
    document.getElementById('tool-pan')!.innerHTML='<span>✥</span>Pan';
    for(const [id,icon,label,title]of [['orbit','⟳','Orbitar','Girar el modelo 3D'],['plus','＋','Acercar','Acercar'],['minus','−','Alejar','Alejar'],['fit','⛶','Ajustar','Ajustar al dibujo o a la hoja (F)'],['window','▣','Ventana','Zoom por ventana: arrastra un rectángulo'],['previous','↩','Anterior','Restaurar el encuadre anterior'],['top','⬒','Superior','Vista superior'],['front','▤','Frontal','Vista frontal 3D'],['side','◧','Lateral','Vista lateral 3D'],['iso','◇','Isométrica','Vista isométrica 3D']]){
      const button=document.createElement('button');button.id='nav-'+id;button.className='dock-button';button.title=title;button.setAttribute('aria-label',title);button.innerHTML=`<span>${icon}</span>${label}`;if(['orbit','window'].includes(id))button.setAttribute('aria-pressed','false');button.onclick=()=>this.command(id);group.append(button);
    }
    for(const child of [...this.dock.children])child.classList.add('cad-edit-command');this.dock.prepend(group);
    document.getElementById('tool-select')!.onclick=()=>this.command('select');document.getElementById('tool-pan')!.onclick=()=>this.command('pan');
    this.viewport.addEventListener('mx:cadmode',()=>this.refresh());
    const parent=this.viewport.parentElement!;
    parent.addEventListener('pointerdown',e=>{
      const a=this.adapter();if(!a.enabled||e.target!==a.canvas)return;
      if(this.box&&e.button===0){e.preventDefault();e.stopImmediatePropagation();const surface=a.canvas.getBoundingClientRect();this.start={x:e.clientX,y:e.clientY,surface};this.viewport.setPointerCapture(e.pointerId);this.rect.hidden=false;this.drawBox(e.clientX,e.clientY);return;}
      this.gesture={key:a.key,state:a.state()};
    },true);
    parent.addEventListener('pointermove',e=>{if(!this.start)return;e.preventDefault();e.stopImmediatePropagation();this.drawBox(e.clientX,e.clientY);},true);
    const end=(e:PointerEvent)=>{
      const a=this.adapter();if(this.start){e.preventDefault();e.stopImmediatePropagation();const start=this.start;this.start=undefined;this.rect.hidden=true;if(this.viewport.hasPointerCapture(e.pointerId))this.viewport.releasePointerCapture(e.pointerId);
        const r=start.surface,x=Math.max(0,Math.min(r.width,start.x-r.left)),y=Math.max(0,Math.min(r.height,start.y-r.top)),x1=Math.max(0,Math.min(r.width,e.clientX-r.left)),y1=Math.max(0,Math.min(r.height,e.clientY-r.top));
        if(e.type!=='pointercancel'&&Math.abs(x1-x)>5&&Math.abs(y1-y)>5)this.change(()=>a.window({x:Math.min(x,x1),y:Math.min(y,y1),width:Math.abs(x1-x),height:Math.abs(y1-y)}));this.box=false;this.refresh();return;}
      if(this.gesture){if(this.gesture.key===a.key&&JSON.stringify(this.gesture.state)!==JSON.stringify(a.state()))this.history.push(a.key,this.gesture.state);this.gesture=undefined;if(this.mode==='orbit')this.view='';this.refresh();}
    };
    parent.addEventListener('pointerup',end,true);parent.addEventListener('pointercancel',end,true);
    parent.addEventListener('wheel',e=>{const a=this.adapter();if(!a.enabled||e.target!==a.canvas)return;if(!this.wheel)this.wheel={key:a.key,state:a.state()};clearTimeout(this.timer);this.timer=window.setTimeout(()=>this.flushWheel(),180);},true);
    window.addEventListener('keydown',e=>{if(e.key==='Escape'){this.box=false;this.start=undefined;this.rect.hidden=true;this.refresh();}});
    this.refresh();
  }
  private flushWheel(){if(this.wheel){const a=this.adapter();if(a.key===this.wheel.key&&JSON.stringify(a.state())!==JSON.stringify(this.wheel.state))this.history.push(a.key,this.wheel.state);this.wheel=undefined;this.refresh();}}
  private drawBox(x:number,y:number){const s=this.start!,v=this.viewport.getBoundingClientRect(),r=s.surface,x1=Math.max(r.left,Math.min(r.right,x)),y1=Math.max(r.top,Math.min(r.bottom,y));this.rect.style.left=Math.min(s.x,x1)-v.left+'px';this.rect.style.top=Math.min(s.y,y1)-v.top+'px';this.rect.style.width=Math.abs(x1-s.x)+'px';this.rect.style.height=Math.abs(y1-s.y)+'px';}
  change(action:()=>void){this.flushWheel();const a=this.adapter(),before=a.state();action();if(JSON.stringify(before)!==JSON.stringify(a.state()))this.history.push(a.key,before);this.refresh();}
  private command(id:string){const a=this.adapter();if(!a.enabled)return;this.flushWheel();
    if(['select','pan','orbit'].includes(id)){this.box=false;this.mode=id;a.setMode(id as 'select'|'pan'|'orbit');}
    else if(id==='window')this.box=!this.box;
    else if(id==='previous'){const state=this.history.pop(a.key);if(state!==undefined)a.restore(state);this.view='';}
    else {if(['top','front','side','iso'].includes(id))this.view=id;this.change(()=>{if(id==='plus')a.zoom(1.2);else if(id==='minus')a.zoom(1/1.2);else if(id==='fit')a.fit();else if(a.preset)a.preset(id);else a.fit();});}this.refresh();
  }
  refresh(){const a=this.adapter();if(this.revision!==a.revision){this.history.clear();this.revision=a.revision;this.wheel=undefined;}
    if(this.key!==a.key){this.key=a.key;this.box=false;this.view=['wire','bim'].includes(a.context)?'':'top';this.rect.hidden=true;this.mode=a.context==='paper'?'pan':['wire','bim'].includes(a.context)?'orbit':'select';if(a.enabled)a.setMode(this.mode as 'select'|'pan'|'orbit');}
    this.dock.hidden=false;this.dock.dataset.context=a.context;if(a.context!=='model')this.viewport.classList.remove('drawing-mode');
    const is3D=a.context==='wire'||a.context==='bim',mode=a.mode?.()??this.mode;
    for(const id of ['tool-select','tool-pan','nav-orbit','nav-plus','nav-minus','nav-fit','nav-window','nav-previous','nav-top','nav-front','nav-side','nav-iso']){
      const b=document.getElementById(id) as HTMLButtonElement;b.disabled=!a.enabled||(id==='tool-select'&&(a.context==='paper'||a.context==='wire'))||(id==='nav-orbit'&&!is3D)||(['nav-front','nav-side','nav-iso'].includes(id)&&!is3D)||(id==='nav-previous'&&!this.history.has(a.key));
      if(['nav-top','nav-front','nav-side','nav-iso'].includes(id))b.setAttribute('aria-pressed',String(id==='nav-'+this.view));
      if(id==='tool-select')b.setAttribute('aria-pressed',String(mode==='select'&&!this.box));if(id==='tool-pan')b.setAttribute('aria-pressed',String(mode==='pan'&&!this.box));if(id==='nav-orbit')b.setAttribute('aria-pressed',String(mode==='orbit'&&!this.box));if(id==='nav-window')b.setAttribute('aria-pressed',String(this.box));
    }
    this.viewport.classList.toggle('nav-window-active',this.box);
  }
}
