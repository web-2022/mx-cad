import type {ColorEdit} from './entity-edits';
interface Pair {code:number;start:number;end:number;valueStart:number;valueEnd:number}
/** Byte-range edits preserve every unrelated byte and bound temporary storage by an entity's common prefix. */
export function patchLargeDxfColors(bytes:Uint8Array,edits:Map<string,ColorEdit>):Uint8Array{
 const ascii=(start:number,end:number)=>{let out='';for(let i=start;i<end;i++)out+=String.fromCharCode(bytes[i]);return out.trim();};
 if(ascii(0,Math.min(bytes.length,22)).startsWith('AutoCAD Binary DXF'))throw Error('Guardar DXF binario no está soportado; convierte a DXF ASCII.');
 let at=0,recordStart=0,section='',recordSection='',pendingSection=false,pendingVersion=false,foundEntities=false,foundEOF=false,version=Infinity,hasCommon=false,geometryStart=-1,handle='',lastWritten=0;
 let prefix:Pair[]=[];const patches:Uint8Array[]=[],applied=new Set<string>(),lineEnding=bytes.indexOf(13)>=0?'\r\n':'\n';
 const flush=(end:number)=>{const change=edits.get(handle);if(!change||!['ENTITIES','BLOCKS'].includes(recordSection)){prefix=[];return;}const commonEnd=geometryStart<0?end:geometryStart;const common=prefix.filter(p=>![62,420,430].includes(p.code));const acdb=common.findIndex(p=>p.code===100&&ascii(p.valueStart,p.valueEnd)==='AcDbEntity');let insert=acdb<0?Math.min(1,common.length):acdb+1;while(insert<common.length&&![100,102,1001].includes(common[insert].code))insert++;
  patches.push(bytes.subarray(lastWritten,recordStart));const text=['62',change.mode==='BYBLOCK'?'0':'256',...(change.mode==='EXPLICIT'?['420',String(parseInt(change.value!.slice(1),16))]:[])].join(lineEnding)+lineEnding,added=Uint8Array.from(text,c=>c.charCodeAt(0));for(let i=0;i<=common.length;i++){if(i===insert)patches.push(added);if(i<common.length)patches.push(bytes.subarray(common[i].start,common[i].end));}if(commonEnd<end)patches.push(bytes.subarray(commonEnd,end));lastWritten=end;applied.add(handle);prefix=[];
 };
 while(at<bytes.length){const start=at,codeEnd=bytes.indexOf(10,at);if(codeEnd<0){if(ascii(at,bytes.length))throw Error('DXF ASCII incompleto');break;}const valueStart=codeEnd+1,valueLF=bytes.indexOf(10,valueStart),end=valueLF<0?bytes.length:valueLF+1,valueEnd=valueLF<0?bytes.length:valueLF;at=end;const code=Number(ascii(start,codeEnd));if(!Number.isInteger(code)||code<0)throw Error('DXF ASCII inválido');const p:Pair={code,start,end,valueStart,valueEnd};
  if(code===0){flush(start);const type=ascii(valueStart,valueEnd);recordStart=start;recordSection=section;handle='';hasCommon=false;geometryStart=-1;prefix=[p];if(type==='SECTION')pendingSection=true;if(type==='ENDSEC'){if(section==='ENTITIES')foundEntities=true;section='';}if(type==='EOF')foundEOF=true;continue;}
  if(pendingSection&&code===2){section=ascii(valueStart,valueEnd);pendingSection=false;}
  if(pendingVersion){version=Number(ascii(valueStart,valueEnd).replace('AC',''));pendingVersion=false;}
  if(code===9&&section==='HEADER'&&ascii(valueStart,valueEnd)==='$ACADVER')pendingVersion=true;
  if(code===5&&!handle&&geometryStart<0)handle=ascii(valueStart,valueEnd).toUpperCase();
  if(code===100){const value=ascii(valueStart,valueEnd);if(value==='AcDbEntity')hasCommon=true;else if(hasCommon&&geometryStart<0)geometryStart=start;}
  if(geometryStart<0)prefix.push(p);
 }
 flush(bytes.length);
 if(!foundEOF||!foundEntities)throw Error('El convertidor no produjo un DXF completo con ENTITIES y EOF');
 if(version<1018&&[...edits.values()].some(e=>e.mode==='EXPLICIT'))throw Error('Este DXF es anterior a 2004 y no admite color RGB exacto. Usa DXF 2004 o posterior.');
 for(const h of edits.keys())if(!applied.has(h))throw Error(`No se encontró la entidad ${h} en el DXF; no se omitió su modificación.`);
 patches.push(bytes.subarray(lastWritten));const length=patches.reduce((n,p)=>n+p.length,0),output=new Uint8Array(length);let offset=0;for(const p of patches){output.set(p,offset);offset+=p.length;}return output;
}
