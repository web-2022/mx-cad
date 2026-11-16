import type {Blocks} from './block-data';
import type {Bounds3} from './mixed-types';
export function blockBounds(model:Blocks):Bounds3{
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<model.count;i++)for(let a=0;a<3;a++){let half=0;for(let k=0;k<3;k++)half+=Math.abs(model.basis[k*3+a])*model.sizes[i*3+k]/2;const p=model.positions[i*3+a];min[a]=Math.min(min[a],p-half);max[a]=Math.max(max[a],p+half);}
 return{min,max};
}
export function sharedOrigin(bounds:Bounds3[]){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const b of bounds)for(let a=0;a<3;a++){min[a]=Math.min(min[a],b.min[a]);max[a]=Math.max(max[a],b.max[a]);}if(!min.every(Number.isFinite)||!max.every(Number.isFinite))throw Error('La escena no contiene geometría espacial válida.');return min.map((v,a)=>v+(max[a]-v)/2);}
export function sceneUnit(value:unknown):string|undefined{const v=String(value??'').trim().toLowerCase();return({km:'km',kilometers:'km',kilómetros:'km',m:'m',meter:'m',meters:'m',metres:'m',metros:'m',mm:'mm',millimeters:'mm',milímetros:'mm',cm:'cm',centimeters:'cm',ft:'ft',feet:'ft',pies:'ft',in:'in',inches:'in',pulgadas:'in'} as Record<string,string>)[v];}
export function checkSceneUnits(sources:{name:string;unit?:string}[]){const known=new Set(sources.map(s=>s.unit).filter(Boolean));if(known.size>1)throw Error('Los archivos declaran unidades distintas. No se escalan ni se alinean automáticamente.');return sources.filter(s=>!s.unit).map(s=>'Unidades no declaradas: '+s.name+'. Se conservan los valores numéricos; comprueba que comparta unidades y sistema de coordenadas con los demás archivos.');}
