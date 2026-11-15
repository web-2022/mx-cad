export function validateProjectView(state:any){
 if(!state||!['cad','model'].includes(state.kind)||!state.view||typeof state.view!=='object')throw Error('Vista de proyecto incompatible.');
 const v=state.view,spatial=state.kind==='model'||state.space==='3d';
 if(spatial){for(const key of ['position','target'])if(!Array.isArray(v[key])||v[key].length!==3||!v[key].every(Number.isFinite))throw Error('Cámara de proyecto no válida.');for(const k of ['zoom','near','far','left','right','top','bottom'])if(v[k]!==undefined&&!Number.isFinite(v[k]))throw Error('Cámara de proyecto no válida.');if(v.zoom!==undefined&&v.zoom<=0||v.near!==undefined&&v.near<=0||v.far!==undefined&&v.far<=v.near)throw Error('Rango de cámara no válido.');}
 else if(![v.centerX,v.centerY,v.scale].every(Number.isFinite)||v.scale<=0)throw Error('Encuadre de proyecto no válido.');
}
