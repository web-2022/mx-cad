export type DraftPoint={x:number;y:number;z:number};
export type DraftEntity={id:string;type:'POINT'|'LINE';points:DraftPoint[]};
export type DraftFile={id:string;name:string;visible:boolean;entities:DraftEntity[]};
export function validateDrafts(input:unknown):DraftFile[]{
 if(!Array.isArray(input)||input.length>100)throw Error('Archivos de dibujo no válidos.');
 const ids=new Set<string>();
 return input.map((f:any)=>{if(!f||typeof f.id!=='string'||ids.has(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>255||typeof f.visible!=='boolean'||!Array.isArray(f.entities)||f.entities.length>100000)throw Error('Archivo de dibujo no válido.');ids.add(f.id);
 const entities=f.entities.map((e:any)=>{if(!e||typeof e.id!=='string'||!['POINT','LINE'].includes(e.type)||!Array.isArray(e.points)||e.points.length!==(e.type==='POINT'?1:2)||e.points.some((p:any)=>!p||![p.x,p.y,p.z].every(Number.isFinite)))throw Error('Entidad de dibujo no válida.');return{id:e.id,type:e.type,points:e.points.map((p:any)=>({x:p.x,y:p.y,z:p.z}))};});return{id:f.id,name:f.name,visible:f.visible,entities};});
}
export const draftStore={files:[] as DraftFile[]};
export function draftDxf(file:DraftFile){const out:(string|number)[]=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',0,'ENDSEC',0,'SECTION',2,'ENTITIES'];for(const e of file.entities){const[a,b]=e.points;out.push(0,e.type,8,'MX_DIBUJO',10,a.x,20,a.y,30,a.z);if(b)out.push(11,b.x,21,b.y,31,b.z);}return [...out,0,'ENDSEC',0,'EOF'].join('\n')+'\n';}
