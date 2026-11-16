import {prepareCadOverlay} from './mixed-cad';
import {blockBounds,checkSceneUnits,sceneUnit,sharedOrigin} from './mixed-coordinates';
import type {MixedInput} from './mixed-types';
export function prepareMixed(input:MixedInput){
 if(!input.blocks.length||!input.blocks.some(b=>b.id===input.active))throw Error('Selecciona un modelo de bloques activo.');
 const units:Record<number,string>={1:'in',2:'ft',4:'mm',5:'cm',6:'m',7:'km'};
 const sources=[...input.cad.map(s=>({name:s.name,unit:units[Number(s.doc.header?.$INSUNITS??s.doc.header?.INSUNITS)]??sceneUnit(s.doc.units)})),...input.blocks.map(s=>({name:s.name,unit:sceneUnit(s.model.units)}))];
 const warnings=checkSceneUnits(sources),cad=input.cad.map(s=>({source:s,geometry:prepareCadOverlay(s.doc)}));
 for(const c of cad)if(!c.geometry.lines.length&&!c.geometry.faces.length)warnings.push(c.source.name+': no contiene geometría Model 3D compatible; revisa su archivo y Layouts individualmente.');
 const bounds=[...input.blocks.map(b=>blockBounds(b.model)),...cad.map(c=>c.geometry.bounds).filter(b=>b.min.every(Number.isFinite)&&b.max.every(Number.isFinite))];
 return{origin:sharedOrigin(bounds),warnings};
}
