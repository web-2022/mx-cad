import {entityPlotStyle} from '../../../plot-styles';
import {wrapText} from '../../../text-layout';
import {solidVertices} from '../../../solid-order';
import { hatchBoundaries } from '../../../hatch-geometry';
import { applyByBlockColorInheritance, layerVisible, resolveCadColor, resolveFillColor, type CadColorContrastMode } from '../core/color.js';
import { computeCadDocumentBounds, resolveCadFitBounds } from '../core/bounds.js';
import { arcPoints, boundsValid, bulgeToPolylinePoints, clamp, ellipsePoints, emptyBounds, isFinitePoint, stripMTextFormatting, xy } from '../core/geometry.js';
import { cadEntityWorldStrokeWidth, inferEntityKind, isCadPolylineClosed } from '../core/entity.js';
import { applyByBlockLineTypeInheritance, createDashedCadPrimitives, resolveCadLinePattern, transformCadLineTypeGlyph, type CadLineTypeMarker } from '../core/linetype.js';
import { createCadSceneDocument } from '../core/scene.js';
import { EMPTY_SHX_GLYPH_RESOLVER, type CadShxGlyph, type CadShxGlyphResolver } from '../core/shx.js';
import { matrixFromInsert, transformEntity } from '../core/transform.js';
import type { CadBlock, CadBounds, CadDocument, CadEntity, CadFitMode, CadPathCommand, CadPoint2D, CadPoint3D } from '../core/types.js';

import { captureCanvasLayers } from './captureCanvas.js';

export interface CanvasViewerOptions {
  background?: string;
  /** Pixels per paper millimetre; layouts scale physical lineweights with zoom. */
  paperScale?: number;
  transparentBackground?: boolean;
  foreground?: string;
  showUnsupportedMarkers?: boolean;
  showImagePlaceholders?: boolean;
  showPageBounds?: boolean;
  minScale?: number;
  maxScale?: number;
  wheelZoomFactor?: number;
  trueColorByteOrder?: 'rgb' | 'bgr';
  maxInsertDepth?: number;
  /** Initial and toolbar Fit behavior. Auto prefers meaningful content inside a valid saved DWG viewport. */
  fitMode?: CadFitMode;
  contrastMode?: CadColorContrastMode;
  minColorContrast?: number;

  /** WebGL renderer: approximate curve tessellation cap for circles/arcs/ellipses. */
  maxCurveSegments?: number;
  /** WebGL renderer: target number of spatial cells across the longest drawing axis. */
  spatialIndexCellCount?: number;
  /** WebGL renderer: maximum vertices per GPU batch. Smaller values improve culling granularity. */
  maxVerticesPerBatch?: number;
  /** WebGL renderer: hide labels below this screen-space height. */
  textMinPixelHeight?: number;
  /** WebGL renderer: cap the number of labels drawn into the 2D overlay per frame. */
  maxVisibleTextLabels?: number;
  /** WebGL renderer: WebGL context power preference. */
  powerPreference?: WebGLPowerPreference;
  /** WebGL renderer: request antialiasing from the WebGL context. */
  antialias?: boolean;
  /** WebGL renderer: keep WebGL framebuffer pixels after rendering. Usually false for speed. */
  preserveDrawingBuffer?: boolean;
  /** WebGL renderer: use retained, spatially culled GPU batches. */
  enableSpatialIndex?: boolean;
  /** Advanced renderer hook. CadViewer supplies this automatically for uploaded SHX references. */
  shxGlyphResolver?: CadShxGlyphResolver;
}

export interface ViewState {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface RenderStats {
  total: number;
  drawn: number;
  skipped: number;
  byType: Record<string, number>;
  unsupported: Record<string, number>;
  renderElapsedMs: number;
  /** Active renderer backend. */
  backend?: 'canvas2d' | 'webgl';
  /** Total retained GPU/CPU primitives after scene normalization. */
  primitiveCount?: number;
  /** Primitives submitted in the latest frame after viewport culling. */
  visiblePrimitiveCount?: number;
  /** Primitives skipped by viewport culling in the latest frame. */
  culledPrimitiveCount?: number;
  /** Estimated GPU buffer memory in bytes. */
  gpuMemoryBytes?: number;
  /** One-time retained scene build/upload time in milliseconds. */
  buildElapsedMs?: number;
}

export interface ViewChangeEvent {
  view: ViewState;
  fitScale: number;
  zoomRatio: number;
  zoomPercent: number;
  bounds: CadBounds;
}

const DEFAULT_OPTIONS: Required<CanvasViewerOptions> = {
  paperScale: 0,
  transparentBackground: false,
  background: '#0b1020',
  foreground: '#ffffff',
  showUnsupportedMarkers: false,
  showImagePlaceholders: true,
  showPageBounds: true,
  minScale: 1e-9,
  maxScale: 1e9,
  wheelZoomFactor: 1.14,
  trueColorByteOrder: 'rgb',
  maxInsertDepth: 16,
  fitMode: 'auto',
  contrastMode: 'adaptive',
  minColorContrast: 2.4,
  maxCurveSegments: 96,
  spatialIndexCellCount: 72,
  maxVerticesPerBatch: 65536,
  textMinPixelHeight: 4,
  maxVisibleTextLabels: 2500,
  powerPreference: 'high-performance',
  antialias: true,
  preserveDrawingBuffer: false,
  enableSpatialIndex: true,
  shxGlyphResolver: EMPTY_SHX_GLYPH_RESOLVER
};

export class CadCanvasRenderer {
  captureCanvas(): HTMLCanvasElement {
    this.render();
    return captureCanvasLayers([this.canvas]);
  }
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: Required<CanvasViewerOptions>;
  private sourceDocument?: CadDocument;
  private document?: CadDocument;
  private bounds: CadBounds = emptyBounds();
  private view: ViewState = { centerX: 0, centerY: 0, scale: 1 };
  private fitScale = 1;
  private dpr = 1;
  private prepared=new WeakMap<CadDocument,{document:CadDocument;curves:WeakMap<CadEntity,CadPoint2D[]>;inserts:WeakMap<CadEntity,CadEntity[]>;hatches:WeakMap<CadEntity,ReturnType<typeof hatchBoundaries>>}>();
  private lineGroups=new WeakMap<CadDocument,CadEntity[][]>();
  private frame=0;
  private curveCache=new WeakMap<CadEntity,CadPoint2D[]>();
  private insertCache=new WeakMap<CadEntity,CadEntity[]>();
  private hatchCache=new WeakMap<CadEntity,ReturnType<typeof hatchBoundaries>>();
  private isDragging = false;
  private lastPointer?: { x: number; y: number };
  private resizeObserver?: ResizeObserver;
  private imageCache = new Map<string, HTMLImageElement>();
  private stats: RenderStats = { total: 0, drawn: 0, skipped: 0, byType: {}, unsupported: {}, renderElapsedMs: 0, backend: 'canvas2d' };

  onStats?: (stats: RenderStats) => void;
  onViewChange?: (event: ViewChangeEvent) => void;

  constructor(canvas: HTMLCanvasElement, options: CanvasViewerOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available.');
    this.canvas = canvas;
    this.ctx = ctx;
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.canvas.classList.add('cad-viewer-canvas');
    this.bindEvents();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    this.resize();
  }

  destroy(): void {
    if(this.frame)cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
  }

  clear(): void {
    this.imageCache.clear();this.prepared=new WeakMap();this.lineGroups=new WeakMap();
    this.sourceDocument = undefined;
    this.document = undefined;
    this.bounds = emptyBounds();
    this.view = { centerX: 0, centerY: 0, scale: 1 };
    this.fitScale = 1;
    this.render();
    this.emitViewChange();
  }

  setDocument(document: CadDocument, view?:ViewState): void {
    if(!view){this.lineGroups.delete(document);if(this.sourceDocument!==document)this.imageCache.clear();}
    this.sourceDocument=document;
    let cached=view?this.prepared.get(document):undefined;
    if(!cached){cached={document:createCadSceneDocument(document),curves:new WeakMap(),inserts:new WeakMap(),hatches:new WeakMap()};if(view)this.prepared.set(document,cached);}
    this.document=cached.document;this.curveCache=cached.curves;this.insertCache=cached.inserts;this.hatchCache=cached.hatches;
    this.bounds=view?emptyBounds():computeCadDocumentBounds(this.document,this.boundsOptions());
    if(view){this.view={...view,scale:this.clampScale(view.scale)};this.render();return;}
    this.fitToView();
  }

  refreshReferences(): void {
    this.render();
    this.emitViewChange();
  }

  getDocument(): CadDocument | undefined {
    return this.document;
  }

  getSourceDocument(): CadDocument | undefined { return this.sourceDocument; }

  setOptions(options: CanvasViewerOptions, redraw=true): void {
    const refit = options.fitMode !== undefined && options.fitMode !== this.opts.fitMode;
    if(['background','foreground','contrastMode','trueColorByteOrder','minColorContrast'].some(k=>(options as any)[k]!==undefined&&(options as any)[k]!== (this.opts as any)[k])){this.insertCache=new WeakMap();this.prepared=new WeakMap();}
    Object.assign(this.opts, options);
    if(!redraw)return;
    if (refit && this.document) {
      this.fitToView();
      return;
    }
    this.render();
    this.emitViewChange();
  }

  getOptions(): Required<CanvasViewerOptions> {
    return { ...this.opts };
  }

  fitToView(padding = 0.92, mode: CadFitMode = this.opts.fitMode): void {
    const fitBounds = this.document
      ? resolveCadFitBounds(this.document, this.bounds, mode, this.boundsOptions())
      : this.bounds;
    if (!boundsValid(fitBounds)) {
      this.view = { centerX: 0, centerY: 0, scale: 1 };
      this.fitScale = 1;
      this.render();
      this.emitViewChange();
      return;
    }
    const w = Math.max(1, this.cssWidth);
    const h = Math.max(1, this.cssHeight);
    const bw = Math.max(fitBounds.maxX - fitBounds.minX, 1e-9);
    const bh = Math.max(fitBounds.maxY - fitBounds.minY, 1e-9);
    const scale = this.clampScale(Math.min(w / bw, h / bh) * padding);
    this.fitScale = scale;
    this.view = {
      centerX: (fitBounds.minX + fitBounds.maxX) / 2,
      centerY: (fitBounds.minY + fitBounds.maxY) / 2,
      scale
    };
    this.render();
    this.emitViewChange();
  }

  resize(): void {
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(this.cssWidth * this.dpr));
    const h = Math.max(1, Math.floor(this.cssHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.render();
    this.emitViewChange();
  }

  zoom(factor: number, anchor?: CadPoint2D, deferred=false): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const point = anchor ?? { x: this.cssWidth / 2, y: this.cssHeight / 2 };
    const before = this.screenToWorld(point);
    this.view.scale = this.clampScale(this.view.scale * factor);
    const after = this.screenToWorld(point);
    this.view.centerX += before.x - after.x;
    this.view.centerY += before.y - after.y;
    if(deferred){this.queueRender();return;}
    this.render();
    this.emitViewChange();
  }

  zoomIn(): void { this.zoom(this.opts.wheelZoomFactor); }
  zoomOut(): void { this.zoom(1 / this.opts.wheelZoomFactor); }

  panByScreenDelta(dx: number, dy: number, deferred=false): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.view.centerX -= dx / this.view.scale;
    this.view.centerY += dy / this.view.scale;
    if(deferred){this.queueRender();return;}
    this.render();
    this.emitViewChange();
  }

  setViewState(view: ViewState): void {
    if (![view.centerX, view.centerY, view.scale].every(Number.isFinite)) throw new Error('Invalid view state.');
    this.view = { ...view, scale: this.clampScale(view.scale) };
    this.render();
    this.emitViewChange();
  }

  getViewState(): ViewState { return { ...this.view }; }
  getBounds(): CadBounds { return { ...this.bounds }; }
  getStats(): RenderStats { return cloneStats(this.stats); }
  getZoomRatio(): number { return Math.abs(this.fitScale) < 1e-12 ? 1 : this.view.scale / this.fitScale; }
  getZoomPercent(): number { return this.getZoomRatio() * 100; }

  worldToScreen(p: CadPoint2D): CadPoint2D {
    return {
      x: this.cssWidth / 2 + (p.x - this.view.centerX) * this.view.scale,
      y: this.cssHeight / 2 - (p.y - this.view.centerY) * this.view.scale
    };
  }

  screenToWorld(p: CadPoint2D): CadPoint2D {
    return {
      x: this.view.centerX + (p.x - this.cssWidth / 2) / this.view.scale,
      y: this.view.centerY - (p.y - this.cssHeight / 2) / this.view.scale
    };
  }

  private queueRender(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();this.emitViewChange();});}
  private pointsFor(e:CadEntity,build:()=>CadPoint2D[]){let p=this.curveCache.get(e);if(!p){p=build();this.curveCache.set(e,p);}return p;}
  render(): RenderStats {
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}
    const started = performance.now();
    this.stats = { total: 0, drawn: 0, skipped: 0, byType: {}, unsupported: {}, renderElapsedMs: 0, backend: 'canvas2d' };
    this.clearCanvas();
    if (this.document) {
      if (this.opts.showPageBounds && this.document.pages?.length) this.drawPageBounds(this.document);
      let groups=this.lineGroups.get(this.document);if(!groups){groups=this.groupLines(this.document.entities);this.lineGroups.set(this.document,groups);}
      for(const group of groups){if(group.length>1)this.drawLineBatch(group);else this.drawEntityTracked(group[0],0);}
    }
    this.stats.renderElapsedMs = performance.now() - started;
    this.onStats?.(this.getStats());
    return this.getStats();
  }

  private groupLines(entities:CadEntity[]){
    const groups:CadEntity[][]=[];let current:CadEntity[]=[],last='';
    const opaque=(color:unknown)=>color===undefined||color===null||typeof color==='number'||typeof color==='string'&&/^#[a-f0-9]{6}$/i.test(color);
    for(const e of entities){const layer=this.lookupLayer(e.layer);
      const eligible=e.type==='LINE'&&e.isVisible!==false&&layerVisible(layer)&&Number(e.opacity??1)===1&&isFinitePoint(e.startPoint)&&isFinitePoint(e.endPoint)&&!cadEntityWorldStrokeWidth(e)&&opaque(e.color)&&opaque(e.trueColor)&&opaque(layer?.color)&&!resolveCadLinePattern(e,this.document);
      if(!eligible){if(current.length)groups.push(current);current=[];last='';groups.push([e]);continue;}
      const key=JSON.stringify([e.layer,e.colorIndex,e.colorNumber,e.mxInheritedAci,e.color,e.trueColor,e.lineweight]);
      if(key!==last&&current.length){groups.push(current);current=[];}last=key;current.push(e);
    }
    if(current.length)groups.push(current);return groups;
  }
  private drawLineBatch(lines:CadEntity[]){
    this.stats.total+=lines.length;this.stats.byType.LINE=(this.stats.byType.LINE??0)+lines.length;
    this.beginStyledPath(lines[0],false,false);const ctx=this.ctx,w=this.cssWidth,h=this.cssHeight,scale=this.view.scale,cx=this.view.centerX,cy=this.view.centerY;let drawn=0;
    for(const e of lines){const a=e.startPoint!,b=e.endPoint!,ax=w/2+(a.x-cx)*scale,ay=h/2-(a.y-cy)*scale,bx=w/2+(b.x-cx)*scale,by=h/2-(b.y-cy)*scale;
      if((ax<-130&&bx<-130)||(ax>w+130&&bx>w+130)||(ay<-130&&by<-130)||(ay>h+130&&by>h+130)){this.stats.skipped++;continue;}
      ctx.moveTo(ax,ay);ctx.lineTo(bx,by);drawn++;
    }
    ctx.stroke();ctx.restore();this.stats.drawn+=drawn;
  }
  private get cssWidth(): number { return this.canvas.clientWidth || 1; }
  private get cssHeight(): number { return this.canvas.clientHeight || 1; }

  private bindEvents(): void {
    this.canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? this.opts.wheelZoomFactor : 1 / this.opts.wheelZoomFactor;
      this.zoom(factor, { x: ev.offsetX, y: ev.offsetY },true);
    }, { passive: false });

    this.canvas.addEventListener('pointerdown', (ev) => {
      this.canvas.setPointerCapture(ev.pointerId);
      this.isDragging = true;
      this.lastPointer = { x: ev.clientX, y: ev.clientY };
      this.canvas.classList.add('is-dragging');
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (!this.isDragging || !this.lastPointer) return;
      this.panByScreenDelta(ev.clientX - this.lastPointer.x, ev.clientY - this.lastPointer.y,true);
      this.lastPointer = { x: ev.clientX, y: ev.clientY };
    });
    const stopDrag = (ev?: PointerEvent) => {
      if (ev && this.canvas.hasPointerCapture(ev.pointerId)) this.canvas.releasePointerCapture(ev.pointerId);
      this.isDragging = false;
      this.lastPointer = undefined;
      this.canvas.classList.remove('is-dragging');
    };
    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', () => stopDrag());
  }

  private clearCanvas(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.fillStyle = this.opts.background;
    if (!this.opts.transparentBackground) ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.restore();
  }

  private drawPageBounds(document: CadDocument): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    for (const page of document.pages ?? []) {
      const a = this.worldToScreen({ x: 0, y: 0 });
      const b = this.worldToScreen({ x: page.width, y: page.height });
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }
    ctx.restore();
  }

  private drawEntityTracked(entity: CadEntity, depth: number): void {
    this.stats.total++;
    const type = String(entity.type ?? 'UNKNOWN').toUpperCase();
    this.stats.byType[type] = (this.stats.byType[type] ?? 0) + 1;
    const layer = this.lookupLayer(entity.layer);
    if (entity.isVisible === false || !layerVisible(layer)) {
      this.stats.skipped++;
      return;
    }
    this.drawEntity(entity, type, depth);
  }

  private drawEntity(entity: CadEntity, type: string, depth: number): void {
    const kind = entity.kind ?? inferEntityKind(type);
    switch (kind) {
      case 'line': return this.drawLine(entity);
      case 'circle': return this.drawCircle(entity);
      case 'arc': return this.drawArc(entity);
      case 'polyline': return this.drawPolyline(entity);
      case 'ellipse': return this.drawEllipse(entity);
      case 'text': return this.drawText(entity);
      case 'point': return this.drawPoint(entity);
      case 'insert': return this.drawInsert(entity, depth);
      case 'solid': return this.drawSolid(entity);
      case 'hatch': return this.drawHatch(entity);
      case 'spline': return this.drawSpline(entity);
      case 'path': return this.drawPath(entity);
      case 'image': return this.drawImage(entity);
      case 'viewport': return this.markSkipped(type);
      default:
        this.stats.unsupported[type] = (this.stats.unsupported[type] ?? 0) + 1;
        this.stats.skipped++;
        if (this.opts.showUnsupportedMarkers) this.drawUnsupportedMarker(entity);
    }
  }

  private beginStyledPath(entity: CadEntity, fill = false, applyLinePattern = true): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const color = resolveCadColor(entity, this.document, { foreground: this.opts.foreground, background: this.opts.background, trueColorByteOrder: this.opts.trueColorByteOrder, contrastMode: this.opts.contrastMode, minColorContrast: this.opts.minColorContrast });
    const fillColor = resolveFillColor(entity, this.document, { foreground: this.opts.foreground, background: this.opts.background, trueColorByteOrder: this.opts.trueColorByteOrder, contrastMode: this.opts.contrastMode, minColorContrast: this.opts.minColorContrast }) ?? color;
    ctx.strokeStyle = color;
    ctx.fillStyle = fill ? fillColor : color;
    ctx.globalAlpha = clamp(Number(entity.opacity ?? 1), 0, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const plotWeight=entityPlotStyle(entity,this.document)?.lineweight;
    const weight=plotWeight!==undefined?plotWeight*100:entity.lineweight&&entity.lineweight>0?entity.lineweight:this.lookupLayer(entity.layer)?.lineweight;
    const lineweightPixels = typeof weight === 'number' && weight > 0 ? (this.opts.paperScale?weight/100*this.opts.paperScale:weight/30) : 1;
    const worldWidthPixels = cadEntityWorldStrokeWidth(entity) * Math.abs(this.view.scale);
    ctx.lineWidth = Math.max((plotWeight!==undefined && this.opts.paperScale ? 0.1 : 1), Math.min(256, Math.max(lineweightPixels, Number.isFinite(worldWidthPixels) ? worldWidthPixels : 0)));
    const linePattern = applyLinePattern ? resolveCadLinePattern(entity, this.document) : undefined;
    ctx.setLineDash(linePattern
      ? linePattern.segments.map((length) => Math.max(0.05, length * this.view.scale))
      : []);
    ctx.beginPath();
  }

  private finishStroke(): void { this.ctx.stroke(); this.ctx.restore(); this.stats.drawn++; }
  private finishFillStroke(fill = false): void { if (fill) this.ctx.fill(); this.ctx.stroke(); this.ctx.restore(); this.stats.drawn++; }

  private drawLine(e: CadEntity): void {
    const start = e.startPoint;
    const end = e.endPoint;
    if (!isFinitePoint(start) || !isFinitePoint(end)) return this.markSkipped('LINE');
    const a=this.worldToScreen(start),b=this.worldToScreen(end),pad=130;if(Math.max(a.x,b.x)<-pad||Math.min(a.x,b.x)>this.cssWidth+pad||Math.max(a.y,b.y)<-pad||Math.min(a.y,b.y)>this.cssHeight+pad){this.stats.skipped++;return;}
    this.strokeWorldPolyline(e, [start, end], false);
  }

  private drawCircle(e: CadEntity): void {
    const center = e.center;
    const radius = Number(e.radius);
    if (!isFinitePoint(center) || !Number.isFinite(radius)) return this.markSkipped('CIRCLE');
    this.strokeWorldPolyline(e, this.pointsFor(e,()=>arcPoints(xy(center), radius, 0, Math.PI * 2, true)), true);
  }

  private drawArc(e: CadEntity): void {
    const center = e.center;
    const radius = Number(e.radius);
    const startAngle = Number(e.startAngle);
    const endAngle = Number(e.endAngle);
    if (!isFinitePoint(center) || !Number.isFinite(radius) || !Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return this.markSkipped('ARC');
    this.strokeWorldPolyline(e, this.pointsFor(e,()=>arcPoints(xy(center), radius, startAngle, endAngle, true)), false);
  }

  private drawPolyline(e: CadEntity): void {
    const vertices = (e.vertices ?? e.points) as Array<CadPoint3D & { bulge?: number }> | undefined;
    if (!Array.isArray(vertices) || vertices.length < 2) return this.markSkipped(String(e.type));
    const closed = isCadPolylineClosed(e);
    const pts: CadPoint2D[] = [];
    const pairs = closed ? vertices.length : vertices.length - 1;
    for (let i = 0; i < pairs; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % vertices.length];
      if (!isFinitePoint(p1) || !isFinitePoint(p2)) continue;
      const segment = bulgeToPolylinePoints(p1, p2, Number(p1.bulge ?? 0));
      if (pts.length > 0) segment.shift();
      pts.push(...segment);
    }
    this.strokeWorldPolyline(e, pts, closed);
  }

  private drawEllipse(e: CadEntity): void {
    const center = e.center;
    const major = e.majorAxisEndPoint;
    const ratio = Number(e.axisRatio ?? 1);
    if (!isFinitePoint(center) || !isFinitePoint(major)) return this.markSkipped('ELLIPSE');
    const pts = this.pointsFor(e,()=>ellipsePoints(center, major, ratio, Number(e.startAngle ?? 0), Number(e.endAngle ?? Math.PI * 2)));
    const closed = Math.abs(Number(e.endAngle ?? Math.PI * 2) - Number(e.startAngle ?? 0)) >= Math.PI * 2 - 1e-6;
    this.strokeWorldPolyline(e, pts, closed);
  }

  private drawPoint(e: CadEntity): void {
    const p = (e.point ?? e.location ?? e.center ?? e.insertionPoint) as CadPoint3D | undefined;
    if (!isFinitePoint(p)) return this.markSkipped('POINT');
    const s = this.worldToScreen(p);
    this.beginStyledPath(e);
    this.ctx.moveTo(s.x - 3, s.y);
    this.ctx.lineTo(s.x + 3, s.y);
    this.ctx.moveTo(s.x, s.y - 3);
    this.ctx.lineTo(s.x, s.y + 3);
    this.finishStroke();
  }

  private drawText(e: CadEntity): void {
    const aligned = (Number(e.halign ?? 0) !== 0 || Number(e.valign ?? 0) !== 0) && isFinitePoint(e.endPoint);
    const p = (aligned ? e.endPoint : e.insertionPoint ?? e.startPoint ?? e.center) as CadPoint3D | undefined;
    const text = stripMTextFormatting(String(e.text ?? e.value ?? ''));
    const height = Number(e.textHeight ?? e.height ?? 1);
    if (!isFinitePoint(p) || !text) return this.markSkipped(String(e.type));
    this.drawTextAt(e, p, text, height, Number(e.rotation ?? 0));
  }

  private drawInsert(e: CadEntity, depth: number): void {
    const block = this.lookupBlock(e.blockName ?? e.name);
    if (block && depth < this.opts.maxInsertDepth) {
      let children=this.insertCache.get(e);
      if(!children){const matrix=matrixFromInsert(e,block.basePoint??{x:0,y:0});children=[];
        for(const child of block.entities){
          if(child.type==='ATTDEF'&&e.attribs?.some(a=>a.attributeTag&&a.attributeTag===child.attributeTag))continue;
          const color=applyByBlockColorInheritance(child,e,this.document,{foreground:this.opts.foreground,background:this.opts.background,trueColorByteOrder:this.opts.trueColorByteOrder,contrastMode:this.opts.contrastMode,minColorContrast:this.opts.minColorContrast});
          children.push(transformEntity(applyByBlockLineTypeInheritance(color,e,this.document),matrix));
        }
        this.insertCache.set(e,children);
      }
      for(const child of children)this.drawEntityTracked(child,depth+1);
      for(const attr of e.attribs??[])this.drawEntityTracked(applyByBlockLineTypeInheritance(applyByBlockColorInheritance(attr,e,this.document,{foreground:this.opts.foreground,background:this.opts.background,contrastMode:this.opts.contrastMode}),e,this.document),depth+1);
      return;
    }
    const p = e.insertionPoint;
    if (!isFinitePoint(p)) return this.markSkipped('INSERT');
    const s = this.worldToScreen(p);
    this.beginStyledPath(e);
    const r = 5;
    this.ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
    this.finishStroke();
    if (Array.isArray(e.attribs)) for (const attr of e.attribs) this.drawText(attr);
  }

  private drawSolid(e: CadEntity): void {
    const rawVertices = (e.vertices ?? e.points) as CadPoint3D[] | undefined;
    const vertices=rawVertices?solidVertices(e.type,rawVertices):undefined;
    if (!Array.isArray(vertices) || vertices.length < 3) return this.markSkipped(String(e.type));
    if(e.type==='3DFACE'){
      this.beginStyledPath(e,false);const invisible=Number(e.flag??e.invisibleEdgeFlags??0);
      for(let i=0;i<vertices.length;i++){if(invisible&(1<<i))continue;const a=this.worldToScreen(vertices[i]),b=this.worldToScreen(vertices[(i+1)%vertices.length]);this.ctx.moveTo(a.x,a.y);this.ctx.lineTo(b.x,b.y);}this.finishStroke();return;
    }
    this.beginStyledPath(e, true);
    const first = this.worldToScreen(vertices[0]);
    this.ctx.moveTo(first.x, first.y);
    for (const vertex of vertices.slice(1)) {
      if (!isFinitePoint(vertex)) continue;
      const s = this.worldToScreen(vertex);
      this.ctx.lineTo(s.x, s.y);
    }
    this.ctx.closePath();
    this.finishFillStroke(true);
  }

  private drawHatch(e: CadEntity): void {
    let boundaries=this.hatchCache.get(e);if(!boundaries){boundaries=hatchBoundaries(e);this.hatchCache.set(e,boundaries);}const {loops}=boundaries;
    if(!loops.length)return this.markSkipped('HATCH');
    this.beginStyledPath(e,true,false);
    const ctx=this.ctx;
    for(const loop of loops){const first=this.worldToScreen(loop[0]);ctx.moveTo(first.x,first.y);for(const p of loop.slice(1)){const q=this.worldToScreen(p);ctx.lineTo(q.x,q.y);}ctx.closePath();}
    const rule:CanvasFillRule=Number(e.hatchStyle)===2?'nonzero':'evenodd';
    const solid=e.solidFill!==0;
    if(!solid && !(e.definitionLines as unknown[])?.length){ctx.stroke();ctx.restore();this.stats.drawn++;return;}
    if(solid){ctx.fill(rule);}else{
      ctx.clip(rule);
      const points=loops.flat(),bounds=points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
      const corners=[{x:bounds.minX,y:bounds.minY},{x:bounds.maxX,y:bounds.minY},{x:bounds.maxX,y:bounds.maxY},{x:bounds.minX,y:bounds.maxY}];
      let budget=20000;
      for(const line of (e.definitionLines??[]) as Array<{angle:number;base:{x:number;y:number};offset:{x:number;y:number};dashLengths?:number[]}>){
        const c=Math.cos(line.angle),s=Math.sin(line.angle),base=line.base??{x:0,y:0},offset=line.offset??{x:0,y:0},spacing=-s*offset.x+c*offset.y;
        if(!Number.isFinite(spacing)||Math.abs(spacing)<1e-10)continue;
        const perp=corners.map(p=>(-s*(p.x-base.x)+c*(p.y-base.y))/spacing),start=Math.floor(Math.min(...perp))-1,end=Math.ceil(Math.max(...perp))+1;
        // Dense patterns are sampled at screen resolution, with a fixed work limit.
        const stride=Math.max(1,Math.ceil(1/(Math.abs(spacing)*this.view.scale)),Math.ceil((end-start+1)/Math.max(1,budget)));
        for(let n=start;n<=end&&budget>0;n+=stride,budget--){
          const origin={x:base.x+n*offset.x,y:base.y+n*offset.y},along=corners.map(p=>c*(p.x-origin.x)+s*(p.y-origin.y)),lo=Math.min(...along)-1,hi=Math.max(...along)+1;
          const p=this.worldToScreen({x:origin.x+c*lo,y:origin.y+s*lo}),q=this.worldToScreen({x:origin.x+c*hi,y:origin.y+s*hi});
          ctx.beginPath();ctx.setLineDash((line.dashLengths??[]).map(d=>Math.max(.1,Math.abs(d)*this.view.scale)));ctx.lineDashOffset=-lo*this.view.scale;
          ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
        }
      }
    }
    ctx.restore();this.stats.drawn++;
  }

  private drawSpline(e: CadEntity): void {
    const points = e.fitPoints?.length ? e.fitPoints : e.controlPoints;
    if (!points || points.length < 2) return this.markSkipped('SPLINE');
    // Lightweight preview: draw fit/control polygon. A full NURBS evaluator can be added behind this normalized entity.
    this.strokeWorldPolyline(e, points, Boolean(e.isClosed));
  }

  private drawPath(e: CadEntity): void {
    if (!e.commands?.length) return this.markSkipped(String(e.type));
    this.beginStyledPath(e, Boolean(e.fillColor));
    this.addPathCommands(e.commands);
    this.finishFillStroke(Boolean(e.fillColor));
  }

  private addPathCommands(commands: CadPathCommand[]): void {
    for (const command of commands) {
      if (command.cmd === 'M') {
        const p = this.worldToScreen(command.points[0]);
        this.ctx.moveTo(p.x, p.y);
      } else if (command.cmd === 'L') {
        const p = this.worldToScreen(command.points[0]);
        this.ctx.lineTo(p.x, p.y);
      } else if (command.cmd === 'C') {
        const [p1, p2, p3] = command.points.map((p) => this.worldToScreen(p));
        this.ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      } else if (command.cmd === 'Q') {
        const [p1, p2] = command.points.map((p) => this.worldToScreen(p));
        this.ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      } else if (command.cmd === 'Z') this.ctx.closePath();
    }
  }

  private drawImage(e: CadEntity): void {
    const p = e.insertionPoint;
    if (!isFinitePoint(p)) return this.markSkipped(String(e.type));
    const w = Number(e.width ?? 32);
    const h = Number(e.height ?? 32);
    const a = this.worldToScreen(p);
    const b = this.worldToScreen({ x: p.x + w, y: p.y - h });
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const width = Math.abs(b.x - a.x);
    const height = Math.abs(b.y - a.y);
    const src = e.imageDataUrl;
    if (src) {
      const image = this.getImage(src);
      if (image.complete && image.naturalWidth > 0) {
        this.ctx.save();
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const u=e.imageU as CadPoint2D|undefined,v=e.imageV as CadPoint2D|undefined,size=e.imagePixelSize as CadPoint2D|undefined;
        if(u&&v&&size&&size.x>0&&size.y>0){
          const sx=u.x*size.x*this.view.scale,sy=-u.y*size.x*this.view.scale,tx=v.x*size.y*this.view.scale,ty=-v.y*size.y*this.view.scale;
          this.ctx.save();this.ctx.translate(a.x+tx,a.y+ty);this.ctx.transform(sx,sy,-tx,-ty,0,0);this.ctx.drawImage(image,0,0,1,1);this.ctx.restore();
        }else this.ctx.drawImage(image, x, y, width, height);
        this.ctx.restore();
        this.stats.drawn++;
        return;
      }
      image.onload = () => this.render();
    }
    if (!this.opts.showImagePlaceholders) return this.markSkipped(String(e.type));
    this.beginStyledPath(e);
    this.ctx.rect(x, y, width, height);
    this.ctx.moveTo(x, y); this.ctx.lineTo(x + width, y + height);
    this.ctx.moveTo(x + width, y); this.ctx.lineTo(x, y + height);
    this.finishStroke();
  }

  private getImage(src: string): HTMLImageElement {
    let image = this.imageCache.get(src);
    if (!image) {
      image = new Image();
      image.src = src;
      this.imageCache.set(src, image);
    }
    return image;
  }

  private drawUnsupportedMarker(e: CadEntity): void {
    const p = this.entityAnchor(e);
    if (!p) return;
    const s = this.worldToScreen(p);
    this.beginStyledPath(e);
    this.ctx.moveTo(s.x - 4, s.y - 4);
    this.ctx.lineTo(s.x + 4, s.y + 4);
    this.ctx.moveTo(s.x + 4, s.y - 4);
    this.ctx.lineTo(s.x - 4, s.y + 4);
    this.finishStroke();
  }

  private drawTextAt(e: CadEntity, p: CadPoint2D, text: string, height: number, rotation: number): void {
    const ctx = this.ctx;
    const s = this.worldToScreen(p);
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(s.x, s.y);
    ctx.rotate(-rotation);
    const generationFlag = Number(e.generationFlag ?? 0);
    const xScale = Number(e.xScale ?? e.fontWidthFactor ?? 1);
    ctx.scale((generationFlag & 2 ? -1 : 1) * (Number.isFinite(xScale) && Math.abs(xScale) > 1e-9 ? Math.abs(xScale) : 1), generationFlag & 4 ? -1 : 1);
    const pixelHeight = Math.abs(height) * this.view.scale;
    ctx.font = `${pixelHeight}px ${typeof e.fontFamily==='string'?JSON.stringify(e.fontFamily)+',':''} ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = resolveCadColor(e, this.document, { foreground: this.opts.foreground, background: this.opts.background, trueColorByteOrder: this.opts.trueColorByteOrder, contrastMode: this.opts.contrastMode, minColorContrast: this.opts.minColorContrast });
    ctx.globalAlpha = clamp(Number(e.opacity ?? 1), 0, 1);
    const mtext=e.type==='MTEXT',attachment=Number(e.attachmentPoint??1);
    const halign = mtext?(attachment-1)%3:Number(e.halign ?? 0);
    const valign = mtext?3:Number(e.valign ?? 0);
    ctx.textAlign = halign === 1 || halign === 4 ? 'center' : halign === 2 ? 'right' : 'left';
    ctx.textBaseline = valign === 1 ? 'bottom' : valign === 2 ? 'middle' : valign === 3 ? 'top' : 'alphabetic';
    const lines=wrapText(text,mtext?Number(e.rectWidth??e.width??0)*this.view.scale/Math.max(Math.abs(xScale),1e-9):0,t=>ctx.measureText(t).width),spacing=pixelHeight*1.22*Number(e.lineSpacing??1);
    const offset=mtext?(Math.floor((attachment-1)/3)===1?-(lines.length*spacing)/2:Math.floor((attachment-1)/3)===2?-lines.length*spacing:0):0;
    for (const [index,line]of lines.entries()) {
      const glyph=typeof e.fontFile==='string'&&/\.shx$/i.test(e.fontFile)?this.opts.shxGlyphResolver?.resolveText(line,e.fontFile):undefined;
      if(glyph?.polylines.length){
        const points=glyph.polylines.flat(),maxY=Math.max(...points.map(p=>p.y)),minY=Math.min(...points.map(p=>p.y)),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
        const k=pixelHeight/Math.max(maxY-minY,1e-6),dx=ctx.textAlign==='center'?-(maxX+minX)/2:ctx.textAlign==='right'?-maxX:-minX;
        const baseline=valign===1?minY:valign===2?(minY+maxY)/2:valign===3?maxY:0;
        ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1;ctx.beginPath();
        for(const path of glyph.polylines)path.forEach((p,i)=>{const x=(p.x+dx)*k,y=-(p.y-baseline)*k+offset+index*spacing;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
      }else ctx.fillText(line,0,offset+index*spacing);
    }
    ctx.restore();
    this.stats.drawn++;
  }

  private strokeWorldPolyline(e: CadEntity, points: CadPoint2D[], closed: boolean): void {
    const valid = points.filter(isFinitePoint);
    if (valid.length < 2) return this.markSkipped(String(e.type));
    const pattern = resolveCadLinePattern(e, this.document);
    if (pattern) {
      const primitives = createDashedCadPrimitives(valid, closed, pattern);
      const fallbackDots = [...primitives.dots];
      this.beginStyledPath(e, false, false);
      for (const [start, end] of primitives.segments) {
        const a = this.worldToScreen(start);
        const b = this.worldToScreen(end);
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
      }
      for (const marker of primitives.markers ?? []) {
        const glyph = this.resolveLineTypeGlyph(marker);
        if (!glyph) continue;
        removeMatchingPoint(fallbackDots, marker.fallbackPoint);
        for (const polyline of transformCadLineTypeGlyph(marker, glyph)) {
          if (polyline.length < 2) continue;
          const first = this.worldToScreen(polyline[0]);
          this.ctx.moveTo(first.x, first.y);
          for (const point of polyline.slice(1)) {
            const screen = this.worldToScreen(point);
            this.ctx.lineTo(screen.x, screen.y);
          }
        }
      }
      this.ctx.stroke();
      if (fallbackDots.length > 0) {
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        const radius = Math.max(0.5, this.ctx.lineWidth / 2);
        for (const point of fallbackDots) {
          const screen = this.worldToScreen(point);
          this.ctx.moveTo(screen.x + radius, screen.y);
          this.ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        }
        this.ctx.fillStyle = this.ctx.strokeStyle;
        this.ctx.fill();
      }
      this.ctx.restore();
      this.stats.drawn++;
      return;
    }
    this.beginStyledPath(e);
    const first = this.worldToScreen(valid[0]);
    this.ctx.moveTo(first.x, first.y);
    for (const point of valid.slice(1)) {
      const s = this.worldToScreen(point);
      this.ctx.lineTo(s.x, s.y);
    }
    if (closed) this.ctx.closePath();
    this.finishStroke();
  }

  private resolveLineTypeGlyph(marker: CadLineTypeMarker): CadShxGlyph | undefined {
    return marker.kind === 'shape'
      ? this.opts.shxGlyphResolver.resolveShape(Number(marker.shapeNumber), marker.fontName)
      : this.opts.shxGlyphResolver.resolveText(String(marker.text ?? ''), marker.fontName);
  }

  private markSkipped(type: string): void {
    this.stats.skipped++;
    this.stats.unsupported[type] = this.stats.unsupported[type] ?? 0;
  }

  private entityAnchor(e: CadEntity): CadPoint2D | undefined {
    for (const key of ['startPoint', 'insertionPoint', 'center', 'point', 'location']) {
      const p = e[key];
      if (isFinitePoint(p)) return xy(p);
    }
    if (Array.isArray(e.vertices) && isFinitePoint(e.vertices[0])) return xy(e.vertices[0]);
    if (Array.isArray(e.commands) && e.commands.length) {
      const cmd = e.commands.find((item) => item.points.length > 0);
      if (cmd) return xy(cmd.points[0]);
    }
    return undefined;
  }

  private lookupLayer(name: string | undefined) {
    if (!this.document || !name) return undefined;
    return this.document.layers[name] ?? this.document.layers[name.toLowerCase()] ?? Object.values(this.document.layers).find((layer) => layer.name.toLowerCase() === name.toLowerCase());
  }

  private lookupBlock(name: string | undefined): CadBlock | undefined {
    if (!this.document || !name) return undefined;
    return this.document.blocks[name] ?? this.document.blocks[name.toLowerCase()] ?? Object.values(this.document.blocks).find((block) => block.name.toLowerCase() === name.toLowerCase());
  }

  private clampScale(value: number): number {
    return Math.min(this.opts.maxScale, Math.max(this.opts.minScale, value));
  }

  private boundsOptions() {
    return { maxInsertDepth: this.opts.maxInsertDepth, maxCurveSegments: this.opts.maxCurveSegments };
  }

  private emitViewChange(): void {
    this.onViewChange?.({
      view: this.getViewState(),
      fitScale: this.fitScale,
      zoomRatio: this.getZoomRatio(),
      zoomPercent: this.getZoomPercent(),
      bounds: this.getBounds()
    });
  }
}

function cloneStats(stats: RenderStats): RenderStats {
  return {
    total: stats.total,
    drawn: stats.drawn,
    skipped: stats.skipped,
    byType: { ...stats.byType },
    unsupported: { ...stats.unsupported },
    renderElapsedMs: stats.renderElapsedMs,
    backend: stats.backend,
    primitiveCount: stats.primitiveCount,
    visiblePrimitiveCount: stats.visiblePrimitiveCount,
    culledPrimitiveCount: stats.culledPrimitiveCount,
    gpuMemoryBytes: stats.gpuMemoryBytes,
    buildElapsedMs: stats.buildElapsedMs
  };
}

function removeMatchingPoint(points: CadPoint2D[], target: CadPoint2D): void {
  const extent = Math.max(1, Math.abs(target.x), Math.abs(target.y));
  const tolerance = Math.max(1e-9, extent * 1e-12);
  const index = points.findIndex((point) => Math.hypot(point.x - target.x, point.y - target.y) <= tolerance);
  if (index >= 0) points.splice(index, 1);
}

