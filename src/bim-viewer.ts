import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {modelFormat,resourceKey,type BimGeometry,type BimItem} from './bim-types';

export class BimViewer {
  private renderer:any;
  private camera:any;
  private scene=new T.Scene();
  private root=new T.Group();
  private orbit:any;
  private observer:ResizeObserver;
  private items:BimItem[]=[];
  private meshes=new Map<number,any[]>();
  private list:HTMLElement;
  private properties:HTMLElement;
  private filter:HTMLInputElement;
  private stage:HTMLElement;
  private helper:any;
  private pointer?:{x:number;y:number};
  readonly canvas:HTMLCanvasElement;
  constructor(privateHost:HTMLElement){
    privateHost.innerHTML='<div class="bim-stage"></div><aside class="bim-panel"><strong>Elementos del modelo</strong><input id="bim-search" placeholder="Buscar elemento…" aria-label="Buscar elemento BIM"><div id="bim-elements"></div><h3>Propiedades</h3><dl id="bim-properties"><p>Selecciona un elemento del modelo.</p></dl></aside>';
    this.stage=privateHost.querySelector('.bim-stage')!;this.list=privateHost.querySelector('#bim-elements')!;this.properties=privateHost.querySelector('#bim-properties')!;this.filter=privateHost.querySelector('#bim-search')!;
    this.renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});this.canvas=this.renderer.domElement;this.canvas.setAttribute('aria-label','Modelo 3D BIM');this.stage.append(this.canvas);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.scene.background=new T.Color('#111d31');
    this.camera=new T.PerspectiveCamera(45,1,.01,1e8);this.camera.position.set(5,4,5);
    this.orbit=new OrbitControls(this.camera,this.canvas);this.orbit.mouseButtons.MIDDLE=T.MOUSE.PAN;this.orbit.addEventListener('change',()=>this.render());
    this.scene.add(new T.HemisphereLight(0xffffff,0x596377,2.5));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(5,10,7);this.scene.add(sun);this.scene.add(this.root);
    this.filter.oninput=()=>this.renderItems();
    this.canvas.onpointerdown=e=>{this.pointer={x:e.clientX,y:e.clientY};};
    this.canvas.onpointerup=e=>{
      if(!this.pointer||Math.hypot(e.clientX-this.pointer.x,e.clientY-this.pointer.y)>4)return;
      const r=this.canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
      const hit=ray.intersectObject(this.root,true).find((h:any)=>{for(let n=h.object;n;n=n.parent)if(!n.visible)return false;return true;});
      if(hit)this.select(hit.object.userData.mxBimId);
    };
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.stage);
  }
  async load(file:File,companions:File[],signal:AbortSignal,onProgress:(message:string)=>void){
    if(modelFormat(file.name)==='ifc')await this.loadIfc(file,signal,onProgress);
    else await this.loadGltf(file,companions,signal);
    if(signal.aborted)throw new DOMException('Apertura cancelada','AbortError');
    if(!this.items.length)throw Error('El modelo no contiene geometría compatible.');
    this.root.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(this.root),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
    if(bounds.isEmpty()||![center.x,center.y,center.z,size.x,size.y,size.z].every(Number.isFinite))throw Error('El modelo tiene coordenadas o límites inválidos.');
    this.root.position.sub(center);this.root.updateMatrixWorld(true);this.renderItems();
    return{count:this.items.length,format:modelFormat(file.name).toUpperCase()};
  }
  private async loadIfc(file:File,signal:AbortSignal,progress:(s:string)=>void){
    const bytes=await file.arrayBuffer();if(signal.aborted)throw new DOMException('Cancelado','AbortError');
    await new Promise<void>((resolve,reject)=>{
      const worker=new Worker(new URL('./ifc-worker.ts',import.meta.url),{type:'module'});
      const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve();};
      const abort=()=>finish(new DOMException('Apertura cancelada','AbortError'));
      const timer=setTimeout(()=>finish(Error('El IFC tardó demasiado. Prueba un modelo más pequeño.')),180000);
      signal.addEventListener('abort',abort,{once:true});
      worker.onerror=()=>finish(Error('No se pudo procesar el IFC. Comprueba el archivo y los recursos WASM.'));
      worker.onmessage=event=>{try{
        if(event.data.type==='geometry'){
          const d=event.data.data as BimGeometry,g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(d.positions,3));g.setAttribute('normal',new T.BufferAttribute(d.normals,3));g.setIndex(new T.BufferAttribute(d.indices,1));
          const material=new T.MeshStandardMaterial({color:new T.Color(...d.color.slice(0,3)),opacity:d.color[3],transparent:d.color[3]<1,side:T.DoubleSide});
          const mesh=new T.Mesh(g,material);mesh.applyMatrix4(new T.Matrix4().fromArray(d.matrix));mesh.userData.mxBimId=d.id;this.root.add(mesh);this.meshes.set(d.id,[...(this.meshes.get(d.id)??[]),mesh]);
          if(this.root.children.length%100===0)progress(`Procesando IFC… ${this.root.children.length} partes`);
        }else if(event.data.type==='done'){this.items=event.data.items;finish();}
        else if(event.data.type==='error')finish(Error(event.data.message));
      }catch(error){finish(error instanceof Error?error:Error(String(error)));}};
      worker.postMessage({bytes,wasmPath:new URL('ifc/',document.baseURI).href},[bytes]);
    });
  }
  private async loadGltf(file:File,companions:File[],signal:AbortSignal){
    const bytes=await file.arrayBuffer();if(signal.aborted)throw new DOMException('Cancelado','AbortError');
    const manager=new T.LoadingManager(),urls=new Set<string>(),byPath=new Map<string,string>(),byName=new Map<string,string[]>();
    for(const part of companions){if(part===file)continue;const url=URL.createObjectURL(part),path=part.webkitRelativePath||part.name;urls.add(url);byPath.set(path,url);byName.set(part.name,[...(byName.get(part.name)??[]),url]);}
    manager.setURLModifier((url:string)=>{
      if(urls.has(url)||url.startsWith('blob:'))return url;
      if(/^data:(application\/(octet-stream|gltf-buffer)|image\/(png|jpeg|webp));base64,/i.test(url))return url;
      const key=resourceKey(url),matches=byName.get(key.split('/').at(-1)!);
      const local=byPath.get(key)??(matches?.length===1?matches[0]:undefined);
      if(!local)throw Error(`Falta el archivo local ${key}. Selecciona el glTF junto con sus .bin y texturas.`);return local;
    });
    try{
      const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');
      this.root.add(gltf.scene);let id=0;
      gltf.scene.traverse((object:any)=>{
        if(!object.isMesh&&!object.isLine&&!object.isPoints)return;
        const properties:Record<string,string>={};for(const [key,value]of Object.entries(object.userData??{}))properties[key]=(typeof value==='object'?JSON.stringify(value):String(value)).slice(0,2000);
        properties.Nombre=String(object.userData?.name||object.name||`Objeto ${id+1}`);object.userData.mxBimId=++id;
        this.meshes.set(id,[object]);this.items.push({id,name:properties.Nombre,type:object.type,properties});
      });
    }finally{for(const url of urls)URL.revokeObjectURL(url);}
  }
  private renderItems(){
    this.list.replaceChildren();const query=this.filter.value.toLocaleLowerCase();
    const matches=this.items.filter(i=>(i.name+' '+i.type).toLocaleLowerCase().includes(query));
    for(const item of matches.slice(0,500)){
      const row=document.createElement('div'),check=document.createElement('input'),button=document.createElement('button');row.className='bim-item';check.type='checkbox';check.checked=this.meshes.get(item.id)?.some(m=>m.visible)??false;check.setAttribute('aria-label',`Mostrar ${item.name}`);
      check.onchange=()=>{for(const mesh of this.meshes.get(item.id)??[])mesh.visible=check.checked;this.clearSelection();this.render();};
      button.textContent=item.name;button.title=item.type;button.onclick=()=>this.select(item.id);row.append(check,button);this.list.append(row);
    }
    if(matches.length>500){const p=document.createElement('p');p.textContent=`Se muestran 500 de ${matches.length}. Usa la búsqueda para encontrar otros elementos.`;this.list.append(p);}
  }
  private clearSelection(){if(this.helper){this.scene.remove(this.helper);this.helper.geometry.dispose();this.helper.material.dispose();this.helper=undefined;}}
  private select(id:number){
    const item=this.items.find(i=>i.id===id);if(!item)return;this.clearSelection();this.properties.replaceChildren();
    for(const [key,value]of Object.entries({Tipo:item.type,...item.properties})){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;row.append(dt,dd);this.properties.append(row);}
    const bounds=new T.Box3();for(const mesh of this.meshes.get(id)??[])if(mesh.visible)bounds.union(new T.Box3().setFromObject(mesh));
    if(!bounds.isEmpty()){this.helper=new T.Box3Helper(bounds,0xf9bc39);this.scene.add(this.helper);}this.render();
  }
  getState(){return {position:this.camera.position.toArray(),target:this.orbit.target.toArray(),near:this.camera.near,far:this.camera.far};}
  setState(s:{position:number[];target:number[];near:number;far:number}){this.camera.position.fromArray(s.position);this.orbit.target.fromArray(s.target);this.camera.near=s.near;this.camera.far=s.far;this.camera.updateProjectionMatrix();this.orbit.update();this.render();}
  setInteractionMode(mode:'select'|'pan'|'orbit'){this.orbit.enableRotate=mode!=='pan';this.orbit.mouseButtons.LEFT=mode==='pan'?T.MOUSE.PAN:T.MOUSE.ROTATE;}
  preset(view:string){const directions:Record<string,number[]>={top:[0,1,1e-6],front:[0,0,1],side:[1,0,0],iso:[1,.8,1]};this.fit(directions[view]);}
  zoomWindow(b:{x:number;y:number;width:number;height:number}){const w=this.stage.clientWidth,h=this.stage.clientHeight,ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((b.x+b.width/2)/w*2-1,1-(b.y+b.height/2)/h*2),this.camera);const normal=this.camera.getWorldDirection(new T.Vector3()),plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,this.orbit.target),target=ray.ray.intersectPlane(plane,new T.Vector3());if(!target)return;const offset=this.camera.position.clone().sub(this.orbit.target).multiplyScalar(1/Math.min(w/b.width,h/b.height));this.orbit.target.copy(target);this.camera.position.copy(target).add(offset);this.orbit.update();this.render();}
  fit(direction?:number[]){
    this.resize();const bounds=new T.Box3().setFromObject(this.root),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
    const radius=Math.max(size.length()/2,.001),distance=radius/Math.sin(Math.atan(Math.tan(this.camera.fov*Math.PI/360)*Math.min(this.camera.aspect,1)))*1.15;
    this.camera.near=Math.max(distance/10000,.00001);this.camera.far=Math.max(distance*100,10);this.camera.position.copy(center).add(new T.Vector3(...(direction??[1,.8,1])).normalize().multiplyScalar(distance));this.orbit.target.copy(center);this.orbit.minDistance=this.camera.near*2;this.orbit.maxDistance=this.camera.far/2;this.camera.updateProjectionMatrix();this.orbit.update();this.render();
  }
  zoom(factor:number){this.camera.position.sub(this.orbit.target).multiplyScalar(1/factor).add(this.orbit.target);this.orbit.update();this.render();}
  background(light:boolean){this.scene.background=new T.Color(light?'#f4f5f7':'#111d31');this.render();}
  resize(){const w=this.stage.clientWidth,h=this.stage.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.render();}
  escape(){this.pointer=undefined;this.clearSelection();this.properties.replaceChildren();this.render();}
  cursorPoint(clientX:number,clientY:number){const r=this.canvas.getBoundingClientRect();if(clientX<r.left||clientX>r.right||clientY<r.top||clientY>r.bottom)return;const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,1-(clientY-r.top)/r.height*2),this.camera);const hit=ray.intersectObject(this.root,true).find((h:any)=>h.object.isMesh&&h.object.visible);if(!hit)return;const p=hit.point.clone().sub(this.root.position);return {x:p.x,y:p.y,z:p.z};}
  render(){this.renderer.render(this.scene,this.camera);const inverse=this.camera.quaternion.clone().invert(),axes:any={};for(const [name,v]of [['x',[1,0,0]],['y',[0,1,0]],['z',[0,0,1]]] as const){const p=new T.Vector3(...v).applyQuaternion(inverse);axes[name]={x:p.x,y:p.y};}document.getElementById('viewport')?.dispatchEvent(new CustomEvent('mx:axes',{detail:axes}));}
  destroy(){
    this.observer.disconnect();this.orbit.dispose();this.clearSelection();
    const geometries=new Set<any>(),materials=new Set<any>(),textures=new Set<any>();this.root.traverse((o:any)=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m){materials.add(m);for(const v of Object.values(m))if((v as any)?.isTexture)textures.add(v);}});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();t.source?.data?.close?.();}this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();
  }
}
