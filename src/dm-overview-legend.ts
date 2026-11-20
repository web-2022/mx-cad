import {defaultLegend,validateLegend,type Blocks,type Legend} from './block-data.ts';
import type {DmOverview} from './datamine-sectors.ts';

export function overviewLegendModel(data:DmOverview):Blocks{
 const values=data.numeric?Float64Array.from(data.cells,c=>c.mean??NaN):data.cells.map(c=>c.mixed?null:c.category??null);
 return {columns:[{name:data.field!,numeric:!!data.numeric,unit:data.units,data:values}],
  count:data.cells.length,format:'',positions:new Float64Array(),sizes:new Float64Array(),basis:[],origin:[],units:'',warnings:[],timings:{}};
}

export function overviewDefaultLegend(data:DmOverview){
 const legend=defaultLegend(overviewLegendModel(data));
 legend.low='#2468ab';legend.high='#d5322b';legend.nullColor='#555d71';
 return legend;
}

export function equalOverviewIntervals(legend:Legend,count:number){
 if(!Number.isInteger(count)||count<2||count>12||!Number.isFinite(legend.min)||!Number.isFinite(legend.max)||legend.min>=legend.max)
  throw Error('Introduce mínimo y máximo válidos y entre 2 y 12 intervalos.');
 const colors=['#313695','#4575b4','#74add1','#abd9e9','#e0f3f8','#ffffbf','#fee090','#fdae61','#f46d43','#d73027','#a50026'];
 const edge=(i:number)=>legend.min*(1-i/count)+legend.max*(i/count);
 const entries=Array.from({length:count},(_,i)=>({
  min:edge(i),max:edge(i+1),inclusive:i===count-1,label:'',
  color:colors[Math.round(i*(colors.length-1)/(count-1))]
 }));
 if(entries.some(e=>e.min>=e.max))throw Error('La precisión del rango es insuficiente para ese número de intervalos.');
 return entries;
}

export function checkOverviewLegend(data:DmOverview,legend:Legend){
 if(legend?.field!==data.field||!data.numeric||!['continuous','intervals'].includes(legend.mode))throw Error('La leyenda no corresponde al atributo actual.');
 validateLegend(overviewLegendModel(data),legend);
 if(legend.mode==='intervals'&&(!legend.entries.length||legend.entries.length>64))throw Error('Define entre 1 y 64 intervalos.');
}
