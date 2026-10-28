import { CadViewer, type CadDocument } from '@flyfish-dev/cad-viewer';
import '@flyfish-dev/cad-viewer/style.css';
import './style.css';
import { LayerAwareDxfLoader } from './dxf-loader';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main class="shell">
 <header class="topbar"><div class="brand"><div class="mark">⌁</div><div><strong>MX CAD</strong><small>VISOR DE PLANOS</small></div></div><div class="top-actions"><span class="local">Procesamiento local</span><button class="primary" id="open">＋ Abrir plano</button></div></header>
 <div class="body"><aside class="sidebar"><div class="eyebrow">ARCHIVO ACTUAL</div><div class="file-card"><strong id="filename">Ningún archivo abierto</strong><small id="filemeta">Formatos DWG y DXF</small></div><div class="section-head"><span class="eyebrow">CAPAS DEL PLANO</span><span class="badge" id="layer-count">0</span></div><input id="search" class="search" placeholder="Buscar capa…" aria-label="Buscar capa"><div class="layers" id="layers"><p class="empty-layer">Las capas aparecerán al abrir un plano.</p></div><div class="sidebar-note">Tus planos permanecen en este equipo.<br>Vista 2D · Solo lectura<br><br>La visualización puede ser parcial si el plano contiene entidades o referencias no compatibles.</div></aside>
 <section class="workspace"><div class="toolbar"><div class="tab" id="tab">Espacio de trabajo</div><div class="tools"><button id="minus" data-drawing title="Alejar">−</button><button id="plus" data-drawing title="Acercar">＋</button><button id="fit" data-drawing title="Ajustar a pantalla (F)">⛶ Ajustar</button><button id="export" data-drawing title="Guardar la vista como imagen PNG">↓ PNG</button></div></div><div class="viewport" id="viewport"><div class="viewer" id="viewer"></div><div class="viewport-label">SUPERIOR / 2D</div><div class="empty" id="empty"><div><div class="empty-icon">⌑</div><h1>Tus planos, a la vista.</h1><p>Abre un archivo de AutoCAD para explorar su geometría y sus capas. También puedes arrastrarlo aquí.</p><button class="primary" id="open-empty">Abrir un plano</button><button class="demo" id="demo">Ver ejemplo ↗</button><div class="formats">.DWG &nbsp; / &nbsp; .DXF</div><div class="shortcuts">Ctrl + O para abrir · F para ajustar</div></div></div><div id="notice" class="notice" role="alert" hidden></div><div id="busy" class="busy" hidden><div><div id="progress-text" role="status">Abriendo plano…</div><progress></progress><button id="cancel">Cancelar</button></div></div><div class="axis"><b>X →</b> Y ↑</div><div class="hint">Rueda: zoom &nbsp; · &nbsp; Arrastrar: desplazar</div></div></section></div>
 <footer class="statusbar"><span id="status" role="status">Listo para abrir un plano</span><span id="coordinates">MX CAD &nbsp; • &nbsp; LOCAL</span></footer>
</main><input type="file" id="file-input" accept=".dwg,.dxf" hidden>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let active = false;
let controller: AbortController | undefined;
let documentModel: CadDocument | undefined;
let currentName = '';
const viewer = new CadViewer({
  container: el('viewer'),
  wasmPath: new URL('wasm/', document.baseURI).href,
  workerUrl: new URL('wasm/dwg-worker.js', document.baseURI).href,
  workerTimeoutMs: 120000,
  renderer: 'auto',
  loaders: [new LayerAwareDxfLoader()],
  canvasOptions: { background: '#0b1018', foreground: '#e4ebf3', contrastMode: 'adaptive', showUnsupportedMarkers: true },
  onLoadProgress(progress) { el('progress-text').textContent = `Abriendo plano… ${progress.percent ?? ''}${progress.percent != null ? '%' : ''}`; },
  onViewChange(event) { el('coordinates').textContent = `ZOOM ${Math.round(event.zoomPercent)}%  •  LOCAL`; }
});

function controls() { document.querySelectorAll<HTMLButtonElement>('[data-drawing]').forEach(b => b.disabled = !active || !!controller); }
function notice(message: string, error = false) { const n = el('notice'); n.textContent = message; n.classList.toggle('error', error); n.hidden = false; }
el('notice').onclick = () => { el('notice').hidden = true; };
function renderLayers() {
  const host = el('layers'); host.replaceChildren();
  const query = el<HTMLInputElement>('search').value.toLocaleLowerCase();
  const layers = Object.entries(documentModel?.layers ?? {});
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
      documentModel.layers[key].isVisible = check.checked;
      documentModel.layers[key].isFrozen = false;
      const state = viewer.renderer.getViewState();
      viewer.renderer.setDocument(documentModel);
      viewer.renderer.setViewState(state);
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
    el('empty').hidden = true;
    el('filename').textContent = file.name; el('tab').textContent = file.name;
    el('filemeta').textContent = `${result.format.toUpperCase()} · ${(file.size / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} KB`;
    el<HTMLInputElement>('search').value = ''; renderLayers();
    el('status').textContent = `${documentModel?.entities.length.toLocaleString('es-PE') ?? 0} entidades · ${Object.keys(documentModel?.layers ?? {}).length} capas · ${(result.elapsedMs / 1000).toFixed(2)} s`;
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
el('export').onclick = async () => {
  try {
    const canvas = await viewer.captureCanvas();
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = currentName.replace(/\.(dwg|dxf)$/i, '') + '.png'; document.body.append(link); link.click(); link.remove();
  } catch (error) { notice(`No se pudo exportar la vista: ${String(error)}`, true); }
};
el('demo').onclick = async () => { try { const response = await fetch('/ejemplo.dxf'); if (!response.ok) throw new Error('Archivo de ejemplo no disponible'); await open(new File([await response.arrayBuffer()], 'ejemplo.dxf')); } catch (e) { notice(String(e), true); } };
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
window.addEventListener('beforeunload', () => viewer.destroy()); controls();
