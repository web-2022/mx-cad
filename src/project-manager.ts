import type { Blocks } from './block-data';
import type { MixedInput } from './mixed-types';
import { readProject, writeProject, modelFile, type ProjectEntry } from './project-data';
import { blockBounds } from './mixed-coordinates';
import { sheetsOf } from './drawing-spaces';
import { combineCad } from './project-cad';
import type { CadDocument } from './vendor/cad/core/types';
interface Adapter {
    locked?(busy:boolean):void;
    open(file: File, companions: File[], state: any): Promise<boolean>;
    context?(): {
        mixed?: any;
    };
    capture(): {
        state: any;
        doc?: CadDocument;
        blocks?: Blocks;
        info?: any;
    };
    restore(state: any, resources: File[]): Promise<void>;
    combined(doc: CadDocument, state?: any): void;
    mixed(input: MixedInput, state?: any): Promise<void>;
    fileVisibility?(id: string, visible: boolean): boolean;
    fileAppearance?(id: string, color: string | undefined, opacity: number): void;
    selectItem?(id: number): void;
    inspect?(): void;
    fit?(id: string): void;
    layer?(id: string, name: string, visible: boolean): void;
    space?(id: string): void;
    clear(): void;
    notice(message: string, error?: boolean): void;
    light(): boolean;
    background(light: boolean): void;
}
export class ProjectManager {
    entries: ProjectEntry[] = [];
    active?: string;
    private infos = new Map<string, any>();
    private infoCache = new WeakMap<Blocks, string>();
    private selected?: string;
    private saved = '';
    private busy = false;
    private composite = false;
    private compositeState: any = null;
    private docs = new Map<string, CadDocument>();
    private models = new Map<string, Blocks>();
    constructor(private adapter: Adapter) {
        document.getElementById('project-menu')!.onclick = () => { if(this.busy)return;this.render(); (document.getElementById('project-dialog') as HTMLDialogElement).showModal(); };
        document.getElementById('project-close')!.onclick = () => this.close();
        document.getElementById('project-save')!.onclick = () => void this.save();
        document.getElementById('project-open')!.onclick = () => { this.close(); document.getElementById('project-input')!.click(); };
        (document.getElementById('project-input') as HTMLInputElement).onchange = e => {
            const input = e.target as HTMLInputElement, f = input.files?.[0];
            input.value = '';
            if (f)
                void this.load(f);
        };
        document.getElementById('collapse-left')!.onclick = () => { document.querySelector('.shell')!.classList.add('left-collapsed'); document.getElementById('expand-left')!.hidden = false; };
        document.getElementById('expand-left')!.onclick = () => { document.querySelector('.shell')!.classList.remove('left-collapsed', 'panels-hidden'); document.getElementById('panel-toggle')!.setAttribute('aria-pressed', 'false'); document.getElementById('expand-left')!.hidden = true; };
        document.getElementById('collapse-right')!.onclick = () => { document.querySelector('.shell')!.classList.add('right-collapsed'); document.getElementById('expand-right')!.hidden = false; };
        document.getElementById('expand-right')!.onclick = () => { document.querySelector('.shell')!.classList.remove('right-collapsed', 'panels-hidden'); document.getElementById('panel-toggle')!.setAttribute('aria-pressed', 'false'); document.getElementById('expand-right')!.hidden = true; };
        this.render();
    }
    private close() { (document.getElementById('project-dialog') as HTMLDialogElement).close(); }
    private snapshot() {
        if (this.composite) {
            this.compositeState = JSON.parse(JSON.stringify(this.adapter.capture().state));
            const id = this.compositeState?.mixed?.active, e = this.entries.find(e => e.id === id);
            if (e)
                e.state = { ...e.state, block: this.compositeState.block };
            return;
        }
        if (!this.active)
            return;
        const e = this.entries.find(e => e.id === this.active);
        if (!e)
            return;
        const snapshot = this.adapter.capture();
        e.state = JSON.parse(JSON.stringify(snapshot.state));
        if (snapshot.doc)
            this.docs.set(e.id, { ...snapshot.doc, raw: undefined });
        if (snapshot.blocks)
            this.models.set(e.id, snapshot.blocks);
        if (snapshot.info)
            this.infos.set(e.id, snapshot.info);
    }
    resource(file: File) {
        const e = this.entries.find(e => e.id === this.active);
        if (e && !this.composite) {
            e.resources = e.resources.filter(f => f.name.toLowerCase() !== file.name.toLowerCase());
            e.resources.push(file);
        }
    }
    reset() { this.entries = []; this.active = undefined; this.selected = undefined; this.composite = false; this.compositeState = null; this.docs.clear(); this.models.clear(); this.infos.clear(); this.render(); }
    async add(files: File[]) {
        if (this.busy)
            return;
        const project = files.find(f => /\.mxproject$/i.test(f.name));
        if (project) {
            if (files.length !== 1) {
                this.adapter.notice('Abre un proyecto MX CAD por vez.', true);
                return;
            }
            await this.load(project);
            return;
        }
        const models = files.filter(f => modelFile(f.name));
        if (this.entries.length + models.length > 100) {
            this.adapter.notice('Un proyecto admite hasta 100 modelos.', true);
            return;
        }
        if (!models.length) {
            this.adapter.notice('Selecciona archivos DWG, DXF, IFC, GLB/glTF o modelos de bloques compatibles.', true);
            return;
        }
        this.busy = true;
        this.close();
        this.snapshot();
        const previousIDs = new Set(this.entries.map(e => e.id)), captured = this.adapter.capture().state, previousScene = this.composite ? structuredClone(this.compositeState) : captured?.worldOrigin ? structuredClone(captured) : undefined, previousActive = this.active;
        try {
            const added:ProjectEntry[]=[];
            for (const file of models) {
                const e: ProjectEntry = { id: crypto.randomUUID(), file, companions: files.filter(f => !modelFile(f.name)), resources: [], state: null, visible: true, opacity: 1 };
                this.entries.push(e);
                if (!await this.activate(e)) {
                    this.entries = this.entries.filter(x => x !== e);
                }else added.push(e);
            }
            if(!added.length)return;
            if (this.entries.filter(e => /\.(dwg|dxf|dm|dmx|csv|txt|tsv)$/i.test(e.file.name)).length > 1) {
                if (!await this.combine(true, undefined, previousScene)) {
                    const all = this.entries, selection = this.selected;
                    this.entries = all.filter(e => previousIDs.has(e.id));
                    if (previousScene && this.entries.length > 1)
                        await this.combine(true, undefined, previousScene);
                    else if (previousActive) {
                        const previous = this.entries.find(e => e.id === previousActive);
                        if (previous)
                            await this.activate(previous);
                    }
                    this.entries = all;
                    this.selected = selection;
                    this.adapter.notice('El archivo permanece en el árbol para consulta individual. No se pudo añadir a la escena: comprueba unidades y avisos del archivo.', true);
                }
            }
            else if (previousActive && models.every(f => /\.(ifc|glb|gltf)$/i.test(f.name))) {
                const selected = this.selected;
                await this.activate(this.entries.find(e => e.id === previousActive)!);
                this.selected = selected;
                this.adapter.notice('Archivo añadido al árbol. IFC/GLB/glTF se consultan con Abrir individualmente; la escena anterior se conserva.');
            }
        }
        catch (error) {
            this.adapter.notice(String(error), true);
        }
        finally {
            this.busy = false;
            this.render();
        }
    }
    private async activate(e: ProjectEntry) {
        this.snapshot();
        if (!await this.adapter.open(e.file, e.companions, e.state))
            return false;
        this.active = e.id;
        this.selected = e.id;
        this.composite = false;
        if (e.state?.kind === 'model')
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await this.adapter.restore(e.state, e.resources);
        this.adapter.fileVisibility?.(e.id, e.visible);
        this.snapshot();
        this.render();
        return true;
    }
    async select(id: string) {
        if (this.busy)
            return;
        const e = this.entries.find(e => e.id === id);
        if (!e)
            return;
        this.busy = true;
        this.close();
        this.render();
        try {
            await this.activate(e);
        }
        catch (error) {
            this.adapter.notice('No se restauró todo el estado: ' + String(error), true);
        }
        finally {
            this.busy = false;
            this.render();
        }
    }
    async remove(id: string) {
        if (this.busy)
            return;
        this.snapshot();
        const index = this.entries.findIndex(e => e.id === id);
        if (index < 0)
            return;
        const wasActive = this.active === id, preserve = this.composite ? this.adapter.capture().state : undefined, shared = /\.(dwg|dxf|dm|dmx|csv|txt|tsv)$/i.test(this.entries[index].file.name);
        this.entries.splice(index, 1);
        this.docs.delete(id);
        this.models.delete(id);
        this.infos.delete(id);
        if (this.selected === id)
            this.selected = this.entries[Math.min(index, this.entries.length - 1)]?.id;
        if (wasActive || this.composite && shared) {
            this.active = undefined;
            this.composite = false;
            if (this.entries.length) {
                if (this.entries.some(e => /\.(dwg|dxf|dm|dmx|csv|txt|tsv)$/i.test(e.file.name)))
                    await this.combine(false, undefined, preserve);
                else
                    await this.select(this.entries[Math.min(index, this.entries.length - 1)].id);
            }
            else
                this.adapter.clear();
        }
        this.render();
    }
    async combine(force = false, activeID?: string, preserve?: any) {
        if (this.busy && !force)
            return;
        this.close();
        this.busy = true;
        this.snapshot();
        this.render();
        try {
            const cad = this.entries.filter(e => /\.(dwg|dxf)$/i.test(e.file.name)), blocks = this.entries.filter(e => /\.(dm|dmx|csv|txt|tsv)$/i.test(e.file.name));
            for (const e of [...cad, ...blocks])
                if (!this.docs.has(e.id) && !this.models.has(e.id) && !await this.activate(e))
                    throw Error('No se pudo leer ' + e.file.name);
            this.snapshot();
            if (blocks.length) {
                const requested = activeID ?? this.compositeState?.mixed?.active ?? this.active, active = blocks.some(e => e.id === requested) ? requested : blocks[0].id;
                const input: MixedInput = { active, cad: cad.map(e => ({ id: e.id, name: e.label ?? e.file.name, doc: this.docs.get(e.id)!, opacity: e.opacity, color: e.color })), blocks: blocks.map(e => ({ id: e.id, name: e.label ?? e.file.name, model: this.models.get(e.id)!, state: e.state, opacity: e.opacity, color: e.color })) };
                await this.adapter.mixed(input, preserve);
                const state = this.adapter.capture().state;
                if (state?.mixed) {
                    for (const e of [...cad, ...blocks])
                        if (state.mixed.settings[e.id])
                            state.mixed.settings[e.id].visible = e.visible;
                    await this.adapter.restore(state, []);
                }
                this.adapter.notice('Vista conjunta: CAD y bloques en una sola escena. Usa las casillas del árbol para controlar cada archivo. IFC/GLB se siguen consultando individualmente.');
            }
            else {
                const doc = combineCad(cad.map(entry => ({ entry: { ...entry, visible: true, color: undefined, opacity: 1 }, doc: this.docs.get(entry.id)! })));
                doc.metadata.mxProjectStyles = Object.fromEntries(cad.map(e => [e.id, { color: e.color, opacity: e.opacity }]));
                this.adapter.combined(doc, preserve);
                for (const e of cad)
                    if (!e.visible)
                        this.adapter.fileVisibility?.(e.id, false);
                this.adapter.notice('Vista conjunta CAD: Model en coordenadas originales. Los Layouts y la edición se consultan en cada archivo.' + (doc.warnings.some(w => w.startsWith('Unidades no declaradas')) ? ' Aviso: hay archivos sin unidades declaradas; compruébalas antes de comparar.' : ''));
            }
            this.composite = true;
            this.active = undefined;
            this.selected = activeID ?? this.selected ?? this.entries[0]?.id;
            return true;
        }
        catch (error) {
            this.adapter.notice(String(error), true);
            return false;
        }
        finally {
            this.busy = false;
            this.render();
        }
    }
    changeActiveBlock(id: string) {
        if (this.busy)
            return;
        const state = this.adapter.capture().state;
        void this.combine(false, id, state);
    }
    private async save() {
        if (this.busy || !this.entries.length)
            return;
        this.busy = true;
        this.snapshot();
        this.render();
        try {
            const text = await writeProject(this.entries, this.active, this.adapter.light(), this.composite, this.composite ? this.compositeState : null, { selected: this.selected, rightCollapsed: document.querySelector('.shell')!.classList.contains('right-collapsed'), leftCollapsed: document.querySelector('.shell')!.classList.contains('left-collapsed') }), url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
            a.href = url;
            a.download = 'proyecto.mxproject';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.saved = this.fingerprint();
            this.adapter.notice('Proyecto descargado con sus archivos originales y ajustes locales. Puede contener información privada; compártelo solo si corresponde.');
        }
        catch (error) {
            this.adapter.notice(String(error), true);
        }
        finally {
            this.busy = false;
            this.render();
        }
    }
    async load(file: File) {
        if (this.busy)
            return;
        if (!await this.confirmReplace())
            return;
        this.busy = true;
        this.snapshot();
        this.render();
        let viewChanged = false;
        const previous = { entries: this.entries, active: this.active, docs: this.docs, models: this.models, infos: this.infos, selected: this.selected, composite: this.composite, state: this.compositeState };
        try {
            if (file.size > 192 * 1024 * 1024)
                throw Error('Proyecto demasiado grande.');
            const p = await readProject(await file.text());
            this.entries = p.entries;
            this.active = undefined;
            this.docs = new Map();
            this.models = new Map();
            this.infos = new Map();
            this.composite = false;
            const e = this.entries.find(e => e.id === p.active) ?? this.entries[0];
            viewChanged = true;
            if (!await this.activate(e))
                throw Error('No se pudo abrir el archivo activo del proyecto.');
            this.selected = this.entries.some(x => x.id === p.ui?.selected) ? p.ui.selected : this.active;
            if (this.selected)
                document.querySelector('.shell')!.classList.add('has-project-selection');
            document.querySelector('.shell')!.classList.toggle('left-collapsed', p.ui?.leftCollapsed === true);
            document.getElementById('expand-left')!.hidden = p.ui?.leftCollapsed !== true;
            document.querySelector('.shell')!.classList.toggle('right-collapsed', p.ui?.rightCollapsed === true);
            document.getElementById('expand-right')!.hidden = p.ui?.rightCollapsed !== true;
            this.adapter.background(p.light);
            this.adapter.notice('Proyecto local restaurado. Los formatos compatibles se reúnen automáticamente.');
            if (p.combined) {
                await this.combine(true, p.combinedState?.mixed?.active, p.combinedState);
                if (this.composite && p.combinedState)
                    await this.adapter.restore(p.combinedState, []);
            }
            this.saved = this.fingerprint();
        }
        catch (error) {
            this.entries = previous.entries;
            this.active = previous.active;
            this.docs = previous.docs;
            this.models = previous.models;
            this.infos = previous.infos;
            this.selected = previous.selected;
            this.composite = previous.composite;
            if (viewChanged) {
                const old = this.entries.find(e => e.id === previous.active);
                try {
                    if (old && await this.adapter.open(old.file, old.companions, old.state)) {
                        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
                        await this.adapter.restore(old.state, old.resources);
                    }
                    else if (previous.composite && previous.state?.mixed) {
                        this.composite = false;
                        await this.combine(true, previous.state.mixed.active, previous.state);
                        await this.adapter.restore(previous.state, []);
                    }
                    else if (previous.composite)
                        this.adapter.combined(combineCad(this.entries.filter(e => e.visible && this.docs.has(e.id)).map(entry => ({ entry, doc: this.docs.get(entry.id)! }))));
                }
                catch {
                    this.adapter.notice('No se pudo restaurar la vista anterior. Los archivos del proyecto se conservaron.', true);
                }
            }
            this.adapter.notice('No se abrió el proyecto: ' + String(error), true);
        }
        finally {
            this.busy = false;
            this.render();
        }
    }
    private fingerprint() { this.snapshot(); return JSON.stringify(this.entries.map(e => ({ id: e.id, label: e.label, visible: e.visible, opacity: e.opacity, color: e.color, state: e.state }))); }
    private async confirmReplace() {
        if (!this.entries.length || this.fingerprint() === this.saved)
            return true;
        const dialog = document.getElementById('new-project-dialog') as HTMLDialogElement;
        const action = await new Promise<string>(resolve => {
            dialog.oncancel = () => resolve('cancel');
            for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-new]'))
                button.onclick = () => { dialog.close(); resolve(button.dataset.new!); };
            dialog.showModal();
        });
        if (action === 'cancel')
            return false;
        if (action === 'save') {
            await this.save();
            return this.fingerprint() === this.saved;
        }
        return true;
    }
    async newProject() {
        if (this.busy || !await this.confirmReplace())
            return;
        this.adapter.clear();
        this.reset();
        this.saved = '';
    }
    private inspect(e: ProjectEntry) { this.adapter.inspect?.(); this.selected = e.id; document.querySelector('.shell')!.classList.add('has-selection', 'has-project-selection'); this.render(false); }
    render(rebuildTree = true) {
        this.adapter.locked?.(this.busy);
        const host = document.getElementById('project-tree')!;
        if (rebuildTree)
            host.replaceChildren();
        const button = (text: string, action: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.disabled = this.busy; b.onclick = action; return b; };
        if (rebuildTree) {
            if (!this.composite && this.entries.length > 1)
                host.append(button('Volver a la escena del proyecto', () => void this.combine()));
            for (const e of this.entries) {
                const branch = document.createElement('details');
                branch.open = !!e.expanded;
                branch.className = 'file-branch';
                branch.dataset.file = e.id;
                branch.classList.toggle('selected', e.id === this.selected);
                branch.classList.toggle('file-hidden', !e.visible);
                branch.ontoggle = () => { const changed = e.expanded !== branch.open; e.expanded = branch.open; if (changed && branch.open) {
                    const focused = document.activeElement === summary;
                    this.render();
                    if (focused)
                        document.querySelector<HTMLElement>('[data-file="' + CSS.escape(e.id) + '"]>summary')?.focus({ preventScroll: true });
                } };
                const summary = document.createElement('summary');
                summary.setAttribute('role', 'treeitem');
                summary.setAttribute('aria-selected', String(e.id === this.selected));
                const visible = document.createElement('input');
                visible.type = 'checkbox';
                visible.checked = e.visible;
                visible.disabled = this.busy;
                visible.setAttribute('aria-label', 'Mostrar archivo ' + (e.label ?? e.file.name));
                visible.onclick = event => event.stopPropagation();
                visible.onchange = () => void this.visibility(e, visible.checked);
                summary.append(visible, button('▣ ' + (e.label ?? e.file.name), () => this.inspect(e)));
                if (/\.(ifc|glb|gltf)$/i.test(e.file.name)) {
                    const badge = document.createElement('span');
                    badge.className = 'badge';
                    badge.textContent = 'Individual';
                    badge.title = 'Este formato no se superpone con CAD y bloques; abre su vista individual.';
                    summary.append(badge);
                }
                branch.append(summary);
                if (!e.expanded) {
                    host.append(branch);
                    continue;
                }
                const doc = this.docs.get(e.id), model = this.models.get(e.id);
                if (doc) {
                    const section = document.createElement('details');
                    const title = document.createElement('summary');
                    title.textContent = 'Capas CAD · ' + Object.keys(doc.layers).length;
                    section.append(title);
                    for (const [key, layer] of Object.entries(doc.layers)) {
                        const row = document.createElement('div');
                        row.className = 'tree-layer';
                        const toggle = document.createElement('input');
                        toggle.type = 'checkbox';
                        toggle.checked = layer.isVisible !== false && !layer.isFrozen;
                        toggle.setAttribute('aria-label', 'Mostrar capa ' + key + ' de ' + (e.label ?? e.file.name));
                        toggle.onchange = () => {
                            layer.isVisible = toggle.checked;
                            layer.isFrozen = false;
                            e.state = { ...e.state, layers: Object.entries(doc.layers).map(([key, l]) => ({ key, visible: l.isVisible !== false, frozen: !!l.isFrozen })) };
                            if (this.composite || this.active === e.id)
                                this.adapter.layer?.(e.id, key, toggle.checked);
                        };
                        row.append(toggle, button(key, () => { this.inspect(e); const info = document.getElementById('project-properties')!; const label = document.createElement('p'); label.textContent = 'Capa: ' + key + ' · ' + (layer.isVisible === false ? 'Oculta' : 'Visible') + ' · Color: ' + String(layer.color ?? 'BYLAYER'); info.append(label); }));
                        section.append(row);
                    }
                    branch.append(section);
                    const spaces = document.createElement('details'), label = document.createElement('summary');
                    label.textContent = 'Model y Layouts';
                    spaces.append(label, button('Model', () => void this.openSpace(e, 'model')));
                    for (const sheet of sheetsOf(doc))
                        spaces.append(button(sheet.name, () => void this.openSpace(e, sheet.id)));
                    branch.append(spaces);
                }
                if (model) {
                    for (const title of ['Atributos (' + model.columns.length + ')', 'Filtros, leyendas y cortes']) {
                        const section = document.createElement('details'), heading = document.createElement('summary');
                        heading.textContent = title;
                        section.append(heading);
                        if (title.startsWith('Atributos')) {
                            const names = document.createElement('p');
                            names.textContent = model.columns.map(c => c.name).join(' · ');
                            section.append(names);
                        }
                        else
                            section.append(button('Editar este modelo', () => {
                                this.inspect(e);
                                if (this.composite)
                                    this.changeActiveBlock(e.id);
                                else
                                    void this.select(e.id);
                            }));
                        branch.append(section);
                    }
                }
                if (!doc && !model) {
                    const info = this.infos.get(e.id);
                    if (info?.items?.length) {
                        const section = document.createElement('details'), title = document.createElement('summary');
                        title.textContent = 'Elementos BIM · ' + info.count;
                        section.append(title);
                        for (const item of info.items)
                            section.append(button(item.name, () => {
                                if (this.active === e.id) {
                                    this.inspect(e);
                                    this.adapter.selectItem?.(item.id);
                                }
                                else
                                    void this.select(e.id).then(() => this.adapter.selectItem?.(item.id));
                            }));
                        if (info.count > 500) {
                            const note = document.createElement('p');
                            note.textContent = 'Primeros 500 elementos. Abre el archivo individualmente para buscar en todos.';
                            section.append(note);
                        }
                        branch.append(section);
                    }
                    branch.append(button('Consultar individualmente', () => void this.select(e.id)));
                }
                host.append(branch);
            }
        }
        else {
            for (const branch of host.querySelectorAll<HTMLElement>('[data-file]')) {
                const selected = branch.dataset.file === this.selected;
                branch.classList.toggle('selected', selected);
                branch.querySelector('summary')?.setAttribute('aria-selected', String(selected));
            }
        }
        const panel = document.getElementById('project-properties')!;
        panel.replaceChildren();
        const selected = this.entries.find(e => e.id === this.selected);
        if (!selected)
            document.querySelector('.shell')!.classList.remove('has-project-selection');
        const tools = document.getElementById('model-tools')!;
        const scene = this.adapter.context?.() ?? this.adapter.capture().state;
        tools.hidden = !!selected && selected.id !== (scene?.mixed?.active ?? this.active);
        document.getElementById('cad-edit-tools')!.hidden = this.composite || !!selected && selected.id !== this.active;
        const legacy = document.querySelector<HTMLElement>('.properties>.panel-content');
        if (legacy)
            legacy.hidden = !!selected && selected.id !== this.active;
        if (selected) {
            const e = selected, doc = this.docs.get(e.id), model = this.models.get(e.id), heading = document.createElement('h2');
            heading.textContent = e.label ?? e.file.name;
            panel.append(heading);
            const info = document.createElement('p');
            info.textContent = (e.file.name.split('.').pop() ?? '').toUpperCase() + ' · ' + (model?.units ?? doc?.units ?? 'Unidades no declaradas') + ' · ' + (model ? model.count + ' bloques' : doc ? doc.entities.length + ' entidades' : this.infos.has(e.id) ? this.infos.get(e.id).count + ' elementos' : 'Consulta individual') + ' · ' + (e.visible ? 'Visible' : 'Oculto');
            panel.append(info);
            if (doc) {
                const min = doc.header?.EXTMIN ?? doc.header?.$EXTMIN, max = doc.header?.EXTMAX ?? doc.header?.$EXTMAX;
                const xyz = (p: any) => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k])) ? [p.x, p.y, p.z] : undefined;
                const a = xyz(min), b = xyz(max), bounds = document.createElement('p');
                bounds.textContent = a && b ? 'Límites XYZ declarados: ' + a.join(', ') + ' → ' + b.join(', ') : 'Límites XYZ: no disponibles en los metadatos del lector.';
                panel.append(bounds);
            }
            const declared = this.infos.get(e.id)?.bounds;
            if (declared) {
                const bounds = document.createElement('p');
                bounds.textContent = 'Límites XYZ de origen: ' + declared.min.join(', ') + ' → ' + declared.max.join(', ');
                panel.append(bounds);
            }
            if (model) {
                const limits = document.createElement('p');
                let text = this.infoCache.get(model);
                if (!text) {
                    const box = blockBounds(model);
                    text = 'Límites XYZ del modelo: ' + box.min.map(n => n.toFixed(3)).join(', ') + ' → ' + box.max.map(n => n.toFixed(3)).join(', ');
                    this.infoCache.set(model, text);
                }
                limits.textContent = text;
                panel.append(limits);
            }
            if (model && this.composite && e.id !== scene?.mixed?.active)
                panel.append(button('Editar filtros, leyendas y cortes', () => this.changeActiveBlock(e.id)));
            if (scene?.mixed?.settings[e.id] || this.composite && doc) {
                const label = document.createElement('label');
                label.textContent = 'Opacidad visual de superficies ';
                const opacity = document.createElement('input');
                opacity.type = 'range';
                opacity.min = '0';
                opacity.max = '1';
                opacity.step = '.05';
                opacity.value = String(scene?.mixed?.settings[e.id]?.opacity ?? e.opacity);
                opacity.setAttribute('aria-label', 'Opacidad de ' + (e.label ?? e.file.name));
                opacity.oninput = () => { e.opacity = Number(opacity.value); void this.appearance(e); };
                label.append(opacity);
                const color = document.createElement('input');
                color.type = 'color';
                color.value = e.color ?? '#ffffff';
                color.setAttribute('aria-label', 'Color visual de ' + (e.label ?? e.file.name));
                color.onchange = () => { e.color = color.value; void this.appearance(e); };
                panel.append(label, color, button('Color original', () => { e.color = undefined; color.value = '#ffffff'; void this.appearance(e); }));
            }
            const rename = document.createElement('input');
            rename.value = e.label ?? e.file.name;
            rename.maxLength = 512;
            rename.setAttribute('aria-label', 'Nombre mostrado');
            rename.onchange = () => {
                if (rename.value.trim())
                    e.label = rename.value.trim();
                this.render();
            };
            panel.append(rename, button('Ajustar al archivo', () => {
                if (this.composite || this.active === e.id)
                    this.adapter.fit?.(e.id);
                else
                    void this.select(e.id).then(() => this.adapter.fit?.(e.id));
            }), button('Ajustar toda la escena', () => document.getElementById('fit')!.click()), button('Abrir individualmente', () => void this.select(e.id)), button('Quitar del proyecto', () => void this.remove(e.id)));
            const note = document.createElement('p');
            note.className = 'small-note';
            note.textContent = 'El nombre mostrado y la visibilidad son ajustes del proyecto. El archivo original no se modifica. Los controles de filtros pertenecen al modelo activo indicado.';
            panel.append(note);
        }
        document.getElementById('project-count')!.textContent = String(this.entries.length);
        document.getElementById('stat-files')!.textContent = String(this.entries.length);
        document.getElementById('file-count')!.textContent = this.entries.length + ' archivo(s) en proyecto';
        (document.getElementById('project-save') as HTMLButtonElement).disabled = this.busy || !this.entries.length;
        (document.getElementById('project-open') as HTMLButtonElement).disabled = this.busy;
    }
    entitySelection(detail?: any) { this.selected = this.entries.some(e => e.id === detail?.fileID) ? detail.fileID : undefined; this.render(false); if (detail) {
        const pre = document.createElement('pre');
        pre.className = 'picked-properties';
        pre.textContent = JSON.stringify({ archivo: detail.name, atributos: detail.attributes ?? {}, coordenadasOriginales: detail.worldPoint }, null, 2);
        document.getElementById('project-properties')!.append(pre);
    } }
    private async openSpace(e: ProjectEntry, id: string) { await this.select(e.id); this.adapter.space?.(id); }
    private async appearance(e: ProjectEntry) {
        if (this.adapter.context && !this.adapter.context().mixed) {
            this.adapter.fileAppearance?.(e.id, e.color, e.opacity);
            return;
        }
        const state = this.adapter.capture().state;
        if (!state?.mixed?.settings[e.id]) {
            this.adapter.fileAppearance?.(e.id, e.color, e.opacity);
            return;
        }
        Object.assign(state.mixed.settings[e.id], { opacity: e.opacity, color: e.color ?? null });
        await this.adapter.restore(state, []);
        this.compositeState = state;
    }
    private async visibility(e: ProjectEntry, visible: boolean) {
        e.visible = visible;
        if (!this.composite && this.active && this.active !== e.id) {
            this.render();
            return;
        }
        const state = this.adapter.capture().state;
        if (this.composite && state?.mixed?.settings[e.id]) {
            state.mixed.settings[e.id].visible = visible;
            await this.adapter.restore(state, []);
            this.compositeState = state;
            this.render();
        }
        else if (this.composite && /\.(ifc|glb|gltf)$/i.test(e.file.name)) {
            this.render();
        }
        else if ((this.composite || this.active === e.id) && this.adapter.fileVisibility?.(e.id, visible)) {
            this.render();
        }
        else if (this.entries.some(x => x.visible)) {
            await this.combine();
        }
        else {
            this.adapter.clear();
            this.composite = false;
            this.active = undefined;
            this.render();
        }
    }
}
