import type {CadDocument,CadEntity} from './vendor/cad/core/types';
import type {DxfRecord} from './dxf-supplement';
export function supplementMeshes(doc:CadDocument,records:DxfRecord[]){
 const entities=[...doc.entities,...Object.values(doc.blocks).flatMap(b=>b.entities)],byHandle=new Map(entities.filter(e=>e.handle).map(e=>[e.handle!.toUpperCase(),e]));let block='';
 const val=(r:DxfRecord,c:number)=>r.pairs.find(p=>p.code===c)?.value;
 const xyz=(r:DxfRecord)=>{const out:{x:number;y:number;z:number}[]=[];for(const p of r.pairs){if(p.code===10)out.push({x:Number(p.value),y:0,z:0});else if(out.length&&p.code===20)out.at(-1)!.y=Number(p.value);else if(out.length&&p.code===30)out.at(-1)!.z=Number(p.value);}return out;};
 for(let i=0;i<records.length;i++){const r=records[i];if(r.type==='BLOCK')block=val(r,2)??'';if(r.type==='ENDBLK')block='';if(!['BLOCKS','ENTITIES'].includes(r.section))continue;
  if(r.type!=='MESH'&&!(r.type==='POLYLINE'&&(Number(val(r,70))&(16|64))))continue;
  const h=val(r,5)?.toUpperCase();let e=h?byHandle.get(h):undefined;
  if(!e){e={type:r.type,handle:h,layer:val(r,8)??'0',colorIndex:Number(val(r,62)??256),isInPaperSpace:Number(val(r,67))===1,layoutName:val(r,410),ownerBlockRecordHandle:val(r,330)};e.lineweight=Number(val(r,370)??-1);e.lineType=val(r,6);e.lineTypeScale=Number(val(r,48)??1);e.isVisible=Number(val(r,60)??0)!==1;if(val(r,440)!==undefined)e.opacity=1-(Number(val(r,440))&255)/255;if(val(r,420)!==undefined)e.trueColor=Number(val(r,420));if(block){if(!doc.blocks[block])continue;doc.blocks[block].entities.push(e);}else doc.entities.push(e);}
  const vertices:{x:number;y:number;z:number}[]=[],faces:number[][]=[];
  if(r.type==='MESH'){vertices.push(...xyz(r));const start=r.pairs.findIndex(p=>p.code===92),stream=r.pairs.slice(start+1).filter(p=>p.code===90).map(p=>Number(p.value));let at=0;while(at<stream.length){const n=stream[at++];if(!Number.isInteger(n)||n<3||at+n>stream.length){doc.warnings.push(`MESH ${h}: lista de caras inválida.`);break;}faces.push(stream.slice(at,at+n));at+=n;}}
  else {const flag=Number(val(r,70)??0);let j=i+1;for(;j<records.length&&records[j].type==='VERTEX';j++){const v=records[j],indices=[71,72,73,74].map(c=>Number(val(v,c)??0)).filter(x=>x!==0);if(indices.length)faces.push(indices.map(x=>Math.abs(x)-1));else{const p=xyz(v)[0];if(p)vertices.push(p);}}
   if(flag&16){const m=Number(val(r,71)),n=Number(val(r,72));if(m*n===vertices.length)for(let a=0;a<(flag&1?m:m-1);a++)for(let b=0;b<(flag&32?n:n-1);b++)faces.push([a*n+b,((a+1)%m)*n+b,((a+1)%m)*n+(b+1)%n,a*n+(b+1)%n]);}
   e.flag=flag;i=j-1;
  }
  e.meshVertices=vertices;e.meshFaces=faces;e.kind='solid';
 }
}
