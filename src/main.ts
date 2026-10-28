import { CadViewer, type CadDocument } from '@flyfish-dev/cad-viewer';
import '@flyfish-dev/cad-viewer/style.css';
import './style.css';
import { LayerAwareDxfLoader } from './dxf-loader';

import { layout } from './layout';
import { CadTools } from './cad-tools';
import { drawingRegions, preferredRegion, type DrawingRegion } from './drawing-view';
import { shapesFromDocument } from './geometry';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = layout;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let active = false;
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
  workerUrl: new URL('wasm/dwg-worker.js', document.baseURI).href,
  workerTimeoutMs: 120000,
  renderer: 'canvas2d',
  loaders: [new LayerAwareDxfLoader()],
  canvasOptions: { background: '#111d31', foreground: '#e4ebf3', contrastMode: 'adaptive', showUnsupportedMarkers: true },
  onLoadProgress(progress) { el('progress-text').textContent = `Abriendo plano… ${progress.percent ?? ''}${progress.percent != null ? '%' : ''}`; },
  onViewChange(event) { const zoom = Math.round(zoomReferenceScale ? event.view.scale / zoomReferenceScale * 100 : event.zoomPercent); el('coordinates').textContent = `ZOOM ${zoom}%  •  LOCAL`; el('zoom-label').textContent = `${zoom}%`; tools?.redraw(); }
});

function controls() {
  (document.querySelector('.cad-dock') as HTMLElement | null)?.toggleAttribute('inert', !!controller);
  document.querySelector<HTMLElement>('.sidebar')!.inert = !!controller;
  document.querySelectorAll<HTMLButtonElement>('[data-drawing]').forEach(b => b.disabled = !active || !!controller);
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
  const messages=[...new Set(warnings)].filter(message=>!(/shx/i.test(message)&&!missing.length));
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
  } finally { controller = undefined; el('busy').hidden = true; controls(); }
}
const input = el<HTMLInputElement>('file-input');
const selectFile = () => { if (!controller) input.click(); };
el('open').onclick = selectFile; el('open-empty').onclick = selectFile;
input.onchange = () => { const file = input.files?.[0]; input.value = ''; if (file) void open(file); };
el('cancel').onclick = () => controller?.abort();
el('plus').onclick = () => viewer.zoomIn(); el('minus').onclick = () => viewer.zoomOut(); el('fit').onclick = () => fitDrawing();
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
  zoomReferenceScale=undefined;viewer.clear(); active = false; documentModel = undefined; currentName = '';
  sessionLayers.clear(); activeLayer = 'MX_TRAZOS'; el('layer-error').hidden = true;
  tools?.reset();
  regions=[];regionIndex=0;el('drawing-region').hidden=true;
  el('drawing-warnings').hidden=true;
  el('empty').hidden = false; el('notice').hidden = true;
  el('filename').textContent = 'Ningún archivo abierto'; el('filemeta').textContent = 'Formatos DWG y DXF'; el('tab').textContent = 'Visor de planos';
  el('status').textContent = 'Listo para abrir un plano'; el('coordinates').textContent = 'MX CAD · LOCAL';
  el<HTMLInputElement>('search').value = ''; renderLayers(); updateProperties(); controls();
};
el('panel-toggle').onclick = () => {
  const hidden = document.querySelector('.shell')!.classList.toggle('panels-hidden');
  el('panel-toggle').setAttribute('aria-pressed', String(hidden));
  requestAnimationFrame(() => viewer.resize());
};
function setBackground(light: boolean) {
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
el('export').onclick = async () => {
  try {
    const canvas = await tools!.composite(await viewer.captureCanvas());
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = currentName.replace(/\.(dwg|dxf)$/i, '') + '.png'; document.body.append(link); link.click(); link.remove();
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
window.addEventListener('beforeunload', () => viewer.destroy()); controls();
