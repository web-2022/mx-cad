/** Recover viewport fields omitted by the high-level converter before freeing WASM. */
export function enrichDwgViewports(raw:any,lib:any,dwg:any,types?:Record<string,number>){
 if(!types?.DWG_TYPE_VIEWPORT||typeof lib.dwg_getall_entity_by_type!=='function')return;
 const records=[...(raw.entities??[]),...(raw.tables?.BLOCK_RECORD?.entries??[]).flatMap((b:any)=>b.entities??[])];
 const handle=(n:any):string=>typeof n==='bigint'||typeof n==='number'?n.toString(16).toUpperCase():String(n??'').toUpperCase();
 try{for(const item of lib.dwg_getall_entity_by_type(dwg,types.DWG_TYPE_VIEWPORT)??[]){
   try{const object=lib.dwg_obj_generic_to_object(item),id=handle(lib.dwg_object_get_handle_object(object)?.value);
     const clipRef=lib.dwg_dynapi_entity_data(item,'clip_boundary');const clip=clipRef?lib.dwg_ref_get_absref(clipRef):undefined;
     const count=Number(lib.dwg_dynapi_entity_data(item,'num_frozen_layers'));const ptr=lib.dwg_dynapi_entity_data(item,'frozen_layers');
     const frozen=count>0&&ptr?(lib.dwg_ptr_to_object_ref_ptr_array(ptr,count)??[]).map((ref:any)=>handle(lib.dwg_ref_get_absref(ref))).filter(Boolean):[];
     for(const r of records)if(r.type==='VIEWPORT'&&handle(r.handle)===id){if(clip)r.clippingBoundaryId=handle(clip);r.frozenLayerIds=frozen;}
   }catch{/* Existing unsupported-viewport warning remains available. */}
 }}catch{/* Optional recovery is not grounds to invent missing viewport data. */}
}
