import {surfacesFromDocument} from './cad-surfaces';
import {shapesFromDocument} from './geometry';
import {applyByBlockColorInheritance,resolveCadColor} from './vendor/cad/core/color';
import type {CadDocument} from './vendor/cad/core/types';
import type {Bounds3} from './mixed-types';
export interface CadOverlay {lines:number[];lineColors:number[];faces:number[];faceColors:number[];bounds:Bounds3;warnings:string[];lineLayers:string[];faceLayers:string[];}
const cache=new WeakMap<CadDocument,CadOverlay>(),fullCache=new WeakMap<CadDocument,CadOverlay>();
export function prepareCadOverlay(original:CadDocument,includeHidden=false):CadOverlay{
 const selectedCache=includeHidden?fullCache:cache,old=selectedCache.get(original);if(old)return old;const doc=includeHidden?{...original,layers:Object.fromEntries(Object.entries(original.layers).map(([k,l])=>[k,{...l,isVisible:true,isFrozen:false}]))}:original;
 const lineLayers:string[]=[],faceLayers:string[]=[];const lines:number[]=[],lineColors:number[]=[],faces:number[]=[],faceColors:number[]=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 const inherit=(e:any,parent:any,layer:string)=>parent?applyByBlockColorInheritance({...e,layer},parent,doc,{colorMode:'source'}):{...e,layer};
 const result=surfacesFromDocument(doc,inherit),exclude=new Set(result.surfaces.map(s=>s.entity));
 const push=(values:number[],p:{x:number;y:number;z?:number})=>{const xyz=[p.x,p.y,p.z??0];values.push(...xyz);xyz.forEach((n,a)=>{min[a]=Math.min(min[a],n);max[a]=Math.max(max[a],n);});};
 // Colors are resolved by the existing CAD color engine. CSS conversion stays in Three.js.
 for(const s of result.surfaces){const l=doc.layers[s.layer];if(s.entity.isVisible===false||l?.isVisible===false||l?.isFrozen)continue;const color=resolveCadColor(s.style,doc,{colorMode:'source'});for(const i of s.triangles){push(faces,s.points[i]);faceColors.push(colorNumber(color));faceLayers.push(s.layer);}}
 for(const s of shapesFromDocument(doc,{world3D:true,excludeEntities:exclude,style:inherit})){if(s.points.length<2)continue;const e=s.entity!,style=inherit(e,s.parentStyle,s.layer),color=colorNumber(resolveCadColor(style,doc,{colorMode:'source'}));for(let i=0;i<s.points.length-(s.closed?0:1);i++){push(lines,s.points[i]);push(lines,s.points[(i+1)%s.points.length]);lineColors.push(color,color);lineLayers.push(s.layer,s.layer);}}
 const out={lines,lineColors,faces,faceColors,lineLayers,faceLayers,bounds:{min,max},warnings:[...result.warnings,'CAD superpuesto: líneas, polilíneas y caras explícitas compatibles. No se reconstruyen superficies a partir de curvas de nivel; textos, hatch, imágenes y Layouts se consultan en el archivo individual.']};selectedCache.set(original,out);return out;
}
function colorNumber(color:string){if(/^#[0-9a-f]{6}$/i.test(color))return parseInt(color.slice(1),16);const m=color.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);return m?(Number(m[1])<<16)+(Number(m[2])<<8)+Number(m[3]):0xffffff;}
