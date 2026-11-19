import type {CadEntity} from './vendor/cad/core/types';
import {draftStore, draftSource, writeScopeDxf, lineweights, type DraftFile, type DraftPoint, type DraftEntity, type DxfSource} from './drafting-data';

type ScreenPoint = {x:number; y:number};
type SnapMode = 'point' | 'line' | 'face';
type Adapter = {
 capture(x:number,y:number,mode:string,z:number):DraftPoint|undefined;
 project(point:DraftPoint):ScreenPoint|undefined;
 enabled():boolean;
 otherFiles():string[];
 cadSources(scope:string,selected:ReadonlySet<CadEntity>,inFrame:(points:ScreenPoint[])=>boolean):{sources:DxfSource[];warnings:string[]};
 selectCad(point:ScreenPoint):void;
 cadShapes():{entity:CadEntity;points:DraftPoint[];closed:boolean}[];
};
type Projected = {file:DraftFile; entity:DraftEntity; points:ScreenPoint[]; node:SVGElement};
type Rect = {left:number; top:number; right:number; bottom:number};
const snapLabels = {point:'Puntos y vértices', line:'Líneas y aristas', face:'Caras'};
const ns = 'http://www.w3.org/2000/svg';
const byId = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const inside = (p:ScreenPoint,r:Rect) => p.x>=r.left && p.x<=r.right && p.y>=r.top && p.y<=r.bottom;
const rectangle = (a:ScreenPoint,b:ScreenPoint):Rect => ({
 left:Math.min(a.x,b.x), right:Math.max(a.x,b.x), top:Math.min(a.y,b.y), bottom:Math.max(a.y,b.y)
});

function crosses(points:ScreenPoint[],r:Rect) {
 if (points.some(p=>inside(p,r))) return true;
 if (points.length!==2) return false;
 const [a,b] = points;
 const dx=b.x-a.x,dy=b.y-a.y;
 for (const x of [r.left,r.right]) {
  const t=(x-a.x)/dx;
  if(t>=0&&t<=1&&inside({x,y:a.y+dy*t},r))return true;
 }
 for (const y of [r.top,r.bottom]) {
  const t=(y-a.y)/dy;
  if(t>=0&&t<=1&&inside({x:a.x+dx*t,y},r))return true;
 }
 return false;
}

function polygonIntersects(points:ScreenPoint[],r:Rect) {
 if(points.length<=2)return crosses(points,r);
 if(points.some((p,i)=>crosses([p,points[(i+1)%points.length]],r)))return true;
 let enclosed=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];
  if((a.y>r.top)!==(b.y>r.top)&&r.left<(b.x-a.x)*(r.top-a.y)/(b.y-a.y)+a.x)enclosed=!enclosed;
 }
 return enclosed;
}

function segmentParameter(p:ScreenPoint,a:ScreenPoint,b:ScreenPoint) {
 const dx=b.x-a.x,dy=b.y-a.y;
 return Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
}

export function installDrafting(adapter:Adapter) {
 const viewport=byId('viewport'),shell=document.querySelector('.shell')!;
 const geometry=document.createElementNS(ns,'svg'),overlay=document.createElementNS(ns,'svg');
 geometry.classList.add('draft-overlay');overlay.classList.add('draft-overlay','draft-aids');
 viewport.append(geometry,overlay);
 const tree=document.createElement('section');tree.id='drawing-files';document.querySelector('.sidebar')!.append(tree);
 const props=document.createElement('section');props.id='draft-properties';document.querySelector('.properties')!.insertBefore(props,byId('project-properties'));
 const snapMenu=document.createElement('div');snapMenu.className='draft-snap-menu';
 snapMenu.setAttribute('role','group');snapMenu.setAttribute('aria-label','Snap');
 const pointButton=byId('snap-point'),lineButton=byId('snap-line'),heading=pointButton.previousElementSibling!;
 heading.remove();document.querySelector('.cad-dock')!.prepend(snapMenu);
 pointButton.classList.remove('cad-edit-command');lineButton.classList.remove('cad-edit-command');
 pointButton.textContent='Snap punto';lineButton.textContent='Snap línea';
 const faceButton=document.createElement('button');
 faceButton.id='draft-snap-face';faceButton.className='dock-button';faceButton.type='button';
 faceButton.textContent='Snap cara';faceButton.title=snapLabels.face;faceButton.setAttribute('aria-pressed','false');
 faceButton.onclick=()=>faceButton.setAttribute('aria-pressed',String(faceButton.getAttribute('aria-pressed')!=='true'));
 const buttons={point:pointButton,line:lineButton,face:faceButton};
 const modes=new Set<SnapMode>();
 for(const kind of Object.keys(buttons) as SnapMode[]){
  const button=buttons[kind];button.title=snapLabels[kind];snapMenu.append(button);
  const sync=()=>{if(button.getAttribute('aria-pressed')==='true')modes.add(kind);else modes.delete(kind);hint();queue();};
  if(button.getAttribute('aria-pressed')==='true')modes.add(kind);
  new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['aria-pressed']});
 }
 const history=document.createElement('div');history.className='draft-history';history.innerHTML='<button class="dock-button" id="draft-undo" title="Deshacer dibujo">Deshacer</button><button class="dock-button" id="draft-redo" title="Rehacer dibujo">Rehacer</button>';snapMenu.after(history);
 const dialog=document.createElement('dialog');dialog.id='draft-coordinates';
 dialog.innerHTML='<form><h2>Crear por coordenadas del dibujo</h2><p>Este = X · Norte = Y · Elevación = Z</p><div id="draft-coordinate-fields"></div><p id="draft-error" role="alert"></p><button type="submit">Crear</button><button type="button" id="draft-cancel">Cancelar</button></form>';
 const exportDialog=document.createElement('dialog');exportDialog.className='save-dialog';
 exportDialog.innerHTML='<form method="dialog"><h2></h2><p></p><ul></ul><button value="cancel">Cancelar</button><button value="export">Descargar DXF</button></form>';
 document.body.append(dialog,exportDialog);
 let mode:'select'|'POINT'|'LINE'='select',pending:DraftPoint|undefined,cursor:ScreenPoint|undefined;
 let down:{point:ScreenPoint; id:number; modify:boolean; remove:boolean}|undefined;
 let frame=0,dirty=true,lastProjection='',projected:Projected[]=[];
 const cells=new Map<string,Projected[]>(),wide:Projected[]=[];
 const selected=new Set<DraftEntity>();
 const cadSelection=new Map<CadEntity,{points:DraftPoint[];closed:boolean}[]>();
 const undo:{apply():void; revert():void}[]=[],redo:typeof undo=[];
 const defaults={color:'#ffbf35',lineweight:25,markerSize:8};
 const active=()=>draftStore.files.find(f=>f.id===draftStore.activeId);
 const elevation=()=>Number(byId<HTMLInputElement>('draft-elevation').value)||0;
 const command=()=>byId('cad-command');
 const hint=()=>{
  if(mode==='select')return;
  command().textContent=`${mode==='POINT'?'Punto':pending?'Final de línea':'Inicio de línea'} · ${active()?.name??'Archivo de dibujo nuevo'} · ${modes.size?[...modes].map(k=>snapLabels[k]).join(', '):`Plano XY, Z = ${elevation()}`} · Esc cancela`;
 };
 function changed() {
  dirty=true;renderTree();queue();
  byId<HTMLButtonElement>('draft-undo').disabled=!undo.length;
  byId<HTMLButtonElement>('draft-redo').disabled=!redo.length;
  viewport.dispatchEvent(new CustomEvent('mx:draftchange',{bubbles:true}));
 }
 function edit(apply:()=>void,revert:()=>void) {
  apply();undo.push({apply,revert});redo.length=0;changed();
 }
 function replay(from:typeof undo,to:typeof undo,action:'apply'|'revert') {
  const change=from.pop();if(!change)return;
  change[action]();to.push(change);selected.clear();showProperties();changed();
 }
 byId('draft-undo').onclick=()=>replay(undo,redo,'revert');
 byId('draft-redo').onclick=()=>replay(redo,undo,'apply');
 function newFile() {
  const f={id:crypto.randomUUID(),name:`Dibujo ${draftStore.files.length+1}.dxf`,visible:true,entities:[]};
  draftStore.files.push(f);draftStore.activeId=f.id;
  return f;
 }
 function ensure() {
  const f=active()??draftStore.files[0]??newFile();
  draftStore.activeId=f.id;
  return f;
 }
 function renderTree() {
  tree.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='Archivos de dibujo';tree.append(heading);
  for(const f of draftStore.files){
   const row=document.createElement('div'),check=document.createElement('input'),button=document.createElement('button');
   check.type='checkbox';check.checked=f.visible;check.setAttribute('aria-label',`Mostrar ${f.name}`);
   check.onchange=()=>{f.visible=check.checked;if(!f.visible)f.entities.forEach(e=>selected.delete(e));showProperties();changed();};
   button.textContent=`${f.id===draftStore.activeId?'Activo · ':''}${f.name} (${f.entities.length})`;
   button.setAttribute('aria-pressed',String(f.id===draftStore.activeId));
   button.onclick=()=>{
    draftStore.activeId=f.id;selected.clear();cadSelection.clear();props.replaceChildren();openProperties();
    const title=document.createElement('h3'),name=document.createElement('input'),save=document.createElement('button');
    title.textContent='Archivo de dibujo';name.value=f.name;name.setAttribute('aria-label','Nombre del archivo de dibujo');
    name.onchange=()=>{f.name=name.value.trim().slice(0,255)||f.name;changed();hint();};
    save.textContent='Descargar DXF';save.onclick=()=>download([draftSource(f)],f.name);
    props.append(title,name,save);appendStyles([]);changed();hint();
   };
   row.append(check,button);tree.append(row);
  }
 }
 function openProperties() {
  viewport.dispatchEvent(new CustomEvent('mx:draftselect'));
  shell.classList.add('has-selection');shell.classList.remove('right-collapsed');byId('expand-right').hidden=true;
 }
 function appendStyles(entities:DraftEntity[]) {
  function field<K extends keyof typeof defaults>(key:K,title:string,targets:DraftEntity[]) {
   const label=document.createElement('label');
   label.textContent=title+' ';
   const values=new Set(targets.map(e=>e[key]??({color:'#ffbf35',lineweight:25,markerSize:8})[key]));
   const common=values.size===1?[...values][0]:defaults[key];
   const input=key==='lineweight'?document.createElement('select'):document.createElement('input');
   if(input instanceof HTMLSelectElement){
    for(const weight of lineweights){const option=document.createElement('option');option.value=String(weight);option.textContent=(weight/100).toFixed(2)+' mm';input.append(option);}
   }else{
    input.type=key==='color'?'color':'number';
    if(key==='markerSize'){input.min='1';input.max='64';input.step='1';}
   }
   input.value=String(common);
   input.onchange=()=>{
    if(!input.checkValidity()||input.value==='')return;
    const value=(key==='color'?input.value:Number(input.value)) as typeof defaults[K];
    if(!entities.length){defaults[key]=value;return;}
    const old=targets.map(e=>e[key]);
    edit(()=>targets.forEach(e=>{Object.assign(e,{[key]:value});}),()=>targets.forEach((e,i)=>{if(old[i]===undefined)delete e[key];else Object.assign(e,{[key]:old[i]});}));
    showProperties();
   };
   label.append(input);if(values.size>1)label.append(' · Valores distintos');props.append(label);
  }
  field('color','Color',entities);
  if(!entities.length||entities.some(e=>e.type==='LINE'))field('lineweight','Grosor CAD (mm de impresión)',entities.filter(e=>e.type==='LINE'));
  if(!entities.length||entities.some(e=>e.type==='POINT'))field('markerSize','Diámetro del punto (px, solo visor)',entities.filter(e=>e.type==='POINT'));
 }
 function showProperties() {
  props.replaceChildren();if(!selected.size&&!cadSelection.size)return;
  if(cadSelection.size){
   shell.classList.add('has-selection');shell.classList.remove('right-collapsed');byId('expand-right').hidden=true;
   const heading=document.createElement('h3');heading.textContent=`${cadSelection.size+selected.size} entidades`;props.append(heading);
   for(const [label,values] of [
    ['Tipos',new Set([...cadSelection.keys()].map(e=>e.type))],
    ['Capas',new Set([...cadSelection.keys()].map(e=>e.layer??'0'))]
   ] as const){
    const p=document.createElement('p');p.textContent=label+' · '+(values.size===1?[...values][0]:'Valores distintos');props.append(p);
   }
   if(selected.size)appendStyles([...selected]);
   return;
  }
  openProperties();
  const entities=[...selected],entity=entities[0],heading=document.createElement('h3');
  heading.textContent=selected.size>1?`${selected.size} entidades`:entity.type==='POINT'?'Punto':'Línea';
  props.append(heading);
  if(selected.size===1){
   const pre=document.createElement('pre');
   pre.textContent=entity.points.map((p,i)=>`${i+1}: Este ${p.x}\nNorte ${p.y}\nElevación ${p.z}`).join('\n\n');
   if(entity.points.length===2){const[a,b]=entity.points;pre.textContent+=`\nLongitud 3D: ${Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)}`;}
   props.append(pre);
  }
  appendStyles(entities);
 }
 function element(svg:SVGSVGElement,name:string,attributes:Record<string,string|number>) {
  const node=document.createElementNS(ns,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  svg.append(node);return node;
 }
 function drawShape(svg:SVGSVGElement,points:ScreenPoint[],bounds:DOMRect,color:string,size=8,width=2) {
  const [a,b]=points;
  return b?element(svg,'line',{x1:a.x-bounds.left,y1:a.y-bounds.top,x2:b.x-bounds.left,y2:b.y-bounds.top,stroke:color,'stroke-width':width}):
   element(svg,'circle',{cx:a.x-bounds.left,cy:a.y-bounds.top,r:size/2,fill:color});
 }
 function rebuild(bounds:DOMRect) {
  geometry.replaceChildren();projected=[];cells.clear();wide.length=0;
  for(const file of draftStore.files){
   if(!file.visible)continue;
   for(const entity of file.entities){
    const points=entity.points.map(adapter.project);
    if(!points.every(p=>p!==undefined))continue;
    const width=Math.max(1,(entity.lineweight??25)*96/2540);
    const node=drawShape(geometry,points,bounds,entity.color??'#ffbf35',entity.markerSize??8,width);
    const item={file,entity,points,node};projected.push(item);
    node.style.pointerEvents=mode==='select'?'visiblePainted':'none';
    const r=rectangle(points[0],points[1]??points[0]);
    const [left,right,top,bottom]=[r.left,r.right,r.top,r.bottom].map(n=>Math.floor(n/64));
    if((right-left+1)*(bottom-top+1)>32){wide.push(item);continue;}
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
     const key=x+','+y,bucket=cells.get(key)??[];bucket.push(item);cells.set(key,bucket);
    }
   }
  }
 }
 function near(p:ScreenPoint,r:number) {
  const found=new Set(wide);
  for(let x=Math.floor((p.x-r)/64);x<=Math.floor((p.x+r)/64);x++)
   for(let y=Math.floor((p.y-r)/64);y<=Math.floor((p.y+r)/64);y++)
    cells.get(x+','+y)?.forEach(item=>found.add(item));
  return found;
 }
 function updateProjection() {
  const bounds=viewport.getBoundingClientRect();
  const signature=JSON.stringify([adapter.enabled(),bounds.toJSON(),...[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(adapter.project)]);
  if(dirty||signature!==lastProjection){
   dirty=false;lastProjection=signature;
   for(const svg of [geometry,overlay])svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
   if(adapter.enabled())rebuild(bounds);else{geometry.replaceChildren();projected=[];cells.clear();wide.length=0;}
  }
  return bounds;
 }
 function capture(p:ScreenPoint) {
  const z=elevation();
  for(const kind of ['point','line','face'] as const){
   if(!modes.has(kind))continue;
   let point:DraftPoint|undefined,dist=12;
   if(kind!=='face')for(const item of near(p,dist)){
    const [a,b]=item.points,[u,v]=item.entity.points;
    if(kind==='point'){
     item.points.forEach((q,i)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<dist){dist=d;point=item.entity.points[i];}});
    }else if(b){
     const t=segmentParameter(p,a,b),d=Math.hypot(a.x+(b.x-a.x)*t-p.x,a.y+(b.y-a.y)*t-p.y);
     if(d<dist){dist=d;point={x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t,z:u.z+(v.z-u.z)*t};}
    }
   }
   point??=adapter.capture(p.x,p.y,kind,z);
   if(point)return {point,kind};
  }
  const point=!modes.size?adapter.capture(p.x,p.y,'none',z):undefined;
  return point?{point,kind:undefined}:undefined;
 }
 function draw() {
  const bounds=updateProjection();overlay.replaceChildren();
  if(!adapter.enabled())return;
  if(mode==='select'){
   for(const item of projected)if(selected.has(item.entity))drawShape(overlay,item.points,bounds,'#ffff00',(item.entity.markerSize??8)+3);
   for(const shape of [...cadSelection.values()].flat()){
    const points=shape.points.map(adapter.project);
    if(!points.every(p=>p!==undefined))continue;
    if(points.length<2)drawShape(overlay,points,bounds,'#ffff00');
    else element(overlay,shape.closed?'polygon':'polyline',{points:points.map(p=>`${p.x-bounds.left},${p.y-bounds.top}`).join(' '),fill:'none',stroke:'#ffff00','stroke-width':2});
   }
   if(cursor&&down&&Math.hypot(cursor.x-down.point.x,cursor.y-down.point.y)>4){
    const r=rectangle(cursor,down.point),window=cursor.x>=down.point.x,color=window?'#69a9ff':'#69f5b6';
    element(overlay,'rect',{x:r.left-bounds.left,y:r.top-bounds.top,width:r.right-r.left,height:r.bottom-r.top,fill:color,'fill-opacity':0.15,stroke:color,'stroke-dasharray':window?'none':'5 4'});
   }
   return;
  }
  hint();
  const hit=cursor&&capture(cursor);
  if(!hit)return;
  const q=adapter.project(hit.point),start=pending&&adapter.project(pending);
  if(!q)return;
  drawShape(overlay,start?[start,q]:[q],bounds,'#69f5b6',6);
  if(hit.kind){
   const x=q.x-bounds.left,y=q.y-bounds.top;
   if(hit.kind==='point')element(overlay,'rect',{x:x-5,y:y-5,width:10,height:10,fill:'none',stroke:'#69f5b6'});
   else if(hit.kind==='line')element(overlay,'path',{d:`M${x-6},${y} L${x},${y-6} L${x+6},${y} L${x},${y+6} Z`,fill:'none',stroke:'#69f5b6'});
   else element(overlay,'circle',{cx:x,cy:y,r:8,fill:'none',stroke:'#69f5b6'});
   command().textContent+=` · ${snapLabels[hit.kind]} · X ${hit.point.x} · Y ${hit.point.y} · Z ${hit.point.z}`;
  }
 }
 function queue(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
 function commit(points:DraftPoint[]) {
  const f=ensure(),entity:DraftEntity={id:crypto.randomUUID(),type:points.length===1?'POINT':'LINE',points,color:defaults.color};
  if(entity.type==='POINT')entity.markerSize=defaults.markerSize;else entity.lineweight=defaults.lineweight;
  cadSelection.clear();
  edit(()=>f.entities.push(entity),()=>{f.entities=f.entities.filter(e=>e!==entity);});
  selected.clear();selected.add(entity);pending=undefined;showProperties();hint();
 }
 function start(type:'POINT'|'LINE') {
  if(!adapter.enabled()||viewport.dataset.projectLocked==='true')return;
  byId('tool-select').click();ensure();mode=type;pending=undefined;cursor=undefined;
  viewport.classList.add('drafting-mode');hint();changed();byId<HTMLDetailsElement>('draw-menu').open=false;
 }
 byId('draft-elevation').oninput=()=>{hint();queue();};
 byId('draw-point').onclick=()=>start('POINT');
 byId('draw-line').onclick=()=>start('LINE');
 byId('draw-new-file').onclick=()=>{newFile();changed();hint();};
 byId('draw-coordinates').onclick=()=>{
  if(mode==='select')start('LINE');if(mode==='select')return;
  const fields=byId('draft-coordinate-fields');fields.replaceChildren();
  for(let i=0;i<(mode==='POINT'?1:2);i++){
   const group=document.createElement('fieldset'),legend=document.createElement('legend');
   legend.textContent=mode==='POINT'?'Punto':i?'Final':'Inicio';group.append(legend);
   for(const [axis,label] of [['x','Este (X)'],['y','Norte (Y)'],['z','Elevación (Z)']]){
    const l=document.createElement('label'),input=document.createElement('input');
    l.textContent=label;input.type='number';input.step='any';input.required=true;input.name=axis+i;
    input.value=axis==='z'?String(elevation()):'';l.append(input);group.append(l);
   }
   fields.append(group);
  }
  byId('draft-error').textContent='';dialog.showModal();
 };
 dialog.querySelector('form')!.onsubmit=e=>{
  e.preventDefault();const form=new FormData(dialog.querySelector('form')!);
  const points=Array.from({length:mode==='POINT'?1:2},(_,i)=>({x:Number(form.get('x'+i)),y:Number(form.get('y'+i)),z:Number(form.get('z'+i))}));
  if(points.length===2&&points.every(p=>p.x===points[0].x&&p.y===points[0].y&&p.z===points[0].z)){byId('draft-error').textContent='Los extremos deben ser distintos.';return;}
  commit(points);dialog.close();
 };
 byId('draft-cancel').onclick=()=>dialog.close();
 function download(files:DxfSource[],name:string) {
  const url=URL.createObjectURL(new Blob([writeScopeDxf(files)],{type:'application/dxf'})),a=document.createElement('a');
  a.href=url;a.download=name.replace(/\.dxf$/i,'')+'.dxf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function exportScope(id:string) {
  const bounds=updateProjection(),source=id==='draw-export'?(active()?[active()!]:[]):draftStore.files;
  const frameEntities=new Set(projected.filter(p=>crosses(p.points,bounds)).map(p=>p.entity));
  const files=source.map(f=>({...f,entities:f.entities.filter(e=>{
   if(id==='draw-export')return true;
   if(id==='dxf-selection')return selected.has(e);
   return f.visible&&(id==='dxf-visible'||frameEntities.has(e));
  })})).filter(f=>f.entities.length).map(draftSource);
  const cad=adapter.cadSources(id,new Set(cadSelection.keys()),points=>polygonIntersects(points,bounds));
  files.push(...cad.sources);
  const included=new Set(cad.sources.map(f=>f.name));
  const omitted=id==='draw-export'||id==='dxf-selection'?[]:adapter.otherFiles().filter(name=>!included.has(name));
  const units=new Set(files.map(f=>f.units));
  const unitNote=units.size>1?'Unidades diferentes o sin declarar: el DXF queda sin unidad declarada. No se convierten coordenadas.':units.has(0)?'Unidades sin declarar.':'Unidades DXF conservadas (código '+[...units][0]+').';
  exportDialog.querySelector('h2')!.textContent=byId(id).textContent;
  exportDialog.querySelector('p')!.textContent=`${files.reduce((n,f)=>n+f.entities.length,0)} entidades. ${unitNote} Se conservan X, Y y Z. El tamaño de marcador en pantalla no se guarda. ${id==='dxf-frame'?'Se incluye la entidad completa si su proyección intersecta el encuadre, incluso detrás de otra. ':''}${omitted.length?'Archivos cargados sin exportación en este menú: '+omitted.join(', ')+'.':''} ${cad.warnings.join(' ')}`;
  const list=exportDialog.querySelector('ul')!;list.replaceChildren();
  for(const f of files){const li=document.createElement('li');li.textContent=`${f.name} · ${f.entities.length}`;list.append(li);}
  exportDialog.querySelector<HTMLButtonElement>('button[value=export]')!.disabled=!files.length;
  exportDialog.returnValue='';exportDialog.onclose=()=>{if(exportDialog.returnValue==='export'&&files.length)download(files,id==='draw-export'?files[0].name:'MX CAD.dxf');};
  byId<HTMLDetailsElement>('dxf-menu').open=false;exportDialog.showModal();
 }
 for(const id of ['draw-export','dxf-selection','dxf-visible','dxf-frame'])byId(id).onclick=()=>exportScope(id);
 function select(items:DraftEntity[],modify:boolean,remove:boolean) {
  if(!modify&&!remove){selected.clear();cadSelection.clear();}
  for(const entity of items)if(remove||modify&&selected.has(entity))selected.delete(entity);else selected.add(entity);
  showProperties();queue();
 }
 const isSelect=()=>byId('tool-select').getAttribute('aria-pressed')==='true';
 const location=(e:PointerEvent)=>({x:e.clientX,y:e.clientY});
 viewport.parentElement!.addEventListener('pointerdown',e=>{
  if(!viewport.contains(e.target as Node)||!adapter.enabled()||e.button!==0||viewport.dataset.projectLocked==='true'||(!(e.target instanceof HTMLCanvasElement)&&!geometry.contains(e.target as Node)))return;
  if(mode==='select'&&!isSelect())return;
  down={point:location(e),id:e.pointerId,modify:e.shiftKey||e.ctrlKey||e.metaKey,remove:e.altKey};
  if(mode!=='select'||geometry.contains(e.target as Node)||viewport.dataset.view3d!=='true'){e.preventDefault();e.stopImmediatePropagation();}
 },true);
 viewport.addEventListener('pointerup',e=>{
  if(!down||e.pointerId!==down.id)return;
  const press=down;down=undefined;const p=location(e),drag=Math.hypot(p.x-press.point.x,p.y-press.point.y)>4;
  updateProjection();
  if(mode==='select'){
   const rect=rectangle(p,press.point);
   const items=drag?projected.filter(item=>p.x>=press.point.x?item.points.every(v=>inside(v,rect)):crosses(item.points,rect)):
    [...near(p,8)].reverse().filter(item=>crosses(item.points,{left:p.x-6,right:p.x+6,top:p.y-6,bottom:p.y+6})).slice(0,1);
   if(items.length||drag||geometry.contains(e.target as Node)){
    e.preventDefault();e.stopImmediatePropagation();select(items.map(i=>i.entity),press.modify,press.remove);
    if(drag){
     viewport.dispatchEvent(new CustomEvent('mx:draftwindow'));
     const groups=new Map<CadEntity,ReturnType<Adapter['cadShapes']>>();
     for(const shape of adapter.cadShapes()){
      const group=groups.get(shape.entity)??[];group.push(shape);groups.set(shape.entity,group);
     }
     const containing=p.x>=press.point.x;
     for(const [entity,shapes] of groups){
      const intersects=(shape:typeof shapes[number])=>{
       const points=shape.points.map(adapter.project);
       if(!points.every(v=>v!==undefined))return false;
       if(containing)return points.every(v=>inside(v,rect));
       if(shape.closed)return polygonIntersects(points,rect);
       return points.length===1?inside(points[0],rect):points.some((v,i)=>i>0&&crosses([points[i-1],v],rect));
      };
      if(!(containing?shapes.every(intersects):shapes.some(intersects)))continue;
      if(press.remove||press.modify&&cadSelection.has(entity))cadSelection.delete(entity);
      else cadSelection.set(entity,shapes);
     }
     showProperties();queue();
    }
   }else if(!press.modify&&!press.remove){selected.clear();cadSelection.clear();showProperties();queue();if(viewport.dataset.view3d!=='true')adapter.selectCad(p);}
   return;
  }
  e.preventDefault();e.stopImmediatePropagation();if(drag)return;
  const hit=capture(p);
  if(!hit){command().textContent='No se encontró una captura. Acerca el cursor a la geometría o usa coordenadas.';return;}
  if(mode==='POINT')commit([hit.point]);
  else if(!pending)pending=hit.point;
  else if(pending.x!==hit.point.x||pending.y!==hit.point.y||pending.z!==hit.point.z)commit([pending,hit.point]);
  queue();
 },true);
 viewport.addEventListener('pointermove',e=>{cursor=location(e);queue();});
 viewport.addEventListener('pointerleave',()=>{cursor=undefined;down=undefined;queue();});
 viewport.addEventListener('pointercancel',()=>{down=undefined;queue();});
 function stop() {
  mode='select';pending=undefined;cursor=undefined;down=undefined;dirty=true;
  viewport.classList.remove('drafting-mode');queue();
 }
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!dialog.open&&!exportDialog.open){stop();selected.clear();cadSelection.clear();showProperties();}
 });
 viewport.addEventListener('mx:cadmode',stop);
 viewport.addEventListener('mx:axes',queue);viewport.addEventListener('wheel',queue);
 new ResizeObserver(queue).observe(viewport);
 new MutationObserver(queue).observe(viewport,{attributes:true,attributeFilter:['data-project-locked','data-view3d','class']});
 for(const event of ['mx:selectshape','mx:objectselect'])viewport.addEventListener(event,()=>{selected.clear();cadSelection.clear();props.replaceChildren();queue();});
 window.addEventListener('mx:drafts-restored',()=>{stop();selected.clear();cadSelection.clear();undo.length=redo.length=0;props.replaceChildren();changed();});
 changed();
}
