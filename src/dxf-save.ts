import type {ColorEdit} from './entity-edits';
import type {Shape} from './geometry';
/** Patches the original DXF stream, preserving unknown records, OBJECTS and bytes.
 * Does not reconstruct a drawing from its render geometry. */
export function patchDxf(bytes:Uint8Array,edits:Map<string,ColorEdit>,drawings:Shape[]=[],layers:{name:string;color:string;isVisible:boolean}[]=[]):Uint8Array{
  let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  if(text.startsWith('AutoCAD Binary DXF'))throw Error('Guardar DXF binario no está soportado; convierte a DXF ASCII.');
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),records:{code:number;value:string}[]=[];
  for(let i=0;i+1<lines.length;i+=2){if(!/^\s*\d+\s*$/.test(lines[i]))throw Error('DXF ASCII inválido');records.push({code:Number(lines[i]),value:lines[i+1]});}
  if(!records.some(r=>r.code===0&&r.value.trim()==='EOF'))throw Error('El convertidor no produjo un DXF completo');
  const result:typeof records=[];let section='',table='',foundEntities=false,foundLayer=false;const applied=new Set<string>();
  const add=(values:(string|number)[])=>{for(let i=0;i<values.length;i+=2)result.push({code:Number(values[i]),value:String(values[i+1])});};
  let next=1;for(const r of records)if([5,105].includes(r.code)&&/^[0-9a-f]+$/i.test(r.value.trim()))next=Math.max(next,parseInt(r.value,16)+1);
  const newHandle=()=> (next++).toString(16).toUpperCase();
  const utf=(s:string)=>{const b=new TextEncoder().encode(s);return Array.from(b,v=>String.fromCharCode(v)).join('');};
  for(let i=0;i<records.length;){const start=i++;while(i<records.length&&records[i].code!==0)i++;let block=records.slice(start,i);const type=block[0].value.trim();
    if(type==='SECTION')section=block.find(r=>r.code===2)?.value.trim()??'';
    if(type==='TABLE')table=block.find(r=>r.code===2)?.value.trim()??'';
    if(section==='TABLES'&&table==='LAYER'&&type==='ENDTAB'){
      for(const l of layers)add([0,'LAYER',5,newHandle(),100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,utf(l.name),70,0,62,l.isVisible?7:-7,420,parseInt(l.color.slice(1),16),6,'CONTINUOUS']);foundLayer=true;
    }
    if(section==='ENTITIES'&&type==='ENDSEC'){
      foundEntities=true;
      for(const s of drawings){if(s.type==='MEDICION')continue;if(!s.points.length)continue;
        const common=[5,newHandle(),100,'AcDbEntity',8,utf(s.layer)];
        if(s.closed){add([0,'POLYLINE',...common,100,'AcDb3dPolyline',66,1,10,0,20,0,30,0,70,9]);for(const p of s.points)add([0,'VERTEX',5,newHandle(),100,'AcDbEntity',8,utf(s.layer),100,'AcDbVertex',100,'AcDb3dPolylineVertex',10,p.x,20,p.y,30,p.z??0,70,32]);add([0,'SEQEND',5,newHandle(),100,'AcDbEntity',8,utf(s.layer)]);}
        else if(s.points.length===2){const [a,b]=s.points;add([0,'LINE',...common,100,'AcDbLine',10,a.x,20,a.y,30,a.z??0,11,b.x,21,b.y,31,b.z??0]);}
      }
    }
    if(['ENTITIES','BLOCKS'].includes(section)){
      const h=block.find(r=>r.code===5)?.value.trim().toUpperCase(),change=h?edits.get(h):undefined;
      if(change){block=block.filter(r=>![62,420,430].includes(r.code));const at=block.findIndex(r=>r.code===100&&r.value.trim()==='AcDbEntity');let insert=at<0?1:at+1;while(insert<block.length&&![100,102,1001].includes(block[insert].code))insert++;
        const props=[{code:62,value:change.mode==='BYBLOCK'?'0':'256'}];if(change.mode==='EXPLICIT')props.push({code:420,value:String(parseInt(change.value!.slice(1),16))});block.splice(insert,0,...props);applied.add(h!);
      }
    }
    result.push(...block);if(type==='ENDSEC')section='';if(type==='ENDTAB')table='';
  }
  if(!foundEntities)throw Error('DXF sin sección ENTITIES');
  if(layers.length&&!foundLayer)throw Error('El DXF no contiene una tabla LAYER: no se pueden añadir capas de sesión sin reconstruir el archivo. Descarga los trazos por separado.');
  for(const h of edits.keys())if(!applied.has(h))throw Error(`No se encontró la entidad ${h} en el DXF; se canceló para no perder su modificación.`);
  // Existing HANDSEED must include newly allocated handles.
  for(let i=0;i<result.length-1;i++)if(result[i].code===9&&result[i].value.trim()==='$HANDSEED')result[i+1].value=next.toString(16).toUpperCase();
  const output=result.flatMap(r=>[String(r.code),r.value]).join('\n')+'\n';return Uint8Array.from(output,c=>c.charCodeAt(0));
}
