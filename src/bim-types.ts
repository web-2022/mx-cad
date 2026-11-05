export interface BimGeometry {positions:Float32Array;normals:Float32Array;indices:Uint32Array;matrix:number[];color:number[];id:number}
export interface BimItem {id:number;name:string;type:string;properties:Record<string,string>}
export function modelFormat(name:string){return name.split('.').pop()?.toLowerCase()??'';}
export function resourceKey(uri:string){
  const decoded=decodeURIComponent(uri).replace(/\\/g,'/');
  if(/^[a-z][a-z\d+.-]*:|^\/|^\/\//i.test(decoded)||decoded.split('/').includes('..'))throw Error('Las referencias externas deben ser archivos locales relativos.');
  return decoded.replace(/^\.\//,'');
}
