/// <reference lib="webworker" />
import {IfcAPI} from 'web-ifc';
import type {BimGeometry,BimItem} from './bim-types';
const scope=self as DedicatedWorkerGlobalScope;
scope.onmessage=async(event:MessageEvent<{bytes:ArrayBuffer;wasmPath:string}>)=>{
  const api=new IfcAPI();let model=-1;
  try{
    api.SetWasmPath(event.data.wasmPath,true);await api.Init();
    model=api.OpenModel(new Uint8Array(event.data.bytes),{COORDINATE_TO_ORIGIN:true});
    if(model<0)throw Error('El archivo IFC no es válido o su esquema no es compatible.');
    const items=new Map<number,BimItem>();let total=0;
    api.StreamAllMeshes(model,mesh=>{
      const id=mesh.expressID;
      if(!items.has(id)){
        const line=api.GetLine(model,id),properties:Record<string,string>={};
        for(const [key,raw]of Object.entries(line??{})){
          if(key==='expressID'||key==='type'||(raw as {type?:number})?.type===5)continue;
          const value=(raw as {value?:unknown})?.value;
          if(['string','number','boolean'].includes(typeof value))properties[key]=String(value);
          else if(['string','number','boolean'].includes(typeof raw))properties[key]=String(raw);
        }
        items.set(id,{id,name:properties.Name||`Elemento #${id}`,type:api.GetNameFromTypeCode(api.GetLineType(model,id)),properties});
      }
      for(let i=0;i<mesh.geometries.size();i++){
        const placed=mesh.geometries.get(i),geo=api.GetGeometry(model,placed.geometryExpressID);
        try{
          const vertices=api.GetVertexArray(geo.GetVertexData(),geo.GetVertexDataSize()),indices=api.GetIndexArray(geo.GetIndexData(),geo.GetIndexDataSize()).slice();
          const positions=new Float32Array(vertices.length/2),normals=new Float32Array(vertices.length/2);
          for(let j=0,k=0;j<vertices.length;j+=6,k+=3){positions.set(vertices.subarray(j,j+3),k);normals.set(vertices.subarray(j+3,j+6),k);}
          const data:BimGeometry={id,positions,normals,indices,matrix:placed.flatTransformation,color:[placed.color.x,placed.color.y,placed.color.z,placed.color.w]};
          scope.postMessage({type:'geometry',data},[positions.buffer,normals.buffer,indices.buffer]);total++;
        }finally{geo.delete();}
      }
    });
    if(!total)throw Error('El IFC no contiene geometría compatible para visualizar.');
    scope.postMessage({type:'done',items:[...items.values()],schema:api.GetModelSchema(model)});
  }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
  finally{if(model>=0)api.CloseModel(model);if(api.wasmModule)api.Dispose();}
};
