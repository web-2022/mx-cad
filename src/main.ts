import { CadViewer, type CadDocument } from '@flyfish-dev/cad-viewer';
import '@flyfish-dev/cad-viewer/style.css';
import './style.css';
import { LayerAwareDxfLoader } from './dxf-loader';

import { layout } from './layout';
import { CadTools } from './cad-tools';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = layout;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let active = false;
let controller: AbortController | undefined;
let documentModel: CadDocument | undefined;
let currentName = '';
let tools: CadTools | undefined;
const viewer = new CadViewer({
  container: el('viewer'),
  wasmPath: new URL('wasm/', document.baseURI).href,
  workerUrl: new URL('wasm/dwg-worker.js', document.baseURI).href,
  workerTimeoutMs: 120000,
  renderer: 'auto',
  loaders: [new LayerAwareDxfLoader()],
  canvasOptions: { background: '#111d31', foreground: '#e4ebf3', contrastMode: 'adaptive', showUnsupportedMarkers: true },
  onLoadProgress(progress) { el('progress-text').textContent = `Abriendo plano… ${progress.percent ?? ''}${progress.percent != null ? '%' : ''}`; },
  onViewChange(event) { const zoom = Math.round(event.zoomPercent); el('coordinates').textContent = `ZOOM ${zoom}%  •  LOCAL`; el('zoom-label').textContent = `${zoom}%`; tools?.redraw(); }
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
  const layers = new Set(Object.values(documentModel?.layers ?? {}).map(layer => layer.name)).size;
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
el('notice').onclick = () => { el('notice').hidden = true; };
function renderLayers() {
  const host = el('layers'); host.replaceChildren();
  const query = el<HTMLInputElement>('search').value.toLocaleLowerCase();
  const layers = [...new Map(Object.entries(documentModel?.layers ?? {}).map(entry => [entry[1].name, entry])).values()];
  el('layer-count').textContent = String(layers.length);
  for (const [key, layer] of layers) {
    if (!layer.name.toLocaleLowerCase().includes(query)) continue;
    const row = document.createElement('label'); row.className = 'layer';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = layer.isVisible !== false && !layer.isFrozen;
    check.setAttribute('aria-label', `Mostrar capa ${layer.name}`);
    const swatch = document.createElement('span'); swatch.className = 'swatch';
    if (typeof layer.color === 'string' && CSS.supports('color', layer.color)) swatch.style.background = layer.color;
    const name = document.createElement('span'); name.textContent = layer.name; name.title = layer.name;
    check.onchange = () => {
      if (!documentModel) return;
      for (const candidate of Object.values(documentModel.layers)) {
        if (candidate.name === documentModel.layers[key].name) {
          candidate.isVisible = check.checked;
          candidate.isFrozen = false;
        }
      }
      const state = viewer.renderer.getViewState();
      viewer.renderer.setDocument(documentModel);
      viewer.renderer.setViewState(state);
      tools?.refresh();
    };
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
    documentModel = viewer.renderer.getSourceDocument(); active = true; currentName = file.name;
    tools?.reset();
    el('empty').hidden = true;
    el('filename').textContent = file.name; el('tab').textContent = file.name;
    el('filemeta').textContent = `${result.format.toUpperCase()} · ${(file.size / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} KB`;
    el<HTMLInputElement>('search').value = ''; renderLayers(); updateProperties(file);
    el('status').textContent = `${documentModel?.entities.length.toLocaleString('es-PE') ?? 0} entidades · ${el('layer-count').textContent} capas · ${(result.elapsedMs / 1000).toFixed(2)} s`;
    const warnings = [...new Set([...result.warnings, ...viewer.getMissingReferences().map(r => `Referencia ausente: ${r.fileName}`)])];
    if (!documentModel?.entities.length) notice('El archivo se abrió, pero no contiene geometría 2D visible compatible.');
    else if (warnings.length) notice(`Vista posiblemente parcial · ${warnings.length} aviso(s): ${warnings.slice(0, 3).join(' · ')}. Haz clic para cerrar.`);
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
el('plus').onclick = () => viewer.zoomIn(); el('minus').onclick = () => viewer.zoomOut(); el('fit').onclick = () => viewer.fit();
el('search').oninput = renderLayers;
el('clear').onclick = () => {
  if (controller) return;
  viewer.clear(); active = false; documentModel = undefined; currentName = '';
  tools?.reset();
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
  else if (!(e.target instanceof HTMLInputElement) && active && !controller && e.key.toLowerCase() === 'f') viewer.fit();
});
tools = new CadTools(viewer);
window.addEventListener('beforeunload', () => viewer.destroy()); controls();
