import {drawingPoint} from './coordinate-space';
import {EntityEdits} from './entity-edits';
import {angle,lineAngle} from './measurements';
import {ShapeIndex} from './shape-index';
import type { CadViewer } from './vendor/cad/index';
import { colorFromAci } from './vendor/cad/index';
import { closest, contains, distance, metrics, segments, shapesFromDocument, validPolygon, type Point, type Shape } from './geometry';

type Mode='select'|'pan'|'measure'|'angle'|'angle-lines'|'line'|'polygon';
const instructions:Record<Mode,string>={angle:'Ángulo XY: marca extremo, vértice y extremo. Esc limpia.', 'angle-lines':'Ángulo XY: selecciona dos líneas. Esc limpia.',select:'Haz clic en una línea, punto o polígono para ver sus propiedades. Arrastra para desplazar.',pan:'Arrastra para desplazar el plano. Usa la rueda para hacer zoom.',measure:'Marca dos puntos para medir. Esc cancela.',line:'Marca el inicio y el final de la línea. Esc cancela.',polygon:'Marca los vértices. Enter o clic en el primer vértice cierra. Esc cancela.'};
const ns='http://www.w3.org/2000/svg';
interface LayerOptions { activeLayer(): string; visible(name: string): boolean; color(name: string): string; layers(): { name: string; color: string; isVisible: boolean }[]; created(name: string): void }
export class CadTools {
  readonly edits=new EntityEdits();
  private worldShapes=new Map<string,Shape>();
  private spatial(){return (document.getElementById('measure-space') as HTMLSelectElement)?.value==='3d';}
  private angleFirst?:Shape; private angleLabels:{p:Point;label:string}[]=[];
  private index=new ShapeIndex([]);
  private edgeCache=new WeakMap<Shape,ReturnType<typeof segments>>();
  private mode:Mode='select'; private snapPoint=true; private snapLine=false;
  private shapes:Shape[]=[]; private drawings:Shape[]=[]; private pending:Point[]=[];
  private selected?:Shape; private cursor?:Point; private snapped?:Point;
  private down?:{x:number;y:number}; private frame=0; private serial=0;
  private svg:SVGSVGElement; private viewport:HTMLElement; private info:HTMLElement;
  constructor(private viewer:CadViewer, private layerOptions: LayerOptions) {
    this.viewport=document.getElementById('viewport')!;
    this.svg=document.createElementNS(ns,'svg');this.svg.classList.add('cad-overlay');this.svg.setAttribute('aria-hidden','true');this.viewport.append(this.svg);
    const dock=document.createElement('nav');dock.className='cad-dock panel';dock.setAttribute('aria-label','Herramientas CAD');
    dock.innerHTML=`<span class="dock-heading">CAD</span>${([['select','↖','Seleccionar'],['pan','✥','Mover'],['measure','↔','Medir'],['angle','∠','Ángulo 3 puntos'],['angle-lines','∡','Ángulo 2 líneas'],['line','╱','Línea'],['polygon','⬠','Polígono']] as const).map(([id,icon,label])=>`<button id="tool-${id}" class="dock-button" aria-pressed="${id==='select'}" title="${label}"><span>${icon}</span>${label}</button>`).join('')}<span class="dock-heading">SNAP</span><button id="snap-point" class="dock-button" aria-pressed="true" title="Ajustar a puntos, vértices y centros"><span>⊡</span>Punto</button><button id="snap-line" class="dock-button" aria-pressed="false" title="Ajustar al punto más cercano de una línea"><span>⊥</span>A línea</button><span class="dock-heading">TRAZOS</span><button id="finish-polygon" class="dock-button" title="Cerrar polígono (Enter)"><span>✓</span>Cerrar</button><button id="undo-drawing" class="dock-button" title="Deshacer vértice o último trazo"><span>↶</span>Deshacer</button><button id="save-drawings" class="dock-button" title="Descargar solo los trazos nuevos de sesión en DXF"><span>↓</span>DXF</button>`;
    document.querySelector('.body')!.append(dock);
    const selection=document.createElement('section');selection.className='selection-properties';
    selection.innerHTML='<div class="property-heading">OBJETO SELECCIONADO</div><div id="selection-info"><p class="small-note">Selecciona una entidad en el visor.</p></div>';
    document.querySelector('.properties .panel-content')!.prepend(selection);this.info=selection.querySelector('#selection-info')!;
    const hint=document.createElement('div');hint.className='cad-command';hint.id='cad-command';hint.setAttribute('role','status');this.viewport.append(hint);
    for(const mode of ['select','pan','measure','angle','angle-lines','line','polygon'] as Mode[])document.getElementById(`tool-${mode}`)!.onclick=()=>this.setMode(mode);
    document.getElementById('snap-point')!.onclick=()=>{this.snapPoint=!this.snapPoint;this.sync();};
    document.getElementById('snap-line')!.onclick=()=>{this.snapLine=!this.snapLine;this.sync();};
    document.getElementById('finish-polygon')!.onclick=()=>this.finish();
    document.getElementById('undo-drawing')!.onclick=()=>{if(this.pending.length)this.pending.pop();else{const removed=this.drawings.pop();if(removed===this.selected)this.select();}this.redraw();this.sync();};
    const actions=document.createElement('div');actions.innerHTML='<button id="undo-property" title="Deshacer cambio de color">↶ Color</button><button id="redo-property" title="Rehacer cambio de color">↷ Color</button>';selection.append(actions);const measureSpace=document.createElement('select');measureSpace.id='measure-space';measureSpace.setAttribute('aria-label','Espacio de medición de ángulos');measureSpace.innerHTML='<option value="xy">Ángulos XY</option><option value="3d">Ángulos espaciales (puntos capturados)</option>';selection.append(measureSpace);
    document.getElementById('undo-property')!.onclick=()=>{if(this.edits.undo())this.changed();};document.getElementById('redo-property')!.onclick=()=>{if(this.edits.redo())this.changed();};
    document.getElementById('save-drawings')!.onclick=()=>this.download();
    this.viewport.addEventListener('pointerdown',e=>{
      if(this.viewport.dataset.view3d==='true')return;
      if(!(e.target instanceof HTMLCanvasElement))return;
      if(e.button!==0)return;
      this.down={x:e.clientX,y:e.clientY};
      if(e.button===0&&this.mode!=='pan'&&this.mode!=='select'){e.preventDefault();e.stopImmediatePropagation();}
    },true);
    this.viewport.addEventListener('pointerup',e=>{
      if(this.viewport.dataset.view3d==='true')return;
      if(e.button!==0||!this.down||Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>4)return;
      if(!(e.target instanceof HTMLCanvasElement))return;
      this.down=undefined;this.click(this.pointer(e));
    },true);
    this.viewport.addEventListener('pointermove',e=>{
      if(this.viewport.dataset.view3d==='true')return;
      if(this.mode==='select'||this.mode==='pan'||this.frame)return;
      const raw=this.pointer(e);
      this.frame=requestAnimationFrame(()=>{this.frame=0;this.cursor=this.snap(raw);this.redraw();});
    });
    this.viewport.addEventListener('pointerleave',()=>{this.snapped=undefined;this.cursor=undefined;this.redraw();});
    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){this.escape();return;}
      if(this.viewport.dataset.view3d==='true')return;
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
      if(e.key==='Escape')this.escape();
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey?this.edits.redo():this.edits.undo())this.changed();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();if(this.edits.redo())this.changed();}
      if(e.key==='Enter'&&this.mode==='polygon'){e.preventDefault();this.finish();}
      if(e.key==='Backspace'&&this.pending.length){e.preventDefault();this.pending.pop();this.redraw();}
    });
    new ResizeObserver(()=>this.redraw()).observe(this.viewport);
    this.sync();
  }
  escape(){this.down=undefined;if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}this.pending=[];this.angleFirst=undefined;this.angleLabels=[];this.drawings=this.drawings.filter(s=>s.type!=='MEDICION');this.select();this.setMode('select');document.getElementById('cad-command')!.textContent='';}
  sessionDrawings(){return this.drawings.filter(s=>s.type!=='MEDICION').map(s=>({...s,points:s.points.map(p=>drawingPoint(p,this.viewer.renderer.getSourceDocument()))}));}
  private changed(){const doc=this.viewer.renderer.getSourceDocument(),state=this.viewer.renderer.getViewState(),previous=this.selected,entity=this.selected?.entity;if(doc){this.viewer.renderer.setDocument(doc);this.viewer.renderer.setViewState(state);}this.refresh();if(entity)this.select(this.viewport.dataset.view3d==='true'?previous:this.shapes.find(s=>s.entity===entity)??previous);this.viewport.dispatchEvent(new CustomEvent('mx:entityedit'));}
  reset(){this.edits.reset();this.angleLabels=[];this.drawings=[];this.pending=[];this.selected=undefined;this.cursor=undefined;this.snapped=undefined;this.setMode('select');this.refresh();this.select();}
  refresh(){const doc=this.viewer.getDocument(),source=this.viewer.renderer.getSourceDocument();this.shapes=doc?shapesFromDocument(doc):[];
    this.worldShapes=new Map((source?shapesFromDocument(source,{world3D:true}):[]).map(s=>[s.id,s]));
    if(source){const entities=new Map<string,import('./vendor/cad/index').CadEntity>();const visit=(list:import('./vendor/cad/index').CadEntity[])=>{for(const e of list){if(e.handle)entities.set(e.handle.toUpperCase(),e);if(e.attribs)visit(e.attribs);}};visit(source.entities);for(const block of Object.values(source.blocks))visit(block.entities);for(const shape of this.shapes)if(shape.entity?.handle)shape.entity=entities.get(shape.entity.handle.toUpperCase())??shape.entity;}
    this.index=new ShapeIndex(this.shapes);if(this.selected&&(this.selected.origin==='Plano'||!this.layerOptions.visible(this.selected.layer)))this.select();this.redraw();this.sync();}
  private pointer(e:PointerEvent){const r=this.viewer.canvas.getBoundingClientRect();return this.viewer.renderer.screenToWorld({x:e.clientX-r.left,y:e.clientY-r.top});}
  private tolerance(){const a=this.viewer.renderer.screenToWorld({x:0,y:0}),b=this.viewer.renderer.screenToWorld({x:10,y:0});return distance(a,b);}
  private snap(p:Point):Point{
    this.snapped=undefined;let best=this.tolerance(),found:Point|undefined;
    const candidates=this.candidates(p,best);
    if(this.snapPoint){for(const s of candidates)for(const n of s.nodes){const d=distance(p,n);if(d<best){best=d;found={...n,z:this.worldShapes.get(s.id)?.nodes[s.nodes.indexOf(n)]?.z??n.z??0};}}
      for(const n of this.pending){const d=distance(p,n);if(d<best){best=d;found=n;}}}
    // Prefer an exact vertex over a segment projection when both are in range.
    if(!found&&this.snapLine)for(const s of candidates)for(const [a,b]of this.edges(s)){const q=closest(p,a,b),d=distance(p,q);if(d<best){best=d;found=q;}}
    if(found){this.snapped=found;return {...found};}return {...p,z:this.spatial()?undefined:0};
  }
  setNavigationMode(mode:'select'|'pan'){this.setMode(mode);}
  getNavigationMode(){return this.mode;}
  private edges(s:Shape){let e=this.edgeCache.get(s);if(!e){e=segments(s);this.edgeCache.set(s,e);}return e;}
  private candidates(p:Point,r:number){return [...this.index.query(p.x,p.y,r),...this.drawings.filter(s=>this.layerOptions.visible(s.layer))];}
  private setMode(mode:Mode){this.mode=mode;this.angleFirst=undefined;this.pending=[];this.cursor=undefined;this.snapped=undefined;document.querySelector('.shell')!.classList.toggle('has-selection',mode==='select'&&!!this.selected);this.viewport.classList.toggle('drawing-mode',mode!=='select'&&mode!=='pan');this.sync();this.redraw();this.viewport.dispatchEvent(new CustomEvent('mx:cadmode'));}
  private sync(){
    for(const mode of ['select','pan','measure','angle','angle-lines','line','polygon'])document.getElementById(`tool-${mode}`)!.setAttribute('aria-pressed',String(this.mode===mode));
    document.getElementById('snap-point')!.setAttribute('aria-pressed',String(this.snapPoint));document.getElementById('snap-line')!.setAttribute('aria-pressed',String(this.snapLine));
    (document.getElementById('finish-polygon') as HTMLButtonElement).disabled=this.mode!=='polygon'||this.pending.length<3;
    (document.getElementById('undo-drawing') as HTMLButtonElement).disabled=!this.pending.length&&!this.drawings.length;
    (document.getElementById('save-drawings') as HTMLButtonElement).disabled=!this.drawings.length&&!this.layerOptions.layers().length;
    (document.getElementById('undo-property') as HTMLButtonElement).disabled=!this.edits.canUndo;(document.getElementById('redo-property') as HTMLButtonElement).disabled=!this.edits.canRedo;
    document.getElementById('cad-command')!.textContent=instructions[this.mode];
  }
  private click(raw:Point){
    if(this.mode==='pan')return;
    if(this.mode==='select'){
      let best=this.tolerance(),hit:Shape|undefined;
      for(const s of this.candidates(raw,best).reverse()){
        let d=s.points.length===1?distance(raw,s.points[0]):Infinity;for(const [a,b]of this.edges(s))d=Math.min(d,distance(raw,closest(raw,a,b)));
        if(d<best){best=d;hit=s;}
      }
      if(!hit)hit=this.candidates(raw,0).filter(s=>s.closed&&contains(raw,s)).sort((a,b)=>(metrics(a).area??0)-(metrics(b).area??0))[0];
      this.select(hit);this.redraw();return;
    }
    if(this.mode==='angle-lines'){
      let hit:Shape|undefined,best=this.tolerance();for(const s of this.candidates(raw,best)){if(s.type!=='LINE'||s.points.length!==2)continue;const d=distance(raw,closest(raw,s.points[0],s.points[1]));if(d<best){best=d;hit=s;}}
      if(!hit)return;if(!this.angleFirst){this.angleFirst=hit;this.select(hit);this.redraw();return;}
      const a=(this.worldShapes.get(this.angleFirst.id)??this.angleFirst).points,b=(this.worldShapes.get(hit.id)??hit).points,value=lineAngle(a[0],a[1],b[0],b[1],this.spatial());if(value!==undefined)this.angleLabels.push({p:raw,label:`Ángulo ${this.spatial()?'espacial':'XY'} entre líneas: ${value.toFixed(3)}°`});this.angleFirst=undefined;this.select(hit);this.redraw();return;
    }
    const p=this.snap(raw);if(this.mode==='angle'&&this.spatial()&&p.z===undefined){document.getElementById('cad-command')!.textContent='Ángulo espacial: captura vértices con elevación conocida.';return;}
    if(this.mode==='polygon'&&this.pending.length>=3&&distance(p,this.pending[0])<this.tolerance()){this.finish();return;}
    if(this.pending.length&&distance(p,this.pending.at(-1)!)<1e-10)return;
    this.pending.push(p);if(this.mode==='angle'&&this.pending.length===3){const [a,v,b]=this.pending,value=angle(a,v,b,this.spatial());if(value!==undefined)this.angleLabels.push({p:v,label:`Ángulo ${this.spatial()?'espacial':'XY'}: ${value.toFixed(3)}°`});this.pending=[];}document.getElementById('empty')!.hidden=true;
    if((this.mode==='line'||this.mode==='measure')&&this.pending.length===2)this.commit(this.mode==='line'?'LINE':'MEDICION',false);
    this.sync();this.redraw();
  }
  private finish(){if(this.mode!=='polygon'||this.pending.length<3)return;
    if(!validPolygon(this.pending)){document.getElementById('cad-command')!.textContent='El polígono tiene cruces, vértices repetidos o área nula. Deshaz un vértice para corregirlo.';return;}
    this.commit('POLIGONO',true);this.sync();this.redraw();
  }
  private commit(type:string,closed:boolean){
    const points=this.pending.map(p=>({...p}));const layer=this.layerOptions.activeLayer();if(type!=='MEDICION')this.layerOptions.created(layer);const s:Shape={id:`session-${++this.serial}`,type,layer,points,nodes:points,closed,origin:'Sesión'};
    this.drawings.push(s);this.pending=[];this.select(s);
  }
  selectExternal(s?:Shape){this.select(s);}
  private select(s?:Shape){
    this.selected=s;this.info.replaceChildren();
    if(!s){document.querySelector('.shell')!.classList.remove('has-selection');const p=document.createElement('p');p.className='small-note';p.textContent='Selecciona una entidad en el visor.';this.info.append(p);return;}
    // Ensure properties remain available even when side panels were hidden.
    document.querySelector('.shell')!.classList.add('has-selection');
    const unit=document.getElementById('prop-units')!.textContent??'—';
    const suffix:Record<string,string>={'Metros':'m','Milímetros':'mm','Centímetros':'cm','Kilómetros':'km','Pulgadas':'in','Pies':'ft'};
    const u=suffix[unit]??'ud';const fmt=(n:number)=>n.toLocaleString('es-PE',{maximumFractionDigits:4});
    const rows:[string,string][]=[['Tipo',s.type],['Capa',s.layer],['Origen',s.origin],['Identificador',String(s.entity?.handle??s.entity?.id??s.id)]];const authored=this.worldShapes.get(s.id)??s;const m=metrics(authored);
    if(s.points.length>1){rows.push([s.closed?'Perímetro XY':'Longitud XY',`${fmt(m.length)} ${u}`],['Longitud 3D',`${fmt(m.length3d)} ${u}`]);}
    if(m.area!==undefined)rows.push(['Área XY',`${fmt(m.area)} ${u}²`]);
    if(s.approximate)rows.push(['Cálculo','Aproximado (curvas)']);
    if(s.entity){const e=s.entity;rows.push(['Tipo de línea',String(e.lineType??e.linetype??'BYLAYER')],['Grosor',e.lineweight===undefined||e.lineweight===-1?'BYLAYER':e.lineweight===-2?'BYBLOCK':e.lineweight===-3?'DEFAULT':`${e.lineweight/100} mm`],['Opacidad',e.opacity===undefined?'No declarada':String(e.opacity)],['Elevación',String(e.elevation??'Ver coordenadas')]);if(e.text)rows.push(['Texto',e.text]);if(e.attributeTag)rows.push(['Atributo',e.attributeTag]);if(e.blockName)rows.push(['Bloque',e.blockName]);}
    if(s.type==='LINE'&&s.points.length===2){const [a,b]=(this.worldShapes.get(s.id)??s).points;rows.push(['ΔX / ΔY / ΔZ',`${fmt(b.x-a.x)} / ${fmt(b.y-a.y)} / ${fmt((b.z??0)-(a.z??0))}`]);}
    const dl=document.createElement('dl');for(const [label,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.append(row);}this.info.append(dl);
    if(s.entity){const e=s.entity,mode=document.createElement('select'),color=document.createElement('input');mode.id='entity-color-mode';mode.setAttribute('aria-label','Modo de color');for(const value of ['BYLAYER','BYBLOCK','EXPLICIT']){const o=document.createElement('option');o.value=value;o.textContent=value;mode.append(o);}mode.value=e.trueColor!==undefined||typeof e.color==='string'?'EXPLICIT':(e.colorIndex??e.color)===0?'BYBLOCK':(e.colorIndex??e.color??256)===256?'BYLAYER':'EXPLICIT';color.type='color';color.id='entity-color';color.setAttribute('aria-label','Color de entidad');color.value=typeof e.trueColor==='number'?'#'+e.trueColor.toString(16).padStart(6,'0'):typeof e.color==='string'&&/^#[0-9a-f]{6}$/i.test(e.color)?e.color:mode.value==='EXPLICIT'?colorFromAci(Number(e.colorIndex??e.color), '#ffffff'):this.layerOptions.color(s.layer);const apply=()=>{this.edits.set(e,{mode:mode.value as 'BYLAYER'|'BYBLOCK'|'EXPLICIT',value:color.value});this.changed();};mode.onchange=apply;color.onchange=()=>{mode.value='EXPLICIT';apply();};this.info.append(mode,color);if(this.edits.original(e)){const note=document.createElement('p');note.className='small-note';note.textContent='Color modificado localmente. Original: '+JSON.stringify(this.edits.original(e));this.info.append(note);}if(Object.values(this.viewer.getDocument()?.blocks??{}).some(b=>b.entities.includes(e))){const note=document.createElement('p');note.textContent='Entidad de definición de bloque: el color cambia en todas sus instancias.';this.info.append(note);}}
    (document.getElementById('undo-property') as HTMLButtonElement).disabled=!this.edits.canUndo;(document.getElementById('redo-property') as HTMLButtonElement).disabled=!this.edits.canRedo;
    const heading=document.createElement('div');heading.className='property-heading';heading.textContent='COORDENADAS DEL DIBUJO · X / Y / Z';this.info.append(heading);
    const coords=document.createElement('div');coords.className='vertex-list';
    for(const [i,p]of (this.worldShapes.get(s.id)??s).nodes.entries()){const row=document.createElement('div');row.textContent=`${i+1}   ${fmt(p.x)} / ${fmt(p.y)} / ${fmt(p.z??0)}`;coords.append(row);}this.info.append(coords);
    if(s.origin==='Sesión'){const note=document.createElement('p');note.className='small-note';note.textContent='Trazo temporal. Descarga DXF para conservarlo; no modifica el plano original.';this.info.append(note);}
  }
  redraw(){
    this.svg.replaceChildren();
    this.svg.setAttribute('width',String(this.viewport.clientWidth));this.svg.setAttribute('height',String(this.viewport.clientHeight));
    const draw=(s:Shape,selected=false)=>{
      const screen=s.points.map(p=>this.viewer.renderer.worldToScreen(p));if(!screen.length)return;
      const node=document.createElementNS(ns,screen.length===1?'circle':s.closed?'polygon':'polyline');
      if(screen.length===1){node.setAttribute('cx',String(screen[0].x));node.setAttribute('cy',String(screen[0].y));node.setAttribute('r','6');}
      else node.setAttribute('points',screen.map(p=>`${p.x},${p.y}`).join(' '));
      node.setAttribute('stroke',selected?'#ffee75':this.layerOptions.color(s.layer));node.setAttribute('stroke-width',selected?'3':'2');node.setAttribute('fill',s.closed?'#f9bc3920':'none');
      if(s.type==='MEDICION')node.setAttribute('stroke-dasharray','6 4');this.svg.append(node);
      if(s.type==='MEDICION'){const a=screen[0],b=screen.at(-1)!;const label=document.createElementNS(ns,'text');label.setAttribute('x',String((a.x+b.x)/2+8));label.setAttribute('y',String((a.y+b.y)/2-8));label.setAttribute('fill','#ffee75');label.setAttribute('stroke','#172642');label.setAttribute('stroke-width','3');label.setAttribute('paint-order','stroke');label.setAttribute('font-size','12');const unit:Record<string,string>={'Metros':'m','Milímetros':'mm','Centímetros':'cm','Kilómetros':'km','Pulgadas':'in','Pies':'ft'};label.textContent='XY · '+metrics(s).length.toFixed(3)+' '+(unit[document.getElementById('prop-units')!.textContent??'']??'ud');this.svg.append(label);}
    };
    for(const s of this.drawings)if(this.layerOptions.visible(s.layer))draw(s,s===this.selected);
    if(this.selected?.origin==='Plano')draw(this.selected,true);
    if(this.pending.length)draw({id:'preview',type:this.mode==='measure'?'MEDICION':'preview',layer:'',origin:'Sesión',points:[...this.pending,...this.cursor?[this.cursor]:[]],nodes:[],closed:this.mode==='polygon'});
    for(const a of this.angleLabels){const p=this.viewer.renderer.worldToScreen(a.p),t=document.createElementNS(ns,'text');t.setAttribute('x',String(p.x+8));t.setAttribute('y',String(p.y-8));t.setAttribute('fill','#ffee75');t.setAttribute('font-size','12');t.textContent=a.label;this.svg.append(t);}
    if(this.snapped){const p=this.viewer.renderer.worldToScreen(this.snapped);const r=document.createElementNS(ns,'rect');r.setAttribute('x',String(p.x-5));r.setAttribute('y',String(p.y-5));r.setAttribute('width','10');r.setAttribute('height','10');r.setAttribute('fill','none');r.setAttribute('stroke','#69f5b6');r.setAttribute('stroke-width','2');this.svg.append(r);}
  }
  composite(canvas:HTMLCanvasElement){const ctx=canvas.getContext('2d')!;const svg=new XMLSerializer().serializeToString(this.svg);return new Promise<HTMLCanvasElement>((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));img.onload=()=>{ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No se pudieron exportar los trazos.'));};img.src=url;});}
  private download(){
    const out:(string|number)[]=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',0,'ENDSEC',0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER'];
    const names=new Set([...this.layerOptions.layers().map(l=>l.name),...this.drawings.map(s=>s.layer)]);out.push(70,names.size);
    for(const name of names){
      const rgb=parseInt(this.layerOptions.color(name).replace('#',''),16);let best=7,score=Infinity;
      for(let i=1;i<=255;i++){const c=parseInt(colorFromAci(i).replace('#',''),16);const d=((rgb>>16)-(c>>16))**2+(((rgb>>8)&255)-((c>>8)&255))**2+((rgb&255)-(c&255))**2;if(d<score){score=d;best=i;}}
      out.push(0,'LAYER',2,name,70,0,62,this.layerOptions.visible(name)?best:-best,6,'CONTINUOUS');
    }
    out.push(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
    for(const s of this.sessionDrawings()){if(s.closed){out.push(0,'POLYLINE',8,s.layer,66,1,70,9,10,0,20,0,30,0);for(const p of s.points)out.push(0,'VERTEX',8,s.layer,70,32,10,p.x,20,p.y,30,p.z??0);out.push(0,'SEQEND');}else{const a=s.points[0],b=s.points[1];out.push(0,'LINE',8,s.layer,10,a.x,20,a.y,30,a.z??0,11,b.x,21,b.y,31,b.z??0);}}
    out.push(0,'ENDSEC',0,'EOF');const url=URL.createObjectURL(new Blob([out.join('\n')+'\n'],{type:'application/dxf'}));const a=document.createElement('a');a.href=url;a.download='mx-cad-trazos.dxf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
}


