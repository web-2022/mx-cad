import { PaperView } from './paper-view';
import { sheetsOf, type DrawingSheet } from './drawing-spaces';
import { fidelityWarnings, prepareReferences, loadLocalReference } from './references';
import { CadViewer, type CadDocument } from './vendor/cad/index';
import '@flyfish-dev/cad-viewer/style.css';
import './style.css';
import { View3D } from './view-3d';
import { LayerAwareDxfLoader } from './dxf-loader';

import { layout } from './layout';
import { CadTools } from './cad-tools';
import { drawingRegions, preferredRegion, type DrawingRegion } from './drawing-view';
import { shapesFromDocument } from './geometry';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = layout;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let active = false;
let is3D = false;
let view3D: View3D | undefined;
let paperView: PaperView | undefined;
let selectedSheet: DrawingSheet | undefined;
let controller: AbortController | undefined;
let documentModel: CadDocument | undefined;
let currentName = '';
let tools: CadTools | undefined;
const sessionLayers = new Map<string, { name: string; color: string; isVisible: boolean }>();
let activeLayer = 'MX_TRAZOS';
let regions: DrawingRegion[] = [];
let regionIndex = 0;
let zoomReferenceScale: number | undefined;
function fitDrawing() {
  if(selectedSheet){paperView?.fit();return;}
  if(is3D){view3D?.fit();return;}
  const region = regions[regionIndex];
  if (!region) { zoomReferenceScale=undefined;viewer.fit('extents');zoomReferenceScale=viewer.renderer.getViewState().scale;el('zoom-label').textContent='100%';el('coordinates').textContent='ZOOM 100%  •  LOCAL';return; }
  const width = Math.max(region.maxX-region.minX, 1e-6), height = Math.max(region.maxY-region.minY, 1e-6);
  const span = Math.max(width,height,1);
  const scale = Math.min(viewer.canvas.clientWidth / Math.max(width,span*.02), viewer.canvas.clientHeight / Math.max(height,span*.02)) * .82;
  zoomReferenceScale=scale;
  viewer.renderer.setViewState({ centerX: (region.minX+region.maxX)/2, centerY: (region.minY+region.maxY)/2, scale });
}
function prepareRegions() {
  zoomReferenceScale=undefined;
  const doc = viewer.getDocument(); regions = doc?.format === 'dwg' ? drawingRegions(shapesFromDocument(doc)) : []; regionIndex = doc ? preferredRegion(doc,regions) : 0;
  const select = el<HTMLSelectElement>('drawing-region');select.replaceChildren();
  regions.forEach((region,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`Zona ${i+1} · ${region.count.toLocaleString('es-PE')} objetos`;select.append(option);});
  const all=document.createElement('option');all.value='-1';all.textContent='Todas las zonas';select.append(all);
  select.value=String(regions.length?regionIndex:-1);select.hidden=regions.length<2;
  if(regions.length)fitDrawing();
}
function layersForView() {
  const layers = new Map(Object.values(documentModel?.layers ?? {}).map(layer => [layer.name, layer]));
  for (const [name, layer] of sessionLayers) layers.set(name, layer);
  return [...layers.values()];
}
const viewer = new CadViewer({
  container: el('viewer'),
  wasmPath: new URL('wasm/', document.baseURI).href,
  workerFactory: () => new Worker(new URL('./vendor/cad/loaders/dwg/DwgWorker.ts', import.meta.url), {type:'module'}),
  keepRaw: true,
  workerTimeoutMs: 120000,
  renderer: 'canvas2d',
  loaders: [new LayerAwareDxfLoader()],
  canvasOptions: { background: '#111d31', foreground: '#e4ebf3', contrastMode: 'adaptive', showUnsupportedMarkers: true },
  onLoadProgress(progress) { el('progress-text').textContent = `Abriendo plano… ${progress.percent ?? ''}${progress.percent != null ? '%' : ''}`; },
  onViewChange(event) { if(selectedSheet||is3D)return; const zoom = Math.round(zoomReferenceScale ? event.view.scale / zoomReferenceScale * 100 : event.zoomPercent); el('coordinates').textContent = `ZOOM ${zoom}%  •  LOCAL`; el('zoom-label').textContent = `${zoom}%`; tools?.redraw(); }
});

function setView3D(enabled: boolean) {
  if(enabled && !documentModel)return;
  if(selectedSheet){if(enabled)selectSpace('model');else return;}
  if(enabled && !view3D){view3D=new View3D(el('viewer-3d'));view3D.background(document.querySelector('.shell')!.classList.contains('light-view'));}
  is3D=enabled;
  el('viewport').dataset.view3d=String(enabled);
  document.querySelectorAll<HTMLElement>('.cad-overlay,.cad-command').forEach(n=>n.hidden=enabled);
  el('viewer').hidden=enabled;
  el('viewer-3d').hidden=!enabled;
  el('view-3d-preset').hidden=!enabled;
  el('view-2d').setAttribute('aria-pressed',String(!enabled));
  el('view-3d').setAttribute('aria-pressed',String(enabled));
  el('mode-badge').textContent=enabled?'TÉCNICO · VISTA 3D':'TÉCNICO · VISTA 2D';
  el('prop-view').textContent=enabled?'3D / alámbrica':'Superior / 2D';
  el('view-label').textContent=enabled?'3D · COORDENADAS ORIGINALES':'SUPERIOR | 2D';
  el('view-hint').textContent=enabled?'Arrastrar: girar · Mayús + arrastrar: desplazar · Rueda: zoom':'Rueda: zoom · Arrastrar: desplazar';
  const dock=document.querySelector<HTMLElement>('.cad-dock');
  if(dock){dock.hidden=enabled;dock.inert=enabled;}
  el('drawing-region').hidden=enabled||regions.length<2;
  if(enabled){
    const count=view3D!.setShapes(shapesFromDocument(documentModel!));
    notice(count?'Vista 3D de líneas y polilíneas. Los objetos no compatibles y los sólidos pueden no aparecer. Un plano sin cotas Z permanece plano.':'Este archivo no contiene líneas o polilíneas compatibles con la vista 3D.',!count);
  }else viewer.resize();
}
el('view-2d').onclick=()=>setView3D(false);
el('view-3d').onclick=()=>setView3D(true);
el('view-3d-preset').onchange=()=>view3D?.preset(el<HTMLSelectElement>('view-3d-preset').value);

function renderSpaces(){
  const host=el('layout-tabs');host.replaceChildren();
  for(const entry of [{id:'model',name:'Model'},...sheetsOf(documentModel)]){
    const button=document.createElement('button');button.textContent=entry.name;button.dataset.space=entry.id;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(entry.id===(selectedSheet?.id??'model')));button.disabled=!!controller;
    button.onclick=()=>selectSpace(entry.id);host.append(button);
  }
}
function selectSpace(id:string){
  if(!documentModel)return;
  selectedSheet=undefined;setView3D(false);
  selectedSheet=sheetsOf(documentModel).find(s=>s.id===id);
  const paper=!!selectedSheet;
  el('viewer-paper').hidden=!paper;el('viewer').hidden=paper;
  el('viewport').dataset.view3d=String(paper);
  document.querySelectorAll<HTMLElement>('.cad-overlay,.cad-command').forEach(n=>n.hidden=paper);
  const dock=document.querySelector<HTMLElement>('.cad-dock');if(dock){dock.hidden=paper;dock.inert=paper;}
  el('new-layer-form').inert=paper;
  el('drawing-region').hidden=paper||regions.length<2;
  el('paper-info').hidden=!paper;
  if(selectedSheet){
    if(!paperView){paperView=new PaperView(el('viewer-paper'),viewer.getShxGlyphResolver());paperView.onView=percent=>{el('zoom-label').textContent=`${percent}%`;el('coordinates').textContent=`HOJA · ZOOM ${percent}% · LOCAL`;};}
    paperView.setSheet(documentModel,selectedSheet);
    el('mode-badge').textContent='PRESENTACIÓN · 2D';el('prop-view').textContent=selectedSheet.name;el('view-label').textContent=`LAYOUT · ${selectedSheet.name}`;
    el('paper-info').textContent=selectedSheet.width&&selectedSheet.height?`${selectedSheet.width.toFixed(2)} × ${selectedSheet.height.toFixed(2)} ${selectedSheet.units} · ${selectedSheet.viewports.length} viewport(s)`:'Formato de papel no disponible · encuadre por contenido';
    el('view-hint').textContent='Rueda: zoom · Arrastrar: desplazar la hoja';
  }else viewer.resize();
  showDrawingWarnings(viewer.getLoadResult()?.warnings??[]);renderSpaces();controls();
}


function controls() {
  (document.querySelector('.cad-dock') as HTMLElement | null)?.toggleAttribute('inert', !!controller || is3D || !!selectedSheet);
  document.querySelector<HTMLElement>('.sidebar')!.inert = !!controller;
  document.querySelectorAll<HTMLButtonElement>('[data-drawing]').forEach(b => b.disabled = !active || !!controller);
  el<HTMLButtonElement>('view-3d').disabled=!active||!!controller||!!selectedSheet;
  el('layout-tabs').inert=!!controller;
  el('new-layer-form').inert=!!selectedSheet||is3D;
  el<HTMLButtonElement>('clear').disabled = !!controller;
  el<HTMLButtonElement>('open').disabled = !!controller;
}
function updateProperties(file?: File) {
  const count = documentModel?.entities.length ?? 0;
  const format = file ? file.name.split('.').pop()!.toUpperCase() : '—';
  const layers = layersForView().length;
  for (const [id, value] of Object.entries({ 'file-count': active ? '1 archivo' : '0 archivos', 'stat-files': active ? '1' : '0', 'stat-layers': String(layers), 'stat-entities': count.toLocaleString('es-PE'), 'stat-format': format, 'prop-format': format, 'prop-size': file ? `${(file.size / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} KB` : '—', 'context-name': currentName || 'Sin plano abierto', 'file-type': active ? format : 'CAD' })) el(id).textContent = value;
  const units: Record<number, string> = { 0: 'Sin unidad', 1: 'Pulgadas', 2: 'Pies', 4: 'Milímetros', 5: 'Centímetros', 6: 'Metros', 7: 'Kilómetros' };
  el('prop-units').textContent = units[Number(documentModel?.header?.$INSUNITS ?? documentModel?.header?.INSUNITS)] ?? documentModel?.units ?? '—';
  const host = el('entity-types'); host.replaceChildren();
  const counts = new Map<string, number>();
  for (const entity of documentModel?.entities ?? []) { const type = entity.type || 'OTROS'; counts.set(type, (counts.get(type) ?? 0) + 1); }
  for (const [type, total] of [...counts].sort((a,b) => b[1] - a[1])) {
    const row = document.createElement('div'); row.className = 'entity-row';
    const label = document.createElement('span'); label.textContent = type;
    const value = document.createElement('strong'); value.textContent = total.toLocaleString('es-PE');
    row.append(label, value); host.append(row);
  }
  if (!counts.size) { const p = document.createElement('p'); p.className = 'small-note'; p.textContent = 'Carga un plano para consultar su contenido.'; host.append(p); }
}
function notice(message: string, error = false) { const n = el('notice'); n.textContent = message; n.classList.toggle('error', error); n.hidden = false; }
function showDrawingWarnings(warnings: string[]) {
  const missing=viewer.getMissingReferences();
  const messages=[...new Set([...warnings,...(documentModel?fidelityWarnings(documentModel):[]),...(selectedSheet?.warnings??[])])].filter(message=>!(/shx/i.test(message)&&!missing.length));
  const host=el('drawing-warning-list');host.replaceChildren();
  if(missing.length){const p=document.createElement('p');p.textContent=`Faltan símbolos SHX: ${missing.map(r=>r.fileName).join(', ')}. Se usan trazos alternativos; esto no impide visualizar la geometría.`;host.append(p);}
  for(const message of messages.filter(m=>!/shx/i.test(m))){const p=document.createElement('p');p.textContent=message;host.append(p);}
  el('drawing-warnings').hidden=!host.children.length;
  el('warning-count').textContent=String(host.children.length);
}
el('notice').onclick = () => { el('notice').hidden = true; };
function renderLayers() {
  const host = el('layers'); host.replaceChildren();
  const query = el<HTMLInputElement>('search').value.toLocaleLowerCase();
  const layers = layersForView();
  el('layer-count').textContent = String(layers.length);
  el('stat-layers').textContent = String(layers.length);
  const select = el<HTMLSelectElement>('active-layer'); select.replaceChildren();
  for (const name of new Set(['MX_TRAZOS', ...layers.map(layer => layer.name)])) {
    const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option);
  }
  select.value = activeLayer;
  for (const layer of layers) {
    if (!layer.name.toLocaleLowerCase().includes(query)) continue;
    const row = document.createElement('label'); row.className = 'layer';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = layer.isVisible !== false && !layer.isFrozen;
    check.setAttribute('aria-label', `Mostrar capa ${layer.name}`);
    const swatch = document.createElement('span'); swatch.className = 'swatch';
    if (typeof layer.color === 'string' && CSS.supports('color', layer.color)) swatch.style.background = layer.color;
    const name = document.createElement('span'); name.textContent = layer.name; name.title = layer.name;
    check.onchange = () => {
      if (sessionLayers.has(layer.name)) sessionLayers.get(layer.name)!.isVisible = check.checked;
      for (const candidate of Object.values(documentModel?.layers ?? {})) {
        if (candidate.name === layer.name) {
          candidate.isVisible = check.checked;
          candidate.isFrozen = false;
        }
      }
      if (documentModel) {
        const state = viewer.renderer.getViewState();
        viewer.renderer.setDocument(documentModel);
        viewer.renderer.setViewState(state);
      }
      if(selectedSheet && documentModel)paperView?.setSheet(documentModel,selectedSheet,false);
      if(is3D && documentModel)view3D?.setShapes(shapesFromDocument(documentModel),false);
      tools?.refresh();
    };
    if (layer.name === activeLayer) row.classList.add('active-layer');
    row.append(check, swatch, name); host.append(row);
  }
  if (!host.children.length) { const p = document.createElement('p'); p.className = 'empty-layer'; p.textContent = active ? 'No hay capas que coincidan.' : 'Las capas aparecerán al abrir un plano.'; host.append(p); }
}

async function open(file: File) {
  if (controller) return;
  if (!/\.(dwg|dxf)$/i.test(file.name)) { notice('Selecciona un archivo DWG o DXF.', true); return; }
  if (!file.size) { notice('El archivo está vacío. Selecciona otro plano.', true); return; }
  controller = new AbortController(); controls(); el('busy').hidden = false; el('notice').hidden = true;
  el('progress-text').textContent = 'Abriendo plano…';
  try {
    const result = await viewer.loadFile(file, { signal: controller.signal });
    sessionLayers.clear(); activeLayer = 'MX_TRAZOS'; el('layer-error').hidden = true;
    documentModel = viewer.renderer.getSourceDocument(); active = true; currentName = file.name;
    selectedSheet=undefined;el('viewer-paper').hidden=true;el('paper-info').hidden=true;
    if(documentModel)prepareReferences(documentModel);
    viewer.renderer.setDocument(documentModel!);renderSpaces();
    setView3D(false);
    tools?.reset();
    prepareRegions();
    el('empty').hidden = true;
    el('filename').textContent = file.name; el('tab').textContent = file.name;
    el('filemeta').textContent = `${result.format.toUpperCase()} · ${(file.size / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} KB`;
    el<HTMLInputElement>('search').value = ''; renderLayers(); updateProperties(file);
    el('status').textContent = `${documentModel?.entities.length.toLocaleString('es-PE') ?? 0} entidades · ${el('layer-count').textContent} capas · ${(result.elapsedMs / 1000).toFixed(2)} s`;
    showDrawingWarnings(result.warnings);
    if (!documentModel?.entities.length) notice('El archivo se abrió, pero no contiene geometría 2D visible compatible.');
  } catch (error) {
    const cancelled = controller.signal.aborted;
    notice(cancelled ? 'Apertura cancelada.' : `No se pudo leer el plano. Puede estar dañado o utilizar una versión no compatible. ${error instanceof Error ? error.message : ''}`, !cancelled);
  } finally { controller = undefined; el('busy').hidden = true; renderSpaces();controls(); }
}
const input = el<HTMLInputElement>('file-input');
const selectFile = () => { if (!controller) input.click(); };
el('open').onclick = selectFile; el('open-empty').onclick = selectFile;
input.onchange = () => { const file = input.files?.[0]; input.value = ''; if (file) void open(file); };
el('cancel').onclick = () => controller?.abort();
el('plus').onclick = () => selectedSheet ? paperView?.zoom(1.25) : is3D ? view3D?.zoom(1.25) : viewer.zoomIn(); el('minus').onclick = () => selectedSheet ? paperView?.zoom(.8) : is3D ? view3D?.zoom(.8) : viewer.zoomOut(); el('fit').onclick = () => fitDrawing();
el('drawing-region').onchange = () => { regionIndex=Number(el<HTMLSelectElement>('drawing-region').value);fitDrawing(); };
el('search').oninput = renderLayers;
el('active-layer').onchange = () => { activeLayer = el<HTMLSelectElement>('active-layer').value; renderLayers(); };
el('new-layer-form').onsubmit = e => {
  e.preventDefault(); const name = el<HTMLInputElement>('new-layer-name').value.trim();
  const error = el('layer-error');
  if (!name || /[<>/\\":;?*|=\u0000-\u001f]/.test(name)) { error.textContent = 'Usa un nombre sin caracteres especiales de CAD.'; error.hidden = false; return; }
  if (layersForView().some(layer => layer.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { error.textContent = 'Ya existe una capa con ese nombre.'; error.hidden = false; return; }
  sessionLayers.set(name, { name, color: el<HTMLInputElement>('new-layer-color').value, isVisible: true });
  activeLayer = name; error.hidden = true; el<HTMLInputElement>('new-layer-name').value = ''; renderLayers(); tools?.refresh();
};
el('clear').onclick = () => {
  if (controller) return;
  selectedSheet=undefined;el('viewer-paper').hidden=true;el('paper-info').hidden=true;
  setView3D(false);
  zoomReferenceScale=undefined;viewer.clear(); active = false; documentModel = undefined; currentName = '';
  sessionLayers.clear(); activeLayer = 'MX_TRAZOS'; el('layer-error').hidden = true;
  tools?.reset();
  regions=[];regionIndex=0;el('drawing-region').hidden=true;
  el('drawing-warnings').hidden=true;
  el('empty').hidden = false; el('notice').hidden = true;
  el('filename').textContent = 'Ningún archivo abierto'; el('filemeta').textContent = 'Formatos DWG y DXF'; el('tab').textContent = 'Visor de planos';
  el('status').textContent = 'Listo para abrir un plano'; el('coordinates').textContent = 'MX CAD · LOCAL';
  el<HTMLInputElement>('search').value = ''; renderLayers(); renderSpaces();updateProperties(); controls();
};
el('panel-toggle').onclick = () => {
  const hidden = document.querySelector('.shell')!.classList.toggle('panels-hidden');
  el('panel-toggle').setAttribute('aria-pressed', String(hidden));
  requestAnimationFrame(() => viewer.resize());
};
function setBackground(light: boolean) {
  view3D?.background(light);
  viewer.setCanvasOptions({ background: light ? '#f4f5f7' : '#111d31', foreground: light ? '#192844' : '#e4ebf3' });
  document.querySelector('.shell')!.classList.toggle('light-view', light);
  el('background-dark').setAttribute('aria-pressed', String(!light)); el('background-light').setAttribute('aria-pressed', String(light));
  document.querySelector<HTMLDetailsElement>('.general')!.open = false;
}
el('background-dark').onclick = () => setBackground(false);
el('background-light').onclick = () => setBackground(true);
el('load-shx').onclick=()=>el<HTMLInputElement>('shx-input').click();
el<HTMLInputElement>('shx-input').onchange=async e=>{
  const input=e.target as HTMLInputElement;
  try{for(const file of input.files??[])await viewer.addReferenceFile(file);showDrawingWarnings(viewer.getLoadResult()?.warnings??[]);tools?.refresh();}
  catch(error){notice(`No se pudo cargar la referencia SHX: ${error instanceof Error?error.message:String(error)}`,true);}
  finally{input.value='';}
};
el('load-references').onclick=()=>el<HTMLInputElement>('reference-input').click();
el<HTMLInputElement>('reference-input').onchange=async e=>{
  const input=e.target as HTMLInputElement;if(!documentModel||controller)return;
  try{
    for(const file of input.files??[])await loadLocalReference(documentModel,file,viewer);
    const state=viewer.renderer.getViewState();viewer.renderer.setDocument(documentModel);viewer.renderer.setViewState(state);
    if(selectedSheet)paperView?.setSheet(documentModel,selectedSheet,false);
    showDrawingWarnings(viewer.getLoadResult()?.warnings??[]);renderLayers();tools?.refresh();
    notice('Referencias locales procesadas. Revisa los avisos de fidelidad y archivos pendientes.');
  }catch(error){notice(String(error),true);}finally{input.value='';}
};
el('export').onclick = async () => {
  try {
    const canvas = selectedSheet ? paperView!.canvas : is3D ? view3D!.canvas : await tools!.composite(await viewer.captureCanvas());
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = currentName.replace(/\.(dwg|dxf)$/i, '') + (selectedSheet?'_'+selectedSheet.name.replace(/[^a-z0-9_-]/gi,'_'):'') + '.png'; document.body.append(link); link.click(); link.remove();
  } catch (error) { notice(`No se pudo exportar la vista: ${String(error)}`, true); }
};
el('demo').onclick = async () => { try { const response = await fetch(new URL('ejemplo.dxf', document.baseURI)); if (!response.ok) throw new Error('Archivo de ejemplo no disponible'); await open(new File([await response.arrayBuffer()], 'ejemplo.dxf')); } catch (e) { notice(String(e), true); } };
const viewport = el('viewport');
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
viewport.addEventListener('dragover', e => { e.preventDefault(); viewport.classList.add('dragging'); });
viewport.addEventListener('dragleave', e => { if (!viewport.contains(e.relatedTarget as Node)) viewport.classList.remove('dragging'); });
viewport.addEventListener('drop', e => { e.preventDefault(); viewport.classList.remove('dragging'); const file = e.dataTransfer?.files[0]; if (file) void open(file); });
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); selectFile(); }
  else if (!(e.target instanceof HTMLInputElement) && active && !controller && e.key.toLowerCase() === 'f') fitDrawing();
});
tools = new CadTools(viewer, {
  activeLayer: () => activeLayer,
  visible: name => { const layer = layersForView().find(layer => layer.name === name); return layer?.isVisible !== false && !layer?.isFrozen; },
  color: name => { const color = layersForView().find(layer => layer.name === name)?.color; return typeof color === 'string' ? color : '#f39c1c'; },
  layers: () => [...sessionLayers.values()],
  created: name => { if (!layersForView().some(layer => layer.name === name)) sessionLayers.set(name, { name, color: '#f39c1c', isVisible: true }); renderLayers(); }
});
window.addEventListener('beforeunload', () => {view3D?.destroy();paperView?.destroy();viewer.destroy();}); controls();


